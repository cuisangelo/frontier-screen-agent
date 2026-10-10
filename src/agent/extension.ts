// pi extension: screen tools over VNC, a commit guard on tool calls, and a
// finish tool that hands the structured result back to the server.
// Configuration comes from the environment so secrets never enter the prompt.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, uuidv7 } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Screen } from "../vnc/screen.ts";

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};

const WS_URL = env("DESKTOP_WS_URL");
const PASSWORD = env("DESKTOP_PASSWORD");
const TASK = env("AGENT_TASK");
const RESULT_FILE = env("AGENT_RESULT_FILE");
const TRACE_DIR = env("AGENT_TRACE_DIR");
const GUARD_MODEL = process.env.AGENT_GUARD_MODEL ?? "anthropic/claude-haiku-5.5";

const COMMIT_WORDS = /\b(guardar|grabar|aceptar|confirmar|eliminar|borrar|exportar|enviar|aplicar|registrar|crear|actualizar|anular|s[ií]|ok)\b/i;
const MAX_GUARD_BLOCKS = 3;

mkdirSync(TRACE_DIR, { recursive: true });
let step = 0;
let screen: Screen | null = null;
let finished = false;
let guardBlocks = 0;

function trace(event: Record<string, unknown>, png?: Buffer): void {
  step++;
  const entry: Record<string, unknown> = { step, at: new Date().toISOString(), ...event };
  if (png) {
    const file = `${String(step).padStart(3, "0")}.png`;
    writeFileSync(join(TRACE_DIR, file), png);
    entry.screenshot = file;
  }
  appendFileSync(join(TRACE_DIR, "events.jsonl"), JSON.stringify(entry) + "\n");
}

/** Opens the VNC session, reopening it if the connection dropped. */
async function getScreen(): Promise<Screen> {
  if (!screen || screen.vnc.closed) {
    if (screen) trace({ reconnect: true });
    screen = await Screen.open(WS_URL, PASSWORD);
  }
  return screen;
}

/** Runs an action; if the connection drops mid-action, the model must look before retrying. */
async function act<T>(name: string, fn: (s: Screen) => Promise<T>): Promise<T> {
  const s = await getScreen();
  try {
    return await fn(s);
  } catch (e) {
    if (!s.vnc.closed) throw e;
    throw new Error(`Se perdió la conexión con el escritorio durante "${name}". Llama a observe antes de repetir: la acción pudo haberse aplicado.`);
  }
}

async function observation(note: string) {
  const s = await getScreen();
  const png = s.png();
  trace({ observation: note }, png);
  return {
    content: [
      { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
      { type: "text" as const, text: `${note}\nPantalla ${s.width}x${s.height}. Coordenadas en píxeles de esta imagen.` },
    ],
    details: { step },
  };
}

const observe = defineTool({
  name: "observe",
  executionMode: "sequential",
  label: "Observe",
  description: "Captura la pantalla actual del escritorio. Úsala al empezar y cuando no estés seguro de qué hay en pantalla.",
  parameters: Type.Object({}),
  async execute() {
    return observation("Pantalla actual.");
  },
});

const click = defineTool({
  name: "click",
  executionMode: "sequential",
  label: "Click",
  description:
    "Hace clic en (x, y) y devuelve la pantalla resultante. 'target' es el texto visible o la descripción de lo que clicas. " +
    "'purpose' es 'commit' si el clic guarda, confirma, elimina o exporta algo; 'edit' si enfoca un campo; 'navigate' para menús, enlaces, pestañas o búsquedas.",
  parameters: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    target: Type.String({ description: "Texto visible o descripción del elemento" }),
    purpose: Type.Union([Type.Literal("navigate"), Type.Literal("edit"), Type.Literal("commit")]),
    double: Type.Optional(Type.Boolean()),
  }),
  async execute(_id, p) {
    await act("click", (s) => s.click(p.x, p.y, { double: p.double }));
    trace({ action: "click", ...p });
    return observation(`Clic en (${p.x}, ${p.y}) sobre "${p.target}".`);
  },
});

const typeInto = defineTool({
  name: "type_into",
  executionMode: "sequential",
  label: "Type into field",
  description:
    "Reemplaza el contenido de un campo: hace clic en (x, y), selecciona todo y escribe 'text'. Devuelve la pantalla. Relee el campo en la imagen para confirmar.",
  parameters: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    field: Type.String({ description: "Nombre del campo" }),
    text: Type.String(),
  }),
  async execute(_id, p) {
    await act("type_into", (s) => s.typeInto(p.x, p.y, p.text));
    trace({ action: "type_into", x: p.x, y: p.y, field: p.field, text: p.text });
    return observation(`Escrito "${p.text}" en "${p.field}".`);
  },
});

