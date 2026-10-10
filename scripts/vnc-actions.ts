// Read-only action check on the test desktop: types a search with an accent,
// runs it, screenshots, then clears the filter. Never saves data. Usage:
//   node --openssl-legacy-provider scripts/vnc-actions.ts <env-file> <out-prefix>
import { writeFileSync } from "node:fs";
import { Screen } from "../src/vnc/screen.ts";

const [envFile, prefix] = process.argv.slice(2);
process.loadEnvFile(envFile);
const ws = (process.env.DESKTOP_URL ?? "").replace(/^http/, "ws") + "/websockify";
const s = await Screen.open(ws, process.env.DESKTOP_PASSWORD ?? "");

const t = performance.now();
await s.typeInto(98, 131, "Ramírez");
await s.click(544, 130); // Buscar
console.log(`search typed and run in ${Math.round(performance.now() - t)} ms`);
writeFileSync(`${prefix}-search.png`, s.png());
await s.click(628, 130); // Limpiar
writeFileSync(`${prefix}-cleared.png`, s.png());
s.close();
