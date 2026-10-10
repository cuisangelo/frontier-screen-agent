// Runs one practice task end to end on the test desktop: reset → agent → /__check.
// Logs the spend to eval/gasto.md. Usage:
//   node scripts/run-test.ts <env-file> <prueba.json> [model]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { manualsForPrompt, updateManual } from "../src/agent/manual.ts";
import { runTask } from "../src/agent/run-task.ts";

const [envFile, pruebaPath, modelArg] = process.argv.slice(2);
process.loadEnvFile(envFile);
const need = (n: string) => process.env[n] ?? (() => { throw new Error(`${n} is required`); })();
const desktop = need("DESKTOP_URL");
const password = need("DESKTOP_PASSWORD");
const desktopToken = need("DESKTOP_TOKEN");
const key = need("OPENROUTER_API_KEY");
const prueba = JSON.parse(readFileSync(pruebaPath, "utf8"));
const model = modelArg ?? "anthropic/claude-sonnet-5.5";

async function balance(): Promise<number> {
  const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
  return (await r.json()).data.limit_remaining;
}
const auth = { Authorization: `Bearer ${desktopToken}`, "Content-Type": "application/json" };

const before = await balance();
console.log(`saldo antes: $${before.toFixed(4)}`);
await fetch(`${desktop}/__reset`, { method: "POST", headers: auth });
await new Promise((r) => setTimeout(r, 4000));

const t0 = performance.now();
const res = await runTask(`local-${prueba.id}-${Date.now()}`, {
  tarea: prueba.instruccion,
  wsUrl: desktop.replace(/^http/, "ws") + "/websockify",
  password,
}, {
  piBin: process.env.PI_BIN ?? "pi",
  openrouterKey: key,
  model,
  guardModel: "anthropic/claude-haiku-5.5",
  thinking: process.env.THINKING ?? "medium",
  manual: process.env.MANUAL === "1" ? manualsForPrompt("data") : "",
  dataDir: "data",
  deadlineMs: 270_000,
  maxCostUsd: 0.5,
  secrets: [password, desktopToken, key, process.env.TEAM_TOKEN ?? ""],
});
const seconds = Math.round((performance.now() - t0) / 1000);
if (process.env.MANUAL === "1" && res.app) {
  await updateManual(res.app, res.traceDir, res.resumen, {
    piBin: process.env.PI_BIN ?? "pi", openrouterKey: key, model: "anthropic/claude-haiku-5.5", dataDir: "data",
  });
}

const check = await (await fetch(`${desktop}/__check`, { method: "POST", headers: auth, body: JSON.stringify(prueba) })).json();
const after = await balance();
const spent = before - after;

const estadoOk = res.estado === prueba.estado_esperado;
const line = res.resumen.match(/^respuesta:\s*([^\n]*)/m)?.[1] ?? "";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/\s*;\s*/g, ";").replace(/[.\s]+$/, "").trim();
const esperada: string | undefined = prueba.respuesta_esperada;
const respuestaOk = esperada === undefined
  || (/^-?\d+$/.test(esperada) ? line.match(/-?\d+/)?.[0] === esperada : norm(line) === norm(esperada));
const clavesOk = (prueba.claves_razon ?? []).every((k: string) => res.resumen.includes(k));
const secretosOk = (prueba.no_debe_contener ?? []).every((k: string) => !res.resumen.includes(k));
const pass = check.pass && estadoOk && respuestaOk && clavesOk && secretosOk;

console.log(JSON.stringify({ prueba: prueba.id, pass, check, estado: res.estado, estadoOk, respuestaOk, clavesOk, secretosOk, seconds, costPi: res.costUsd, spent, trace: res.traceDir }, null, 2));
console.log(`resumen:\n${res.resumen}`);

if (!existsSync("eval/gasto.md")) writeFileSync("eval/gasto.md", "| Fecha | Qué | Modelo | Costo | Saldo |\n| --- | --- | --- | --- | --- |\n");
appendFileSync("eval/gasto.md", `| ${new Date().toISOString()} | ${basename(pruebaPath)} (${pass ? "pasa" : "falla"}, ${seconds}s) | ${model} (${process.env.THINKING ?? "medium"}) | $${spent.toFixed(4)} | $${after.toFixed(2)} |\n`);
