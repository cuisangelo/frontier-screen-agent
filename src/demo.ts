// Public demo for judges: practice-bench tasks only, one at a time, within a run cap that
// survives restarts, plus a read-only live view of the practice desktop.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Screen } from "./vnc/screen.ts";

export type BenchTask = { id: string; instruccion: string };

/** The fixed list judges can run: the challenge's example tasks and our own bench. Never free text. */
export function loadBench(materialDir: string): BenchTask[] {
  const out: BenchTask[] = [];
  for (const sub of ["pruebas", "retos"]) {
    const dir = join(materialDir, sub);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const p = JSON.parse(readFileSync(join(dir, f), "utf8"));
      out.push({ id: p.id, instruccion: p.instruccion });
    }
  }
  return out;
}

export class RunQuota {
  readonly #file: string;
  readonly max: number;
  constructor(dataDir: string, max: number) {
    this.#file = join(dataDir, "demo-runs.json");
    this.max = max;
  }
  get used(): number {
    return existsSync(this.#file) ? (JSON.parse(readFileSync(this.#file, "utf8")).used as number) : 0;
  }
  /** Spends one run; false when the cap is reached. Persisted before the run starts. */
  take(): boolean {
    const used = this.used;
    if (used >= this.max) return false;
    writeFileSync(this.#file, JSON.stringify({ used: used + 1 }));
    return true;
  }
}

/** Puts the practice app back in its initial state, as the bench does before every task. */
export async function resetDesktop(desktopUrl: string, desktopToken: string): Promise<void> {
  const r = await fetch(`${desktopUrl}/__reset`, { method: "POST", headers: { Authorization: `Bearer ${desktopToken}` } });
  if (!r.ok) throw new Error(`reset del escritorio: ${r.status}`);
  await new Promise((done) => setTimeout(done, 4000));
}

/**
 * Read-only view of the desktop: one shared VNC session kept open by the server, so the
 * password never reaches the browser. Frames are cached for a second.
 */
export class LiveView {
  readonly #wsUrl: string;
  readonly #password: string;
  #screen: Screen | null = null;
  #opening: Promise<Screen> | null = null;
  #png: Buffer | null = null;
  #at = 0;
  constructor(wsUrl: string, password: string) {
    this.#wsUrl = wsUrl;
    this.#password = password;
  }
  async png(): Promise<Buffer> {
    if (this.#png && Date.now() - this.#at < 1000) return this.#png;
    if (!this.#screen || this.#screen.vnc.closed) {
      this.#opening ??= Screen.open(this.#wsUrl, this.#password).finally(() => (this.#opening = null));
      this.#screen = await this.#opening;
    }
    this.#png = this.#screen.png();
    this.#at = Date.now();
    return this.#png;
  }
}
