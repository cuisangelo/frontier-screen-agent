// HTTP entrypoint with the challenge contract:
//   GET /health, POST /tasks, GET /tasks/{task_id} — all but /health need the team token.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { manualsForPrompt, updateManual } from "./agent/manual.ts";
import { runTask } from "./agent/run-task.ts";
import { LiveView, loadBench, resetDesktop, RunQuota } from "./demo.ts";

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};

const TEAM_TOKEN = required("TEAM_TOKEN");
const OPENROUTER_API_KEY = required("OPENROUTER_API_KEY");
const PORT = Number(required("PORT"));
const DATA_DIR = required("DATA_DIR");
const PI_BIN = required("PI_BIN");
const AGENT_MODEL = required("AGENT_MODEL");
const GUARD_MODEL = required("GUARD_MODEL");
const AGENT_THINKING = required("AGENT_THINKING");
const VIEWER_TOKEN = required("VIEWER_TOKEN");
const AGENT_VERSION = `${process.env.AGENT_VERSION ?? "dev"} · ${AGENT_MODEL} · ${AGENT_THINKING}`;
// Demo mode: public read-only panel plus runs of the practice bench, capped at this many in total.
const DEMO_MAX_RUNS = Number(process.env.DEMO_MAX_RUNS ?? 0);
const demo = DEMO_MAX_RUNS > 0
  ? (() => {
      const desktopUrl = required("DESKTOP_URL");
      const password = required("DESKTOP_PASSWORD");
      const wsUrl = desktopUrl.replace(/^http/, "ws") + "/websockify";
      return {
        desktopUrl, password, wsUrl, token: required("DESKTOP_TOKEN"),
        bench: loadBench(join(import.meta.dirname, "../material")),
        quota: new RunQuota(required("DATA_DIR"), DEMO_MAX_RUNS),
        live: new LiveView(wsUrl, password),
      };
    })()
  : null;
const PANEL_HTML = readFileSync(join(import.meta.dirname, "panel/index.html"));

type Estado = "en_curso" | "terminada" | "fallida";
type Task = {
  estado: Estado;
  resumen: string;
  createdAt: string;
  tarea: string;
  costUsd?: number;
  stopReason?: string;
  error?: string | null;
  version?: string;
};

const TASKS_DIR = join(DATA_DIR, "tasks");
mkdirSync(TASKS_DIR, { recursive: true });
const tasks = new Map<string, Task>();
const running = new Map<string, AbortController>(); // desktop url → running task

// A restart kills running agents: their tasks can only be reported as failed.
for (const f of readdirSync(TASKS_DIR)) {
  const t = JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8")) as Task;
  // Only the agent process owns task records; the read-only panel just reports them.
  if (t.estado === "en_curso" && process.env.READ_ONLY !== "1") {
    t.estado = "fallida";
    t.resumen = "El servicio se reinició durante la tarea.";
    t.stopReason = "reinicio";
    writeFileSync(join(TASKS_DIR, f), JSON.stringify(t));
  }
  tasks.set(f.replace(/\.json$/, ""), t);
}

function save(id: string, t: Task): void {
  tasks.set(id, t);
  writeFileSync(join(TASKS_DIR, `${id}.json`), JSON.stringify(t));
}

