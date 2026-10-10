// Captures stills of the LOCAL panel (practice app only) for the panel scene.
// Usage: node video/capture-panel.ts <live|states> <out-dir>
//   live:   waits for a running task, selects it and shoots every 2 s until it ends.
//   states: list view, then for each task its timeline top, first guard step and reasoning.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const [mode, outDir] = process.argv.slice(2);
if (mode !== "live" && mode !== "states") throw new Error("mode must be live or states");
if (!outDir) throw new Error("out dir is required");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await page.goto("http://localhost:8790/panel?token=video");
await page.waitForSelector(".row");
await page.waitForTimeout(1500);

const box = async (p: Page, sel: string) => p.locator(sel).first().boundingBox();

async function settleImages(): Promise<void> {
  await page.evaluate(() => document.querySelectorAll<HTMLImageElement>(".detail img").forEach((i) => (i.loading = "eager")));
  await page.waitForTimeout(1200);
}

if (mode === "live") {
  const deadline = Date.now() + 240_000;
  while (!(await page.locator(".row .st.en_curso").count())) {
    if (Date.now() > deadline) throw new Error("no running task appeared");
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForSelector(".row");
  }
  const row = page.locator(".row:has(.st.en_curso)").first();
  writeFileSync(join(outDir, "live-row.json"), JSON.stringify(await row.boundingBox()));
  await row.click();
  let n = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const d = document.querySelector(".detail");
      if (d) d.scrollTop = d.scrollHeight;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `live-${String(n++).padStart(3, "0")}.png`) });
    if (!(await page.locator(".row .st.en_curso").count())) break;
  }
  console.log(`live frames: ${n}`);
} else {
  await page.screenshot({ path: join(outDir, "list.png") });
  const rows = await page.locator(".row").all();
  const meta: unknown[] = [];
  for (const [i, row] of rows.entries()) {
    const rowBox = await row.boundingBox();
    const estado = await row.locator(".st").getAttribute("title");
    const tarea = (await row.locator("p").first().textContent())?.trim();
    await row.click();
    await page.waitForTimeout(1500);
    await settleImages();
    await page.screenshot({ path: join(outDir, `row-${i}-top.png`) });
    const entry: Record<string, unknown> = { i, estado, tarea, rowBox, summaryBox: await box(page, ".summary") };
    for (const kind of ["guard-no", "guard-ok"]) {
      if (!(await page.locator(`.step.${kind}`).count())) continue;
      await page.evaluate((k) => {
        const d = document.querySelector(".detail")!;
        const s = document.querySelector<HTMLElement>(`.step.${k}`)!;
        d.scrollTop = s.offsetTop - 140;
      }, kind);
      await settleImages();
      await page.screenshot({ path: join(outDir, `row-${i}-${kind}.png`) });
      entry[kind] = await box(page, `.step.${kind}`);
    }
    await page.evaluate(() => (document.querySelector(".detail")!.scrollTop = 0));
    await page.locator("#reasoning summary").click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(outDir, `row-${i}-reasoning.png`) });
    entry.reasoningBox = await box(page, "#reasoning");
    await page.locator("#reasoning summary").click();
    meta.push(entry);
  }
  writeFileSync(join(outDir, "panel.json"), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta.map((m: any) => [m.i, m.estado, m.tarea?.slice(0, 50), !!m["guard-no"], !!m["guard-ok"]])));
}
await browser.close();
