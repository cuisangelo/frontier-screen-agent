// Manual exploration of the test desktop without a model: runs a list of steps
// and saves a screenshot after each. Read-only use: never pass a step that saves.
// Usage: node --openssl-legacy-provider scripts/explore.ts <env-file> <out-prefix> <step>...
//   steps: click:x,y   dclick:x,y   type:x,y,text   key:combo   scroll:x,y,up|down   wait:ms
import { writeFileSync } from "node:fs";
import { Screen } from "../src/vnc/screen.ts";

const [envFile, prefix, ...steps] = process.argv.slice(2);
process.loadEnvFile(envFile);
const ws = (process.env.DESKTOP_URL ?? "").replace(/^http/, "ws") + "/websockify";
if (steps[0] === "reset") {
  steps.shift();
  await fetch(`${process.env.DESKTOP_URL}/__reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DESKTOP_TOKEN}` },
  });
  await new Promise((r) => setTimeout(r, 5000));
}
const s = await Screen.open(ws, process.env.DESKTOP_PASSWORD ?? "");

let n = 0;
for (const step of steps) {
  const [kind, arg = ""] = step.split(/:(.*)/s);
  if (kind === "click" || kind === "dclick") {
    const [x, y] = arg.split(",").map(Number);
    await s.click(x, y, { double: kind === "dclick" });
  } else if (kind === "type") {
    const [x, y, ...text] = arg.split(",");
    await s.typeInto(Number(x), Number(y), text.join(","));
  } else if (kind === "key") {
    await s.press(arg);
  } else if (kind === "scroll") {
    const [x, y, dir] = arg.split(",");
    await s.scroll(Number(x), Number(y), dir as "up" | "down");
  } else if (kind === "wait") {
    await new Promise((r) => setTimeout(r, Number(arg)));
  } else {
    throw new Error(`unknown step ${step}`);
  }
  n++;
}
writeFileSync(`${prefix}.png`, s.png());
console.log(`${n} pasos, captura en ${prefix}.png`);
s.close();
