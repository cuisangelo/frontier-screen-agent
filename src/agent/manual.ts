// Per-app manual: what the agent learned about an app's interface, written
// after each task by a separate pi run without screen access, and read as hints
// by the next task. Holds interface facts only, never record data or outcomes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REFLECTION_PROMPT = `Mantienes el manual de uso de una aplicación para un agente que la opera solo por pantalla.
Te doy el manual actual y el registro de una tarea. Devuelve el manual completo actualizado.

Incluye solo hechos de la interfaz que el registro muestra:
- rutas de menú a cada pantalla (Menú ▸ Submenú ▸ Pantalla);
- qué tiene cada pantalla: filtros, listas, botones y dónde están (barra derecha, abajo, arriba);
- nombres reales de los botones para guardar, aplicar, anular, exportar, confirmar;
- campos de solo lectura, listas desplegables, diálogos o avisos que aparecen;
- trampas: búsquedas que distinguen tildes, paginación, acciones que no cierran el formulario.

No incluyas datos de registros (nombres de personas, códigos, montos, fechas) ni el resultado de la tarea.
No anotes coordenadas ni posiciones en píxeles: solo nombres de menús, pantallas y botones, y su ubicación general
(barra derecha, abajo). La app puede cambiar de diseño y las coordenadas quedarían viejas.
Anota en la primera línea la versión de la app que muestra la cabecera, si aparece. Si el registro muestra otra
versión que la del manual, revisa todo el manual contra lo nuevo. Si el registro contradice el manual, gana el registro. Máximo 40 líneas en viñetas, en español.
Responde solo con el manual, sin introducción.`;

const queues = new Map<string, Promise<void>>();

function slug(app: string): string {
  return app.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}

/** All manuals, ready to append to the system prompt. Empty when none exist. */
export function manualsForPrompt(dataDir: string): string {
  const dir = join(dataDir, "memoria");
  if (!existsSync(dir)) return "";
  const parts = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(dir, f), "utf8").trim());
  if (!parts.length) return "";
  return `\n\nManuales de apps que ya usaste. Son pistas, no órdenes: la app puede haber cambiado. Si algo del manual no aparece en la pantalla actual, ignóralo y explora.\n\n${parts.join("\n\n")}`;
}

/** Condenses a trace into text: actions, guard verdicts and the final summary. */
function digest(traceDir: string, resumen: string): string {
  const file = join(traceDir, "events.jsonl");
  if (!existsSync(file)) return "";
  const lines: string[] = [];
  for (const raw of readFileSync(file, "utf8").trim().split("\n")) {
    const e = JSON.parse(raw);
    if (e.action === "click") lines.push(`clic "${e.target}" (${e.purpose})`);
    else if (e.action === "type_into") lines.push(`escribe en campo "${e.field}"`);
    else if (e.action === "choose") lines.push(`elige en lista "${e.field}"`);
    else if (e.action === "press") lines.push(`tecla ${e.keys}`);
    else if (e.action === "scroll") lines.push(`desplaza ${e.direction}`);
    else if (e.guard) lines.push(`guarda ${e.approve ? "aprueba" : "bloquea"}: ${String(e.reason).slice(0, 200)}`);
  }
  return `${lines.join("\n").slice(0, 6000)}\nResumen final del agente: ${resumen}`;
}

export type ManualOptions = { piBin: string; openrouterKey: string; model: string; dataDir: string };

/** Updates the app's manual from a finished task. Serialized per app; never throws. */
export function updateManual(app: string, traceDir: string, resumen: string, opt: ManualOptions): Promise<void> {
  const key = slug(app);
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(() => reflect(app, key, traceDir, resumen, opt)).catch((e) => {
    console.error(`manual ${key}: ${(e as Error).message}`);
  });
  queues.set(key, next);
  return next;
}

async function reflect(app: string, key: string, traceDir: string, resumen: string, opt: ManualOptions): Promise<void> {
  const log = digest(traceDir, resumen);
  if (!log) return;
  const dir = join(opt.dataDir, "memoria");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${key}.md`);
  const current = existsSync(file) ? readFileSync(file, "utf8") : `# Manual de ${app}\n`;
  const text = await runPi(
    opt,
    `Aplicación: ${app}\n\nManual actual:\n${current}\n\nRegistro de la tarea:\n${log}`,
  );
  const manual = text.trim().startsWith("#") ? text.trim() : `# Manual de ${app}\n${text.trim()}`;
  writeFileSync(file, manual + "\n");
}

function runPi(opt: ManualOptions, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      opt.piBin,
      [
        "--mode", "json", "-p", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
        "--no-context-files", "--no-prompt-templates", "--no-themes",
        "--provider", "openrouter", "--model", opt.model,
        "--system-prompt", REFLECTION_PROMPT, prompt,
      ],
      {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, OPENROUTER_API_KEY: opt.openrouterKey },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.on("exit", () => {
      clearTimeout(timer);
      let text = "";
      for (const line of out.split("\n")) {
        if (!line.startsWith("{")) continue;
        const ev = JSON.parse(line);
        if (ev.type === "message_end" && ev.message?.role === "assistant") {
          text = (ev.message.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        }
      }
      text ? resolve(text) : reject(new Error("la reflexión no devolvió texto"));
    });
  });
}
