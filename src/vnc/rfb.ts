// Minimal RFB 3.8 client over a websockify WebSocket: VNC auth, Raw/CopyRect
// framebuffer updates, pointer and key events. Needs Node's legacy OpenSSL
// provider (`--openssl-legacy-provider`) for the DES used by VNC auth.
import { createCipheriv } from "node:crypto";

const ENC_RAW = 0;
const ENC_COPYRECT = 1;

export class RfbClient {
  width = 0;
  height = 0;
  name = "";
  /** BGRX pixels, 4 bytes per pixel. */
  fb = new Uint8Array(0);
  /** performance.now() of the last framebuffer change. */
  lastChange = 0;
  updates = 0;

  #ws!: WebSocket;
  #chunks: Uint8Array[] = [];
  #buffered = 0;
  #waiter: (() => void) | null = null;
  #closed: Error | null = null;
  #buttons = 0;

  static async connect(url: string, password: string): Promise<RfbClient> {
    const c = new RfbClient();
    await c.#open(url);
    await c.#handshake(password);
    c.#readLoop().catch((e) => (c.#closed ??= e));
    c.requestUpdate(false);
    return c;
  }

  close(): void {
    this.#closed ??= new Error("closed");
    this.#ws.close();
  }

  get closed(): boolean {
    return this.#closed !== null;
  }

  requestUpdate(incremental: boolean): void {
    const m = new DataView(new ArrayBuffer(10));
    m.setUint8(0, 3);
    m.setUint8(1, incremental ? 1 : 0);
    m.setUint16(6, this.width);
    m.setUint16(8, this.height);
    this.#send(m);
  }

  pointer(x: number, y: number, buttons = this.#buttons): void {
    this.#buttons = buttons;
    const m = new DataView(new ArrayBuffer(6));
    m.setUint8(0, 5);
    m.setUint8(1, buttons);
    m.setUint16(2, Math.max(0, Math.min(this.width - 1, Math.round(x))));
    m.setUint16(4, Math.max(0, Math.min(this.height - 1, Math.round(y))));
    this.#send(m);
  }

  key(keysym: number, down: boolean): void {
    const m = new DataView(new ArrayBuffer(8));
    m.setUint8(0, 4);
    m.setUint8(1, down ? 1 : 0);
    m.setUint32(4, keysym);
    this.#send(m);
  }

  #send(view: DataView): void {
    if (this.#closed) throw this.#closed;
    this.#ws.send(view.buffer as ArrayBuffer);
  }