function authorized(req: IncomingMessage): boolean {
  const got = Buffer.from(req.headers.authorization ?? "");
  const want = Buffer.from(`Bearer ${TEAM_TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Read-only panel access: header for API calls, query string for <img> tags. */
function viewer(req: IncomingMessage, url: URL): boolean {
  if (demo) return true; // the demo only ever holds practice-app tasks
  const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? url.searchParams.get("token") ?? "";
  const got = Buffer.from(supplied);
  const want = Buffer.from(VIEWER_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

function readEvents(id: string): Record<string, unknown>[] {
  const file = join(DATA_DIR, "traces", id, "events.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Task records straight from disk, so a read-only panel process sees live data. */
function storedTasks(): Map<string, Task> {
  const out = new Map<string, Task>();
  for (const f of readdirSync(TASKS_DIR)) {
    out.set(f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8")) as Task);
  }
  return out;
}

/** The model's own messages for a task: thinking, text and tool calls, in order. */
function readReasoning(id: string): { kind: string; text: string }[] {
  const file = join(DATA_DIR, "traces", id, "pi.jsonl");
  if (!existsSync(file)) return [];
  const out: { kind: string; text: string }[] = [];
  for (const line of readFileSync(file, "utf8").trim().split("\n").filter(Boolean)) {
    const ev = JSON.parse(line);
    if (ev.type !== "message_end" || ev.message?.role !== "assistant") continue;
    for (const c of ev.message.content ?? []) {
      if (c.type === "thinking" && c.thinking) out.push({ kind: "piensa", text: c.thinking });
      else if (c.type === "text" && c.text) out.push({ kind: "dice", text: c.text });
      else if (c.type === "toolCall") out.push({ kind: "usa", text: `${c.name} ${JSON.stringify(c.arguments)}` });
    }
  }
  return out;
}

function panelRoute(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const path = url.pathname;
  if (path === "/panel") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PANEL_HTML);
    return;
  }
  if (!viewer(req, url)) return send(res, 401, { error: "unauthorized" });
  const stored = storedTasks();
  if (path === "/panel/api/tasks") {
    const list = [...stored.entries()].map(([id, t]) => {
      const ev = readEvents(id);
      const first = ev[0]?.at as string | undefined;
      const last = ev.at(-1)?.at as string | undefined;
      return {
        id, ...t,
        actions: ev.filter((e) => "action" in e).length,
        guardBlocks: ev.filter((e) => "guard" in e && !e.approve).length,
        seconds: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 1000) : null,
      };
    });
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return send(res, 200, list);
  }
  const detail = path.match(/^\/panel\/api\/tasks\/([\w-]+)$/);
  if (detail && stored.has(detail[1])) {
    return send(res, 200, { id: detail[1], ...stored.get(detail[1]), events: readEvents(detail[1]) });
  }
  const reasoning = path.match(/^\/panel\/api\/tasks\/([\w-]+)\/reasoning$/);
  if (reasoning && stored.has(reasoning[1])) return send(res, 200, readReasoning(reasoning[1]));
  const shot = path.match(/^\/panel\/api\/tasks\/([\w-]+)\/shot\/(\d{3}\.png)$/);
  if (shot && stored.has(shot[1])) {
    const file = join(DATA_DIR, "traces", shot[1], shot[2]);
    if (existsSync(file)) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" });
      res.end(readFileSync(file));
      return;
    }
  }
  send(res, 404, { error: "not found" });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function startTask(id: string, tarea: string, url: string, password: string): void {
  running.get(url)?.abort("llegó otra tarea para el mismo escritorio");
  const ctl = new AbortController();
  running.set(url, ctl);
  runTask(id, { tarea, wsUrl: url, password }, {
    piBin: PI_BIN,
    openrouterKey: OPENROUTER_API_KEY,
    model: AGENT_MODEL,
    guardModel: GUARD_MODEL,
    thinking: AGENT_THINKING,
    manual: manualsForPrompt(DATA_DIR),
    dataDir: DATA_DIR,
    deadlineMs: 285_000, // the evaluator stops polling at 300 s; the process is killed before that
    maxCostUsd: 0.5,
    secrets: [password, TEAM_TOKEN, OPENROUTER_API_KEY],
    signal: ctl.signal,
  })
    .then((r) => {
      save(id, { ...tasks.get(id)!, estado: r.estado, resumen: r.resumen, costUsd: r.costUsd, stopReason: r.stopReason, error: r.error });
      if (r.app) {
        updateManual(r.app, r.traceDir, r.resumen, {
          piBin: PI_BIN, openrouterKey: OPENROUTER_API_KEY, model: GUARD_MODEL, dataDir: DATA_DIR,
        });
      }
    })
    .catch((e: Error) => save(id, { ...tasks.get(id)!, estado: "fallida", resumen: "Error interno del servicio.", stopReason: "error_interno", error: e.stack ?? e.message }))
    .finally(() => {
      if (running.get(url) === ctl) running.delete(url);
    });
}

/** Demo routes, served under /demo by the proxy. Returns false when the path is not a demo route. */
async function demoRoute(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (!demo) return false;
  if (req.method === "GET" && (path === "/" || path === "")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PANEL_HTML);
    return true;
  }
  if (req.method === "GET" && path === "/api/bench") {
    send(res, 200, { tareas: demo.bench, usadas: demo.quota.used, maximo: demo.quota.max, corriendo: running.size > 0 });
    return true;
  }
  if (req.method === "GET" && path === "/api/live.png") {
    try {
      const png = await demo.live.png();
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(png);
    } catch {
      send(res, 503, { error: "escritorio no disponible" });
    }
    return true;
  }
  if (req.method === "POST" && path === "/api/run") {
    const body = (await readJson(req)) as { prueba?: unknown };
    const pick = body.prueba === "azar" || body.prueba == null
      ? demo.bench[Math.floor(Math.random() * demo.bench.length)]
      : demo.bench.find((b) => b.id === body.prueba);
    if (!pick) {
      send(res, 400, { error: "prueba desconocida" });
      return true;
    }
    if (running.size > 0) {
      send(res, 409, { error: "ya hay una tarea corriendo" });
      return true;
    }
    if (!demo.quota.take()) {
      send(res, 429, { error: "se agotaron las corridas de la demo" });
      return true;
    }
    const id = randomUUID();
    save(id, { estado: "en_curso", resumen: "", createdAt: new Date().toISOString(), tarea: pick.instruccion, version: AGENT_VERSION });
    send(res, 200, { task_id: id, prueba: pick.id });
    // Reserve the desktop before the reset so a second click gets 409 instead of a parallel run.
    const hold = new AbortController();
    running.set(demo.wsUrl, hold);
    resetDesktop(demo.desktopUrl, demo.token)
      .then(() => {
        if (running.get(demo.wsUrl) === hold) running.delete(demo.wsUrl);
        startTask(id, pick.instruccion, demo.wsUrl, demo.password);
      })
      .catch((e: Error) => {
        running.delete(demo.wsUrl);
        save(id, { ...tasks.get(id)!, estado: "fallida", resumen: "No se pudo reiniciar el escritorio de práctica.", stopReason: "error_interno", error: e.message });
      });
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname;
  try {
    if (req.method === "GET" && path.startsWith("/panel")) return panelRoute(req, res, url);
    if (req.method === "GET" && path === "/health") {
      return send(res, existsSync(PI_BIN) ? 200 : 503, { ok: existsSync(PI_BIN) });
    }
    if (demo) {
      const handled = await demoRoute(req, res, path);
      if (handled) return;
    }
    if (req.method === "GET" && path === "/") {
      return send(res, 200, {
        servicio: "Operador: una API sobre la pantalla (Reto 1, Frontier)",
        endpoints: ["GET /health", "POST /tasks", "GET /tasks/{task_id}"],
        auth: "Authorization: Bearer <token del equipo> en /tasks",
        diseno: "https://frontier.cuisangelo.com/system-design",
      });
    }
    if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "POST" && path === "/tasks") {
      const body = (await readJson(req)) as { tarea?: unknown; escritorio?: { url?: unknown; password?: unknown } };
      const { tarea, escritorio } = body;
      if (typeof tarea !== "string" || !tarea.trim()) return send(res, 400, { error: "tarea is required" });
      if (typeof escritorio?.url !== "string" || typeof escritorio?.password !== "string") {
        return send(res, 400, { error: "escritorio.url and escritorio.password are required" });
      }
      const id = randomUUID();
      save(id, { estado: "en_curso", resumen: "", createdAt: new Date().toISOString(), tarea, version: AGENT_VERSION });
      send(res, 200, { task_id: id });
      startTask(id, tarea, escritorio.url, escritorio.password);
      return;
    }

    const m = path.match(/^\/tasks\/([\w-]+)$/);
    if (req.method === "GET" && m) {
      const t = tasks.get(m[1]);
      return t ? send(res, 200, { estado: t.estado, resumen: t.resumen }) : send(res, 404, { error: "unknown task_id" });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: (e as Error).message });
  }
});

server.listen(PORT, () => console.log(`listening on :${PORT}`));
