// Connects to the test desktop, saves one screenshot. Usage:
//   node --openssl-legacy-provider scripts/vnc-smoke.ts <env-file> <out.png>
import { writeFileSync } from "node:fs";
import { RfbClient } from "../src/vnc/rfb.ts";
import { encodePng } from "../src/vnc/png.ts";

const [envFile, out] = process.argv.slice(2);
process.loadEnvFile(envFile);
const base = process.env.DESKTOP_URL ?? "";
const password = process.env.DESKTOP_PASSWORD ?? "";
if (!base || !password) throw new Error("DESKTOP_URL and DESKTOP_PASSWORD are required");

const wsUrl = base.replace(/^http/, "ws") + "/websockify";
const t0 = performance.now();
const vnc = await RfbClient.connect(wsUrl, password);
console.log(`connected ${vnc.width}x${vnc.height} "${vnc.name}" in ${Math.round(performance.now() - t0)} ms`);
while (vnc.updates === 0) await new Promise((r) => setTimeout(r, 50));
console.log(`first update in ${Math.round(performance.now() - t0)} ms`);
writeFileSync(out, encodePng(vnc.fb, vnc.width, vnc.height));
console.log(`saved ${out}`);
vnc.close();
