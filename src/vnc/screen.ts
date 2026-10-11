// Human-like actions over an RfbClient. Every action waits for the screen to
// settle: the desktop can take up to 1 s to repaint after an input.
import { RfbClient } from "./rfb.ts";
import { encodePng } from "./png.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KEYS: Record<string, number> = {
  enter: 0xff0d, return: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b,
  backspace: 0xff08, delete: 0xffff, home: 0xff50, end: 0xff57,
  left: 0xff51, up: 0xff52, right: 0xff53, down: 0xff54,
  pageup: 0xff55, pagedown: 0xff56, space: 0x20,
  ctrl: 0xffe3, control: 0xffe3, shift: 0xffe1, alt: 0xffe9,
  f1: 0xffbe, f2: 0xffbf, f3: 0xffc0, f4: 0xffc1, f5: 0xffc2,
};

/** X11 keysym for a character: Latin-1 maps 1:1, the rest uses the Unicode range. */
function charKeysym(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (ch === "\n") return KEYS.enter;
  if (ch === "\t") return KEYS.tab;
  return cp <= 0xff ? cp : 0x01000000 + cp;
}

export class Screen {
  readonly vnc: RfbClient;
  private constructor(vnc: RfbClient) {
    this.vnc = vnc;
  }

  static async open(wsUrl: string, password: string): Promise<Screen> {
    const vnc = await RfbClient.connect(wsUrl, password);
    while (vnc.updates === 0) await sleep(50);
    return new Screen(vnc);
  }

  get width(): number {
    return this.vnc.width;
  }
  get height(): number {
    return this.vnc.height;
  }

  close(): void {
    this.vnc.close();
  }

  /**
   * Waits until the screen stops changing. Always watches at least `minMs`
   * after the action, because a quick visual cue (a pressed button) can arrive
   * long before the real repaint; then requires `quietMs` without changes.
   */
  async settle(since: number, quietMs = 400, minMs = 700, maxMs = 5000): Promise<void> {
    for (;;) {
      await sleep(50);
      const now = performance.now();
      if (now - since >= maxMs) return;
      if (now - since >= minMs && now - Math.max(this.vnc.lastChange, since) >= quietMs) return;
    }
  }

  png(): Buffer {
    return encodePng(this.vnc.fb, this.width, this.height);
  }

  async click(x: number, y: number, opts: { double?: boolean; button?: 1 | 3 } = {}): Promise<void> {
    const mask = opts.button === 3 ? 4 : 1;
    const t = performance.now();
    this.vnc.pointer(x, y, 0);
    await sleep(40);
    for (let i = 0; i < (opts.double ? 2 : 1); i++) {
      this.vnc.pointer(x, y, mask);
      await sleep(150); // the app ignores clicks shorter than 100 ms
      this.vnc.pointer(x, y, 0);
      if (opts.double) await sleep(80);
    }
    await this.settle(t);
  }

  async scroll(x: number, y: number, direction: "up" | "down", steps = 3): Promise<void> {
    const mask = direction === "up" ? 8 : 16;
    const t = performance.now();
    this.vnc.pointer(x, y, 0);
    for (let i = 0; i < steps; i++) {
      this.vnc.pointer(x, y, mask);
      await sleep(30);
      this.vnc.pointer(x, y, 0);
      await sleep(30);
    }
    await this.settle(t);
  }

  /** Presses a key or a combo such as "ctrl+a" or "enter". */
  async press(combo: string): Promise<void> {
    const syms = combo.toLowerCase().split("+").map((k) => {
      const sym = KEYS[k] ?? (k.length === 1 ? charKeysym(k) : undefined);
      if (sym === undefined) throw new Error(`unknown key "${k}"`);
      return sym;
    });
    const t = performance.now();
    for (const s of syms) {
      this.vnc.key(s, true);
      await sleep(30);
    }
    for (const s of [...syms].reverse()) {
      this.vnc.key(s, false);
      await sleep(30);
    }
    await this.settle(t);
  }

  async type(text: string): Promise<void> {
    const t = performance.now();
    for (const ch of text) {
      const sym = charKeysym(ch);
      this.vnc.key(sym, true);
      await sleep(15);
      this.vnc.key(sym, false);
      await sleep(15);
    }
    await this.settle(t);
  }

  /** Replaces a field's content: click, select all, type. Typing into a filled field appends. */
  async typeInto(x: number, y: number, text: string): Promise<void> {
    await this.click(x, y);
    await this.press("ctrl+a");
    await this.type(text);
  }
}
