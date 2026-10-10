// Runs one task in its own pi process. The process is killed before the final
// state is published, so nothing can act on the desktop after the report.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const EXTENSION = join(ROOT, "src/agent/extension.ts");
const SYSTEM_PROMPT = readFileSync(join(ROOT, "src/agent/system-prompt.md"), "utf8");

export type TaskInput = { tarea: string; wsUrl: string; password: string };
export type TaskResult = { estado: "terminada" | "fallida"; resumen: string; costUsd: number; traceDir: string; app: string | null };

export type RunOptions = {
  piBin: string;
  openrouterKey: string;
  model: string;
  guardModel: string;
  thinking: string;
  /** Manuals of known apps, appended to the system prompt as hints. */
  manual: string;
  dataDir: string;
  deadlineMs: number;
  maxCostUsd: number;
  /** Strings that must never appear in a summary. */
  secrets: string[];
  /** Aborting stops the agent, e.g. when a new task arrives for the same desktop. */
  signal?: AbortSignal;
};

export async function runTask(id: string, input: TaskInput, opt: RunOptions): Promise<TaskResult> {
  const traceDir = join(opt.dataDir, "traces", id);
  mkdirSync(traceDir, { recursive: true });
  const resultFile = join(traceDir, "result.json");

  const child = spawn(
    opt.piBin,
    [
      "--mode", "json", "-p", "--no-session",
      "--no-builtin-tools", "--no-extensions", "--no-skills", "--no-context-files",
      "--no-prompt-templates", "--no-themes",
      "-e", EXTENSION,
      "--provider", "openrouter", "--model", opt.model, "--thinking", opt.thinking,
      "--system-prompt", SYSTEM_PROMPT + opt.manual,
      `Tarea: ${input.tarea}`,
    ],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        OPENROUTER_API_KEY: opt.openrouterKey,
        NODE_OPTIONS: "--openssl-legacy-provider",
        DESKTOP_WS_URL: input.wsUrl,
        DESKTOP_PASSWORD: input.password,
        AGENT_TASK: input.tarea,
        AGENT_RESULT_FILE: resultFile,
        AGENT_TRACE_DIR: traceDir,
        AGENT_GUARD_MODEL: opt.guardModel,
        AGENT_DEADLINE: String(Date.now() + opt.deadlineMs - 15_000),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let costUsd = 0;
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      costUsd += messageCost(line);
    }
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => (stderr = (stderr + c).slice(-4000)));
  const exited = new Promise<void>((r) => child.on("exit", () => r()));

  const started = performance.now();
  let reason: string | null = null;
  for (;;) {
    if (existsSync(resultFile)) break;
    if (child.exitCode !== null) {
      reason = `el agente terminó sin reportar${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`;
      break;
    }
    if (performance.now() - started >= opt.deadlineMs) {
      reason = "se acabó el tiempo de la tarea";
      break;
    }
    if (opt.signal?.aborted) {
      reason = String(opt.signal.reason ?? "la tarea fue cancelada");
      break;
    }
    if (costUsd >= opt.maxCostUsd) {
      reason = `la tarea superó el tope de costo ($${opt.maxCostUsd})`;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Stop the agent before publishing anything.
  child.kill("SIGKILL");
  await exited;

  let estado: TaskResult["estado"] = "fallida";
  let app: string | null = null;
  let resumen = `No terminó: ${reason}.`;
  if (existsSync(resultFile)) {
    const r = JSON.parse(readFileSync(resultFile, "utf8")) as { estado: string; app?: string; respuesta?: string; resumen: string };
    app = r.app ?? null;
    estado = r.estado === "terminada" ? "terminada" : "fallida";
    resumen = composeSummary(r);
  }
  return { estado, resumen: redact(resumen, opt.secrets), costUsd, traceDir, app };
}

/** The evaluator reads the first number of the `respuesta:` line, so it goes first and alone. */
function composeSummary(r: { respuesta?: string; resumen: string }): string {
  const lines: string[] = [];
  if (r.respuesta && r.respuesta.trim()) lines.push(`respuesta: ${r.respuesta.trim()}`);
  lines.push(r.resumen.trim());
  return lines.join("\n");
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[oculto]");
  return out;
}

function messageCost(line: string): number {
  if (!line.startsWith("{")) return 0;
  try {
    const ev = JSON.parse(line);
    if (ev.type === "message_end" && ev.message?.role === "assistant") return ev.message.usage?.cost?.total ?? 0;
  } catch {
    // pi emits only JSON lines; a partial or foreign line carries no cost.
  }
  return 0;
}
