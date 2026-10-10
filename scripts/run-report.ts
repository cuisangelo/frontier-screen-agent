// Markdown report of one evaluation run from pulled server data: totals, failures
// grouped by why the agent stopped, guard blocks, and every task with its summary.
// The platform only reports a total, so this is where individual failures show up.
// Usage: node scripts/run-report.ts <data-dir> <since ISO> [until ISO] > data/report.md
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dataDir, since, until = "9999"] = process.argv.slice(2);
if (!dataDir || !since) throw new Error("usage: run-report.ts <data-dir> <since ISO> [until ISO]");

type Task = {
  id: string; estado: string; resumen: string; createdAt: string; tarea?: string;
  costUsd?: number; stopReason?: string; error?: string | null; version?: string;
};
type Event = { at: string; action?: string; guard?: string; approve?: boolean; reason?: string };

const tasks: Task[] = readdirSync(join(dataDir, "tasks"))
  .map((f) => ({ id: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(dataDir, "tasks", f), "utf8")) }))
  .filter((t) => t.createdAt >= since && t.createdAt < until)
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

function events(id: string): Event[] {
  const f = join(dataDir, "traces", id, "events.jsonl");
  return existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

const rows = tasks.map((t) => {
  const ev = events(t.id);
  const secs = ev.length > 1 ? Math.round((Date.parse(ev.at(-1)!.at) - Date.parse(ev[0].at)) / 1000) : 0;
  return {
    t, secs,
    actions: ev.filter((e) => e.action).length,
    blocks: ev.filter((e) => e.guard && !e.approve),
  };
});

const one = (s: string) => s.replace(/\s+/g, " ").trim();
const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}));
const cost = rows.reduce((s, r) => s + (r.t.costUsd ?? 0), 0);

console.log(`# Corrida desde ${since}\n`);
console.log(`- Tareas: ${rows.length}`);
for (const [k, v] of count(rows.map((r) => r.t.estado))) console.log(`- ${k}: ${v}`);
console.log(`- Costo del agente: $${cost.toFixed(2)} ($${(cost / Math.max(rows.length, 1)).toFixed(3)} por tarea)`);
console.log(`- Tiempo promedio: ${Math.round(rows.reduce((s, r) => s + r.secs, 0) / Math.max(rows.length, 1))} s`);
console.log(`- Versiones: ${count(rows.map((r) => r.t.version ?? "sin registro")).map(([k, v]) => `${k} (${v})`).join(", ")}\n`);

console.log(`## Por qué terminó\n\n| Motivo | Tareas |\n| --- | --- |`);
for (const [k, v] of count(rows.map((r) => r.t.stopReason ?? "sin registro"))) console.log(`| ${k} | ${v} |`);

const blocked = rows.filter((r) => r.blocks.length);
console.log(`\n## Bloqueos de la guarda (${blocked.length} tareas)\n`);
for (const r of blocked) {
  console.log(`- **${r.t.createdAt.slice(11, 19)}** ${one(r.t.tarea ?? "(sin texto)")}`);
  for (const b of r.blocks) console.log(`  - ${one(b.guard!)} → ${one(b.reason ?? "").slice(0, 220)}`);
}

console.log(`\n## Tareas\n\n| Hora | Estado | Cierre | Seg | Acc | Tarea | Resumen |\n| --- | --- | --- | --- | --- | --- | --- |`);
for (const r of rows) {
  const cell = (s: string, n: number) => one(s).replace(/\|/g, "/").slice(0, n);
  console.log(`| ${r.t.createdAt.slice(11, 19)} | ${r.t.estado} | ${r.t.stopReason ?? "-"} | ${r.secs} | ${r.actions} | ${cell(r.t.tarea ?? "(sin texto)", 90)} | ${cell(r.t.resumen, 220)} |`);
}

const errors = rows.filter((r) => r.t.error);
if (errors.length) {
  console.log(`\n## Errores internos\n`);
  for (const r of errors) console.log(`- ${r.t.createdAt.slice(11, 19)} ${r.t.stopReason}: ${one(r.t.error!).slice(0, 400)}`);
}
