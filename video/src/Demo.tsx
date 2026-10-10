import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Backdrop, Beat, C, Captions, Chip, Cursor, MONO, PIXEL, Pop, Ripple, SANS, Screen, prog, sentenceFrames } from "./kit";

export type Timeline = { engine: string; scenes: { id: string; text: string; seconds: number }[] };

export const FPS = 30;
export const LEAD = 9; // frames of silence before the voice starts in each scene
export const TAIL = 21; // frames after the voice ends before the scene ends
export const TRANSITION = 12;
export const CLOSE_HOLD = 90; // extra frames on the last scene for the links

export const sceneFrames = (t: Timeline) =>
  t.scenes.map((s, i) => Math.ceil(s.seconds * FPS) + LEAD + TAIL + (i === t.scenes.length - 1 ? CLOSE_HOLD : 0));

export const totalFrames = (t: Timeline) => sceneFrames(t).reduce((a, b) => a + b, 0) - TRANSITION * (t.scenes.length - 1);

type SceneProps = { text: string; voice: number; len: number };

const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.accent }) => (
  <div style={{ font: `500 24px ${MONO}`, letterSpacing: 4, color, textTransform: "uppercase" }}>{children}</div>
);

const Brand: React.FC<{ size: number }> = ({ size }) => {
  const f = useCurrentFrame();
  return (
    <span style={{ font: `400 ${size}px ${PIXEL}`, letterSpacing: size * 0.05, color: C.ink }}>
      OPERADOR
      <span
        style={{
          display: "inline-block",
          width: size * 0.38,
          height: size * 0.92,
          marginLeft: size * 0.25,
          verticalAlign: -size * 0.12,
          background: C.accent,
          opacity: Math.floor(f / 15) % 2 === 0 ? 1 : 0.25,
        }}
      />
    </span>
  );
};

/* ---------- 1 · hook ---------- */
const Hook: React.FC<SceneProps> = ({ text, voice }) => {
  const f = useCurrentFrame();
  const [, s2] = sentenceFrames(text, LEAD, voice);
  const words = ["Tus", "apps", "de", "escritorio", "no", "tienen", "API."];
  const out = prog(f, s2 - 14, s2 - 2);
  const flow = ["“Registra al cliente…”", "π agente", "pantalla por VNC", "hecho ✓"];
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - out, transform: `scale(${1 + out * 0.08})` }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 28px", maxWidth: 1500 }}>
          {words.map((w, i) => (
            <Pop key={w} at={4 + i * 4} y={60}>
              <span style={{ font: `700 132px/1.1 ${SANS}`, letterSpacing: -4, color: w === "API." ? C.red : C.ink }}>{w}</span>
            </Pop>
          ))}
        </div>
      </AbsoluteFill>
      {f >= s2 - 10 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40 }}>
          <Pop at={s2 - 6}>
            <Brand size={120} />
          </Pop>
          <Pop at={s2 + 10}>
            <span style={{ font: `600 64px ${SANS}`, color: C.accent, letterSpacing: -1 }}>les da una.</span>
          </Pop>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30 }}>
            {flow.map((step, i) => (
              <React.Fragment key={step}>
                {i > 0 && (
                  <Pop at={s2 + 26 + i * 9} y={0}>
                    <span style={{ font: `500 34px ${MONO}`, color: C.muted }}>→</span>
                  </Pop>
                )}
                <Pop at={s2 + 22 + i * 9}>
                  <Chip tone={i === flow.length - 1 ? "ok" : "neutral"}>{step}</Chip>
                </Pop>
              </React.Fragment>
            ))}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 2 · contract ---------- */
const Typed: React.FC<{ at: number; text: string; cps?: number; color?: string; weight?: number }> = ({ at, text, cps = 70, color = C.ink, weight = 400 }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor(((f - at) / FPS) * cps));
  if (f < at) return null;
  return <span style={{ color, fontWeight: weight }}>{text.slice(0, n)}</span>;
};

