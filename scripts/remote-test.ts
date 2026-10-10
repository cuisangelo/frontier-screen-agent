// End-to-end check through the deployed entrypoint, polling like the evaluator does.
// Usage: node scripts/remote-test.ts <env-file> <entrypoint-base-url> <prueba.json>
import { readFileSync } from "node:fs";

const [envFile, base, pruebaPath] = process.argv.slice(2);
process.loadEnvFile(envFile);
const need = (n: string) => process.env[n] ?? (() => { throw new Error(`${n} is required`); })();
const desktop = need("DESKTOP_URL");
const team = { Authorization: `Bearer ${need("TEAM_TOKEN")}`, "Content-Type": "application/json" };
const desk = { Authorization: `Bearer ${need("DESKTOP_TOKEN")}`, "Content-Type": "application/json" };
const prueba = JSON.parse(readFileSync(pruebaPath, "utf8"));

await fetch(`${desktop}/__reset`, { method: "POST", headers: desk });
await new Promise((r) => setTimeout(r, 4000));

const t0 = performance.now();
const post = await fetch(`${base}/tasks`, {
  method: "POST",
  headers: team,
  body: JSON.stringify({
    tarea: prueba.instruccion,
    escritorio: { url: desktop.replace(/^http/, "ws") + "/websockify", password: need("DESKTOP_PASSWORD") },
  }),
});
const postMs = Math.round(performance.now() - t0);
const { task_id } = await post.json();
console.log(`POST /tasks → ${post.status} en ${postMs} ms, task_id ${task_id}`);

let state: { estado: string; resumen: string };
do {
  await new Promise((r) => setTimeout(r, 5000));
  state = await (await fetch(`${base}/tasks/${task_id}`, { headers: team })).json();
} while (state.estado === "en_curso" && performance.now() - t0 < 300_000);

const check = await (await fetch(`${desktop}/__check`, { method: "POST", headers: desk, body: JSON.stringify(prueba) })).json();
console.log(JSON.stringify({ estado: state.estado, esperado: prueba.estado_esperado, check: check.pass, seconds: Math.round((performance.now() - t0) / 1000) }));
console.log(`resumen:\n${state.resumen}`);
