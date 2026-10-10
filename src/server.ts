// HTTP entrypoint with the challenge contract:
//   GET /health, POST /tasks, GET /tasks/{task_id} — all but /health need the team token.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { runTask } from "./agent/run-task.ts";

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
const VIEWER_TOKEN = required("VIEWER_TOKEN");
const PANEL_HTML = readFileSync(join(import.meta.dirname, "panel/index.html"));

type Estado = "en_curso" | "terminada" | "fallida";
type Task = { estado: Estado; resumen: string; createdAt: string; tarea: string; costUsd?: number };

const TASKS_DIR = join(DATA_DIR, "tasks");
mkdirSync(TASKS_DIR, { recursive: true });
const tasks = new Map<string, Task>();
const running = new Map<string, AbortController>(); // desktop url → running task

// A restart kills running agents: their tasks can only be reported as failed.
for (const f of readdirSync(TASKS_DIR)) {
  const t = JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8")) as Task;
  if (t.estado === "en_curso") t.estado = "fallida", t.resumen = "El servicio se reinició durante la tarea.";
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

function panelRoute(req: IncomingMessage, res: ServerResponse, url: URL): void {
  const path = url.pathname;
  if (path === "/panel") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PANEL_HTML);
    return;
  }
  if (!viewer(req, url)) return send(res, 401, { error: "unauthorized" });
  if (path === "/panel/api/tasks") {
    const list = [...tasks.entries()].map(([id, t]) => {
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
  if (detail && tasks.has(detail[1])) {
    return send(res, 200, { id: detail[1], ...tasks.get(detail[1]), events: readEvents(detail[1]) });
  }
  const shot = path.match(/^\/panel\/api\/tasks\/([\w-]+)\/shot\/(\d{3}\.png)$/);
  if (shot && tasks.has(shot[1])) {
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
    dataDir: DATA_DIR,
    deadlineMs: 270_000,
    maxCostUsd: 0.5,
    secrets: [password, TEAM_TOKEN, OPENROUTER_API_KEY],
    signal: ctl.signal,
  })
    .then((r) => save(id, { ...tasks.get(id)!, estado: r.estado, resumen: r.resumen, costUsd: r.costUsd }))
    .catch((e: Error) => save(id, { ...tasks.get(id)!, estado: "fallida", resumen: `Error interno: ${e.message}` }))
    .finally(() => {
      if (running.get(url) === ctl) running.delete(url);
    });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname;
  try {
    if (req.method === "GET" && path.startsWith("/panel")) return panelRoute(req, res, url);
    if (req.method === "GET" && path === "/health") {
      return send(res, existsSync(PI_BIN) ? 200 : 503, { ok: existsSync(PI_BIN) });
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
      save(id, { estado: "en_curso", resumen: "", createdAt: new Date().toISOString(), tarea });
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