  #open(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, ["binary"]);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`websocket error connecting to ${new URL(url).host}`));
      ws.onclose = () => {
        this.#closed ??= new Error("connection closed by server");
        this.#waiter?.();
      };
      ws.onmessage = (ev) => {
        const data = new Uint8Array(ev.data as ArrayBuffer);
        this.#chunks.push(data);
        this.#buffered += data.length;
        this.#waiter?.();
      };
      this.#ws = ws;
    });
  }

  async #read(n: number): Promise<Uint8Array> {
    while (this.#buffered < n) {
      if (this.#closed) throw this.#closed;
      await new Promise<void>((r) => (this.#waiter = r));
      this.#waiter = null;
    }
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const head = this.#chunks[0];
      const take = Math.min(head.length, n - off);
      out.set(head.subarray(0, take), off);
      off += take;
      if (take === head.length) this.#chunks.shift();
      else this.#chunks[0] = head.subarray(take);
    }
    this.#buffered -= n;
    return out;
  }

  async #u8(): Promise<number> {
    return (await this.#read(1))[0];
  }
  async #u16(): Promise<number> {
    const b = await this.#read(2);
    return (b[0] << 8) | b[1];
  }
  async #u32(): Promise<number> {
    const b = await this.#read(4);
    return new DataView(b.buffer).getUint32(0);
  }

  async #handshake(password: string): Promise<void> {
    const version = new TextDecoder().decode(await this.#read(12));
    if (!version.startsWith("RFB ")) throw new Error(`not an RFB server: ${JSON.stringify(version)}`);
    this.#ws.send(new TextEncoder().encode("RFB 003.008\n"));

    const nTypes = await this.#u8();
    if (nTypes === 0) throw new Error(`server refused: ${await this.#reason()}`);
    const types = Array.from(await this.#read(nTypes));
    if (types.includes(2)) {
      this.#ws.send(new Uint8Array([2]));
      const challenge = await this.#read(16);
      this.#ws.send(vncAuthResponse(challenge, password));
    } else if (types.includes(1)) {
      this.#ws.send(new Uint8Array([1]));
    } else {
      throw new Error(`no supported security type in ${types}`);
    }
    if ((await this.#u32()) !== 0) throw new Error(`VNC auth failed: ${await this.#reason()}`);

    this.#ws.send(new Uint8Array([1])); // ClientInit: shared session
    this.width = await this.#u16();
    this.height = await this.#u16();
    await this.#read(16); // server pixel format, replaced below
    this.name = new TextDecoder().decode(await this.#read(await this.#u32()));
    this.fb = new Uint8Array(this.width * this.height * 4);

    // 32bpp, depth 24, little endian, true colour, BGRX in memory.
    const pf = new DataView(new ArrayBuffer(20));
    pf.setUint8(0, 0);
    pf.setUint8(4, 32);
    pf.setUint8(5, 24);
    pf.setUint8(6, 0);
    pf.setUint8(7, 1);
    pf.setUint16(8, 255);
    pf.setUint16(10, 255);
    pf.setUint16(12, 255);
    pf.setUint8(14, 16);
    pf.setUint8(15, 8);
    pf.setUint8(16, 0);
    this.#send(pf);

    const enc = new DataView(new ArrayBuffer(4 + 4 * 2));
    enc.setUint8(0, 2);
    enc.setUint16(2, 2);
    enc.setInt32(4, ENC_COPYRECT);
    enc.setInt32(8, ENC_RAW);
    this.#send(enc);
  }

  async #reason(): Promise<string> {
    return new TextDecoder().decode(await this.#read(await this.#u32()));
  }

  async #readLoop(): Promise<void> {
    for (;;) {
      const type = await this.#u8();
      if (type === 0) {
        await this.#read(1);
        const rects = await this.#u16();
        for (let i = 0; i < rects; i++) await this.#rect();
        this.updates++;
        this.lastChange = performance.now();
        this.requestUpdate(true);
      } else if (type === 1) {
        await this.#read(3);
        const n = await this.#u16();
        await this.#read(n * 6);
      } else if (type === 2) {
        // bell
      } else if (type === 3) {
        await this.#read(3);
        await this.#read(await this.#u32());
      } else {
        throw new Error(`unknown server message type ${type}`);
      }
    }
  }

  async #rect(): Promise<void> {
    const x = await this.#u16();
    const y = await this.#u16();
    const w = await this.#u16();
    const h = await this.#u16();
    const enc = new DataView((await this.#read(4)).buffer).getInt32(0);
    const stride = this.width * 4;
    if (enc === ENC_RAW) {
      const px = await this.#read(w * h * 4);
      for (let row = 0; row < h; row++) {
        this.fb.set(px.subarray(row * w * 4, (row + 1) * w * 4), (y + row) * stride + x * 4);
      }
    } else if (enc === ENC_COPYRECT) {
      const sx = await this.#u16();
      const sy = await this.#u16();
      const copy = new Uint8Array(w * h * 4);
      for (let row = 0; row < h; row++) {
        copy.set(this.fb.subarray((sy + row) * stride + sx * 4, (sy + row) * stride + (sx + w) * 4), row * w * 4);
      }
      for (let row = 0; row < h; row++) {
        this.fb.set(copy.subarray(row * w * 4, (row + 1) * w * 4), (y + row) * stride + x * 4);
      }
    } else {
      throw new Error(`unsupported encoding ${enc}`);
    }
  }
}

/** VNC auth: DES-encrypt the challenge with the password, each key byte bit-reversed. */
export function vncAuthResponse(challenge: Uint8Array, password: string): Uint8Array {
  const key = Buffer.alloc(8);
  Buffer.from(password, "latin1").copy(key, 0, 0, 8);
  for (let i = 0; i < 8; i++) {
    let b = key[i];
    let r = 0;
    for (let bit = 0; bit < 8; bit++) {
      r = (r << 1) | (b & 1);
      b >>= 1;
    }
    key[i] = r;
  }
  const cipher = createCipheriv("des-ecb", key, null);
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(challenge), cipher.final()]));
}