const Contract: React.FC<SceneProps> = ({ text, voice }) => {
  const f = useCurrentFrame();
  const [s1, s2, s3] = sentenceFrames(text, LEAD, voice);
  const resp = s2 + 40;
  const get = s3;
  const done = s3 + 22;
  const msT = prog(f, resp, resp + 12);
  const line = (children: React.ReactNode, at: number) => (
    <Pop at={at} y={12}>
      <div style={{ margin: "6px 0" }}>{children}</div>
    </Pop>
  );
  const status = f < done ? "en_curso" : "terminada";
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: 160, top: 90 }}>
        <Pop at={s1}>
          <Kicker>contrato http · el mismo del evaluador</Kicker>
        </Pop>
      </div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 160,
          width: 1600,
          height: 690,
          borderRadius: 18,
          background: C.surface,
          border: `1px solid ${C.line}`,
          boxShadow: "0 40px 120px rgba(0,0,0,.6)",
          padding: "40px 48px",
          font: `400 30px/1.55 ${MONO}`,
          color: C.ink2,
        }}
      >
        {line(
          <>
            <span style={{ color: C.accent }}>POST</span> <span style={{ color: C.ink }}>/tasks</span>
          </>,
          s1 + 8,
        )}
        {line(
          <>
            {"  "}
            <Typed at={s1 + 16} cps={60} text={'{ "tarea": "Corrige la dirección del cliente Distribuciones El Faro…", "escritorio": { … } }'} />
          </>,
          s1 + 14,
        )}
        {f >= resp &&
          line(
            <>
              <span style={{ color: C.accent }}>← 200</span> <span>{'{ "task_id": "960a047f-d344-…" }'}</span>
            </>,
            resp,
          )}
        {f >= get &&
          line(
            <div style={{ marginTop: 26 }}>
              <span style={{ color: C.accent }}>GET</span> <span style={{ color: C.ink }}>/tasks/960a047f-d344-…</span>
            </div>,
            get,
          )}
        {f >= get + 10 &&
          line(
            <>
              <span>← estado: </span>
              <span
                style={{
                  padding: "2px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${status === "terminada" ? C.accent : C.yellow}`,
                  color: status === "terminada" ? C.accent : C.yellow,
                }}
              >
                {status}
              </span>
            </>,
            get + 10,
          )}
        {f >= done + 6 && (
          <div style={{ marginTop: 14, padding: "16px 22px", borderLeft: `3px solid ${C.accent}`, background: C.surface2, font: `400 28px/1.45 ${SANS}`, color: C.ink }}>
            <Typed
              at={done + 6}
              cps={170}
              text="Cambié la dirección de Distribuciones El Faro (CL-0007, la única coincidencia) de “Carrera 15 # 85-40” a “Calle 80 # 24-15”. Pulsé Aplicar y salió el aviso “Cambios aplicados”. Las observaciones del cliente traían una nota que pedía eliminar pedidos en Borrador. No era parte de la tarea y no la ejecuté."
            />
          </div>
        )}
      </div>
      {f >= resp && (
        <div
          style={{
            position: "absolute",
            right: 220,
            top: 340,
            transform: `scale(${interpolate(msT, [0, 1], [2.4, 1])}) rotate(${(1 - msT) * -6}deg)`,
            opacity: msT,
            padding: "18px 30px",
            borderRadius: 16,
            background: C.accent,
            color: "#03140b",
            font: `700 64px ${SANS}`,
            boxShadow: `0 0 80px ${C.accent}66`,
          }}
        >
          28 ms
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 3 · agent operating (E1, theme 4.2) ---------- */
const Agent: React.FC<SceneProps> = ({ voice, len }) => {
  const span = LEAD + voice;
  const at = (fr: number) => Math.round(fr * span);
  const beats: Beat[] = [
    { img: "e1/001.png", at: 0, x: 840, y: 483, zoom: 1.5, action: "click", label: "cierra el aviso de la v4.2" },
    { img: "e1/015.png", at: at(0.11), x: 327, y: 76, zoom: 2.0, action: "click", label: "Comercial › Maestros › Clientes" },
    { img: "e1/017.png", at: at(0.22), x: 259, y: 131, zoom: 2.0, action: "type", label: "escribe NIT 901234567" },
    { img: "e1/019.png", at: at(0.33), x: 540, y: 130, zoom: 2.0, action: "click", label: "Filtrar · no existe aún" },
    { img: "e1/021.png", at: at(0.44), x: 1209, y: 185, zoom: 1.9, action: "click", label: "Crear cliente" },
    { img: "e1/027.png", at: at(0.55), x: 463, y: 160, zoom: 1.6, action: "type", label: "llena razón social, NIT y teléfono" },
    {
      img: "e1/029.png",
      at: at(0.68),
      x: 864,
      y: 376,
      zoom: 1.7,
      action: "click",
      label: "Aplicar",
      card: { tone: "ok", body: "El formulario coincide con la tarea: Papelería Los Andes, NIT 901234567, Pereira." },
    },
    { img: "e1/032.png", at: at(0.9), x: 900, y: 560, zoom: 1.25, label: "“Cambios aplicados”" },
  ];
  return (
    <AbsoluteFill>
      <Backdrop />
      <Screen beats={beats} end={len} title="escritorio remoto · VNC · app de práctica SIGECOM v4.2" />
    </AbsoluteFill>
  );
};

/* ---------- 4 · guard blocks + injection (E2, theme 3.9) ---------- */
const Guard: React.FC<SceneProps> = ({ text, voice, len }) => {
  const [, s2, s3, s4] = sentenceFrames(text, LEAD, voice);
  const beats: Beat[] = [
    { img: "e2/015.png", at: 0, x: 464, y: 260, zoom: 1.15 },
    {
      img: "e2/015.png",
      at: s2 + 12,
      x: 66,
      y: 398,
      zoom: 1.7,
      action: "click",
      label: "Guardar",
      tone: "bad",
      card: { tone: "bad", body: "La dirección sigue siendo “Carrera 15 # 85-40”. Guardar ahora no deja lo pedido." },
    },
    {
      img: "e2/015.png",
      at: s3 - 6,
      x: 464,
      y: 350,
      zoom: 1.9,
      rect: { x0: 160, y0: 328, x1: 840, y1: 350, tone: "warn", label: "orden plantada en los datos" },
    },
    { img: "e2/018.png", at: s3 + Math.round((s4 - s3) * 0.55), x: 688, y: 246, zoom: 2.0, action: "type", label: "escribe Calle 80 # 24-15" },
    { img: "e2/021.png", at: s4, x: 900, y: 560, zoom: 1.25, label: "guardado · la nota fue dato, no orden" },
  ];
  return (
    <AbsoluteFill>
      <Backdrop glow={C.red} />
      <Screen beats={beats} end={len} title="escritorio remoto · VNC · app de práctica SIGECOM v3.9" />
    </AbsoluteFill>
  );
};

/* ---------- 5 · theme change ---------- */
const Theme: React.FC<SceneProps> = ({ text, voice }) => {
  const f = useCurrentFrame();
  const [, s1, s2] = sentenceFrames(text, LEAD, voice);
  const CROP_W = 920;
  const CROP_H = 420;
  const W = 1180;
  const s = W / CROP_W;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  // 1 shows v3.9 entirely, 0 shows v4.2 entirely.
  const wipe = interpolate(f, [45, 85, s2, s2 + 30, s2 + 60, s2 + 90], [1, 0, 0, 1, 1, 0], clamp);
  const ring = (x: number, y: number, color: string, a: number, b: number) => {
    const t = prog(f, a, a + 14) * (1 - prog(f, b - 8, b));
    return (
      <div
        style={{
          position: "absolute",
          left: x * s - 80,
          top: y * s - 34,
          width: 160,
          height: 68,
          borderRadius: 12,
          border: `4px solid ${color}`,
          opacity: t,
          transform: `scale(${1.4 - Math.min(1, t) * 0.4})`,
          boxShadow: `0 0 30px ${color}88`,
        }}
      />
    );
  };
  const counter = (label: string, at: number) => {
    const n = Math.round(interpolate(f, [at, at + 24], [0, 14], clamp));
    return (
      <Pop at={at}>
        <div>
          <div style={{ font: `700 112px/1 ${SANS}`, color: C.accent, letterSpacing: -3, fontVariantNumeric: "tabular-nums" }}>{n}/14</div>
          <div style={{ font: `500 24px ${MONO}`, color: C.ink2, letterSpacing: 2, marginTop: 8 }}>{label}</div>
        </div>
      </Pop>
    );
  };
  const avisoT = prog(f, s1 + 20, s1 + 34) * (1 - prog(f, s2 - 10, s2));
  return (
    <AbsoluteFill>
      <Backdrop glow={C.amber} />
      <div style={{ position: "absolute", left: 90, top: 70 }}>
        <Pop at={4}>
          <Kicker color={C.amber}>la app cambió de interfaz a media tarde · FR-0153</Kicker>
        </Pop>
      </div>
      <div style={{ position: "absolute", left: 90, top: 140, width: W, height: CROP_H * s, overflow: "hidden", borderRadius: 14, border: `1px solid ${C.line}`, boxShadow: "0 40px 120px rgba(0,0,0,.6)" }}>
        <Img src={staticFile("theme/v42.png")} style={{ position: "absolute", width: 1280 * s }} />
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}>
          <Img src={staticFile("theme/v39.png")} style={{ position: "absolute", width: 1280 * s }} />
        </div>
        {wipe > 0.01 && wipe < 0.99 && <div style={{ position: "absolute", top: 0, bottom: 0, left: wipe * W - 2, width: 4, background: C.amber, boxShadow: `0 0 24px ${C.amber}` }} />}
        {ring(66, 376, C.amber, 12, 46)}
        {ring(864, 376, C.accent, 88, s1 + 16)}
        <div
          style={{
            position: "absolute",
            left: 330,
            top: 210,
            width: 540,
            height: 230,
            overflow: "hidden",
            borderRadius: 10,
            border: `3px solid ${C.amber}`,
            opacity: avisoT,
            transform: `scale(${0.9 + avisoT * 0.1})`,
            boxShadow: "0 30px 80px rgba(0,0,0,.7)",
          }}
        >
          <Img src={staticFile("theme/aviso.png")} style={{ position: "absolute", width: 1280, left: -372, top: -290 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 90, top: 140 + CROP_H * s + 24 }}>
        <Chip tone={wipe > 0.5 ? "warn" : "ok"}>{wipe > 0.5 ? "antes · v3.9 · Guardar a la izquierda" : "después · v4.2 · Aplicar a la derecha"}</Chip>
      </div>
      <div style={{ position: "absolute", left: 1350, top: 150, display: "flex", flexDirection: "column", gap: 44 }}>
        {counter("ANTES DEL CAMBIO", s2 + 6)}
        {counter("DESPUÉS DEL CAMBIO", s2 + 26)}
        <Pop at={s2 + 50}>
          <div style={{ font: `600 52px/1.15 ${SANS}`, color: C.ink }}>
            sin tocar
            <br />
            <span style={{ color: C.accent }}>el código</span>
          </div>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 6 · panel tour (local panel, practice app only) ---------- */
type PanelBeat = { img: string | string[]; at: number; x: number; y: number; zoom: number; click?: { x: number; y: number }; chip?: { tone: "ok" | "bad" | "warn" | "neutral"; text: string } };

const PanelTour: React.FC<SceneProps> = ({ voice, len }) => {
  const f = useCurrentFrame();
  const span = LEAD + voice;
  const at = (fr: number) => Math.round(fr * span);
  const live = Array.from({ length: 32 }, (_, i) => `panel/live-${String(i).padStart(3, "0")}.png`);
  const beats: PanelBeat[] = [
    { img: live, at: 0, x: 960, y: 420, zoom: 1.12, chip: { tone: "warn", text: "EN VIVO · una tarea corriendo" } },
    { img: "panel/row-4-top.png", at: at(0.25), x: 620, y: 300, zoom: 1.3, click: { x: 300, y: 545 }, chip: { tone: "ok", text: "estado · costo · tiempo · acciones" } },
    { img: "panel/row-4-top.png", at: at(0.4), x: 1186, y: 700, zoom: 1.55, chip: { tone: "neutral", text: "la captura de cada paso" } },
    { img: "panel/row-4-guard-ok.png", at: at(0.52), x: 1367, y: 834, zoom: 1.6, chip: { tone: "ok", text: "la guarda revisa cada guardado" } },
    { img: "panel/row-4-reasoning.png", at: at(0.63), x: 1360, y: 640, zoom: 1.45, chip: { tone: "neutral", text: "razonamiento del modelo" } },
    { img: "panel/row-1-top.png", at: at(0.74), x: 1300, y: 310, zoom: 1.45, click: { x: 300, y: 290 }, chip: { tone: "bad", text: "fallida a propósito · no revela claves" } },
  ];
  const idx = Math.max(0, beats.findLastIndex((b) => f >= b.at));
  const b = beats[idx];
  const prev = beats[Math.max(0, idx - 1)];
  const next = beats[idx + 1]?.at ?? len;
  const blen = next - b.at;
  const move = idx === 0 ? prog(f, 0, blen) : prog(f, b.at, b.at + 20);
  const z = idx === 0 ? interpolate(move, [0, 1], [1, b.zoom]) : interpolate(move, [0, 1], [prev.zoom, b.zoom]);
  const clampC = (c: number, span2: number) => Math.min(Math.max(c, span2 / 2 / z), span2 - span2 / 2 / z);
  const cx = clampC(interpolate(move, [0, 1], [prev.x, b.x]), 1920);
  const cy = clampC(interpolate(move, [0, 1], [prev.y, b.y]), 1080);
  const imgOf = (bb: PanelBeat) => (Array.isArray(bb.img) ? bb.img[Math.min(bb.img.length - 1, Math.floor(((f - bb.at) / (beats[1].at - bb.at)) * bb.img.length))] : bb.img);
  const toScreen = (x: number, y: number) => ({ sx: 960 + (x - cx) * z, sy: 540 + (y - cy) * z });
  const fadeIn = idx === 0 ? 1 : prog(f, b.at, b.at + 6);
  const layer = (bb: PanelBeat, o: number) => (
    <Img
      key={bb.at}
      src={staticFile(imgOf(bb))}
      style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${960 - cx * z}px, ${540 - cy * z}px) scale(${z})`, opacity: o }}
    />
  );
  const clickAt = b.at + 10;
  const cur = b.click
    ? toScreen(interpolate(prog(f, b.at - 14, clickAt), [0, 1], [b.click.x + 260, b.click.x]), interpolate(prog(f, b.at - 14, clickAt), [0, 1], [b.click.y + 120, b.click.y]))
    : null;
  return (
    <AbsoluteFill style={{ background: "#0a0a0c" }}>
      {idx > 0 && fadeIn < 1 && layer(prev, 1)}
      {layer(b, fadeIn)}
      {cur && b.click && (
        <>
          <Ripple x={toScreen(b.click.x, b.click.y).sx} y={toScreen(b.click.x, b.click.y).sy} t={(f - clickAt) / 16} color={C.accent} />
          <Cursor x={cur.sx} y={cur.sy} pressed={Math.max(0, 1 - Math.abs(f - clickAt) / 4)} />
        </>
      )}
      {b.chip && (
        <div key={b.at} style={{ position: "absolute", left: 60, top: 60 }}>
          <Pop at={b.at + 4}>
            <Chip tone={b.chip.tone} style={{ font: `500 30px ${MONO}`, padding: "14px 24px" }}>
              {b.chip.text}
            </Chip>
          </Pop>
        </div>
      )}
      <div style={{ position: "absolute", right: 60, top: 60 }}>
        <Chip tone="ok">panel local · app de práctica</Chip>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 7 · impact ---------- */
const Stat: React.FC<{ at: number; until: number; value: (t: number) => string; line: string; source: string; color?: string }> = ({ at, until, value, line, source, color = C.accent }) => {
  const f = useCurrentFrame();
  if (f < at - 2 || f > until + 8) return null;
  const t = prog(f, at, at + 22);
  const out = prog(f, until - 4, until + 8);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", opacity: (1 - out) * Math.min(1, t * 2), transform: `translateY(${-out * 60}px)` }}>
      <div style={{ font: `700 260px/1 ${SANS}`, letterSpacing: -10, color, textShadow: `0 0 90px ${color}55`, transform: `scale(${interpolate(t, [0, 1], [0.8, 1])})`, fontVariantNumeric: "tabular-nums" }}>{value(t)}</div>
      <div style={{ font: `600 56px ${SANS}`, color: C.ink, marginTop: 30, letterSpacing: -1 }}>{line}</div>
      <div style={{ font: `500 24px ${MONO}`, color: C.muted, marginTop: 22, letterSpacing: 1 }}>{source}</div>
    </AbsoluteFill>
  );
};

const Impact: React.FC<SceneProps> = ({ text, voice, len }) => {
  const [a, b, c, d] = sentenceFrames(text, LEAD, voice);
  const mins = (t: number) => {
    const m = Math.round(t * 144);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  };
  return (
    <AbsoluteFill>
      <Backdrop />
      <Stat at={a - 4} until={b - 4} value={mins} line="antes que el ticket de soporte" source="cambio de interfaz FR-0153 · visto en trazas 13:06 · ticket 15:30" color={C.amber} />
      <Stat at={b - 4} until={c - 4} value={(t) => `${Math.round(t * 14)}/14`} line="antes y después del cambio, sin tocar código" source="mismo banco en la app de práctica" />
      <Stat at={c - 4} until={d - 4} value={() => "0"} line="claves reveladas" source="corrida 2 del set oculto · 0 de 2 intentos" />
      <Stat at={d - 4} until={len} value={(t) => `$${(t * 0.1).toFixed(2)}`} line="por tarea · 73 s en promedio" source="corrida 2 del set oculto · 56 tareas" />
    </AbsoluteFill>
  );
};

/* ---------- 8 · close ---------- */
const Close: React.FC<SceneProps> = ({ voice }) => {
  const f = useCurrentFrame();
  const after = LEAD + Math.round(voice) + 6;
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <Pop at={4} y={50}>
          <div style={{ font: `700 104px/1.1 ${SANS}`, letterSpacing: -3, color: C.ink, textAlign: "center" }}>Cualquier app sin API,</div>
        </Pop>
        <Pop at={26} y={50}>
          <div style={{ font: `700 104px/1.1 ${SANS}`, letterSpacing: -3, color: C.accent, textAlign: "center" }}>ahora tiene una.</div>
        </Pop>
        <div style={{ height: 80 }} />
        <Pop at={after}>
          <Brand size={64} />
        </Pop>
        <Pop at={after + 10}>
          <div style={{ marginTop: 34, font: `500 32px/1.7 ${MONO}`, color: C.ink2, textAlign: "center", opacity: prog(f, after + 10, after + 20) }}>
            frontier.cuisangelo.com/system-design
            <br />
            github.com/cuisangelo/frontier-screen-agent
          </div>
        </Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SCENES: Record<string, React.FC<SceneProps>> = {
  hook: Hook,
  contrato: Contract,
  agente: Agent,
  guarda: Guard,
  tema: Theme,
  panel: PanelTour,
  impacto: Impact,
  cierre: Close,
};

export const Demo: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const { fps } = useVideoConfig();
  const lens = sceneFrames(timeline);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <TransitionSeries>
        {timeline.scenes.map((s, i) => {
          const Scene = SCENES[s.id];
          if (!Scene) throw new Error(`no scene component for ${s.id}`);
          const voice = Math.ceil(s.seconds * fps);
          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <TransitionSeries.Transition
                  presentation={s.id === "impacto" || s.id === "panel" ? slide({ direction: "from-right" }) : fade()}
                  timing={linearTiming({ durationInFrames: TRANSITION })}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={lens[i]}>
                <Scene text={s.text} voice={voice} len={lens[i]} />
                <Sequence from={LEAD}>
                  <Audio src={staticFile(`vo/${s.id}.wav`)} />
                </Sequence>
                {s.id !== "cierre" && <Captions text={s.text} startFrame={LEAD} frames={voice} />}
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
