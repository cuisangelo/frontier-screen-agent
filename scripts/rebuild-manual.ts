// Rebuilds an app manual from saved traces (no desktop, cheap model). Usage:
//   node scripts/rebuild-manual.ts <env-file> <app name> <trace dir>...
import { updateManual } from "../src/agent/manual.ts";

const [envFile, app, ...traces] = process.argv.slice(2);
process.loadEnvFile(envFile);
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("OPENROUTER_API_KEY is required");
for (const t of traces) {
  await updateManual(app, t, "", {
    piBin: process.env.PI_BIN ?? "pi", openrouterKey: key, model: "anthropic/claude-haiku-5.5", dataDir: "data",
  });
}
console.log(`manual de ${app} reconstruido desde ${traces.length} trazas`);