const press = defineTool({
  name: "press",
  executionMode: "sequential",
  label: "Press keys",
  description: "Presiona una tecla o combinación: 'enter', 'tab', 'escape', 'pagedown', 'ctrl+a'. Devuelve la pantalla.",
  parameters: Type.Object({ keys: Type.String() }),
  async execute(_id, p) {
    await act("press", (s) => s.press(p.keys));
    trace({ action: "press", keys: p.keys });
    return observation(`Presionado ${p.keys}.`);
  },
});

const scroll = defineTool({
  name: "scroll",
  executionMode: "sequential",
  label: "Scroll",
  description: "Desplaza con la rueda del mouse en (x, y). Devuelve la pantalla.",
  parameters: Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    direction: Type.Union([Type.Literal("up"), Type.Literal("down")]),
    steps: Type.Optional(Type.Number()),
  }),
  async execute(_id, p) {
    await act("scroll", (s) => s.scroll(p.x, p.y, p.direction, p.steps ?? 3));
    trace({ action: "scroll", ...p });
    return observation(`Desplazado ${p.direction}.`);
  },
});

const finish = defineTool({
  name: "finish",
  executionMode: "sequential",
  label: "Finish",
  description:
    "Termina la tarea. Llámala una sola vez. 'terminada' solo si verificaste en pantalla que el cambio quedó o leíste la respuesta. " +
    "'respuesta' solo en preguntas: el valor pedido (si son dos datos, 'dato1; dato2'). 'resumen': qué hiciste o, si falla, los datos que explican por qué.",
  parameters: Type.Object({
    estado: Type.Union([Type.Literal("terminada"), Type.Literal("fallida")]),
    respuesta: Type.Optional(Type.String()),
    resumen: Type.String(),
  }),
  async execute(_id, p) {
    finished = true;
    writeFileSync(RESULT_FILE, JSON.stringify(p));
    trace({ action: "finish", ...p });
    screen?.close();
    return { content: [{ type: "text" as const, text: "Reportado. No hagas nada más." }], details: {} };
  },
});

/** Asks a second model whether a state-changing action does exactly what the task asks. Fails closed. */
async function guardVerdict(ctx: any, action: string): Promise<{ approve: boolean; reason: string }> {
  const model = ctx.modelRegistry.find("openrouter", GUARD_MODEL);
  if (!model) return { approve: false, reason: `modelo de la guarda no disponible: ${GUARD_MODEL}` };
  const png = (await getScreen()).png();
  const prompt =
    `Eres un supervisor. Un agente opera una aplicación por pantalla.\n` +
    `Tarea original: """${TASK}"""\n` +
    `Acción que quiere hacer ahora: ${action}\n\n` +
    `Mira la pantalla. ¿Hacer esta acción ahora deja exactamente lo que pide la tarea y nada más? ` +
    `Rechaza si cambiaría datos que la tarea no pidió, si los valores en pantalla no coinciden con la tarea, ` +
    `si podría crear un duplicado, o si afecta a un registro distinto o ambiguo.\n` +
    `Responde solo JSON: {"aprobar": true|false, "razon": "..."}`;
  try {
    const res = await ctx.modelRegistry.complete(
      model,
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "image", data: png.toString("base64"), mimeType: "image/png" },
              { type: "text", text: prompt },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      { cacheRetention: "none", sessionId: uuidv7() },
    );
    const text = res.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { approve: json.aprobar === true, reason: String(json.razon ?? "") };
  } catch (e) {
    return { approve: false, reason: `la guarda no pudo decidir: ${(e as Error).message}` };
  }
}

function needsGuard(toolName: string, input: Record<string, unknown>): string | null {
  if (toolName === "click") {
    const target = String(input.target ?? "");
    if (input.purpose === "commit" || COMMIT_WORDS.test(target)) {
      return `clic en (${input.x}, ${input.y}) sobre "${target}"`;
    }
  }
  if (toolName === "press" && /enter|return/i.test(String(input.keys ?? ""))) {
    return `presionar ${input.keys} (puede enviar un formulario)`;
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  for (const tool of [observe, click, typeInto, press, scroll, finish]) pi.registerTool(tool);

  pi.on("tool_call", async (event, ctx) => {
    if (finished) return { block: true, reason: "La tarea ya fue reportada. No hagas nada más." };
    const action = needsGuard(event.toolName, event.input as Record<string, unknown>);
    if (!action) return undefined;
    const verdict = await guardVerdict(ctx, action);
    trace({ guard: action, approve: verdict.approve, reason: verdict.reason });
    if (verdict.approve) return undefined;
    guardBlocks++;
    const stop = guardBlocks >= MAX_GUARD_BLOCKS
      ? " Ya van tres bloqueos: llama a finish con estado 'fallida' y explica por qué."
      : " Corrige lo necesario o termina con 'fallida' si no se puede hacer exactamente.";
    return { block: true, reason: `La guarda bloqueó la acción: ${verdict.reason}.${stop}` };
  });
}
