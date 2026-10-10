import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadPixel } from "@remotion/google-fonts/Silkscreen";

export const SANS = loadGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] }).fontFamily;
export const PIXEL = loadPixel("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#060a08",
  surface: "#0d1411",
  surface2: "#121b17",
  line: "#1e2b25",
  ink: "#e9f1ec",
  ink2: "#a9b8b0",
  muted: "#6f7f77",
  accent: "#3ecf8e",
  amber: "#f0a14a",
  red: "#f2706a",
  yellow: "#f2e45c",
};

export const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** 0→1 over [a, b] frames, eased and clamped. */
export const prog = (f: number, a: number, b: number, e = ease) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

export const Backdrop: React.FC<{ glow?: string }> = ({ glow = C.accent }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          backgroundPosition: `0 ${-f * 0.4}px`,
          maskImage: "radial-gradient(ellipse at 50% 45%, black 20%, transparent 75%)",
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 50% at 50% 40%, ${glow}1f, transparent 70%)` }} />
    </AbsoluteFill>
  );
};

/** Splits narration into caption chunks and shows each for a share of the voice time proportional to its length. */
export const Captions: React.FC<{ text: string; startFrame: number; frames: number }> = ({ text, startFrame, frames }) => {
  const f = useCurrentFrame();
  const chunks = text
    .split(/(?<=[.:,;])\s+/)
    .reduce<string[]>((acc, part) => {
      const last = acc[acc.length - 1];
      if (last && last.length + part.length < 64 && !/[.:]$/.test(last)) acc[acc.length - 1] = `${last} ${part}`;
      else acc.push(part);
      return acc;
    }, []);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let at = startFrame;
  const timed = chunks.map((c) => {
    const len = (c.length / total) * frames;
    const item = { c, a: at, b: at + len };
    at += len;
    return item;
  });
  const cur = timed.find((t) => f >= t.a && f < t.b);
  if (!cur) return null;
  const o = prog(f, cur.a, cur.a + 5) * (1 - prog(f, cur.b - 4, cur.b));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 54, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          maxWidth: 1400,
          padding: "12px 26px",
          borderRadius: 14,
          background: "rgba(4,8,6,0.78)",
          border: `1px solid ${C.line}`,
          color: C.ink,
          font: `500 36px/1.3 ${SANS}`,
          textAlign: "center",
          backdropFilter: "blur(6px)",
        }}
      >
        {cur.c}
      </div>
    </div>
  );
};

/** Frame where a given sentence (by index) starts, estimated from character share of the narration. */
export function sentenceFrames(text: string, startFrame: number, frames: number): number[] {
  const parts = text.split(/(?<=[.:])\s+/);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let at = startFrame;
  return parts.map((p) => {
    const s = at;
    at += (p.length / total) * frames;
    return Math.round(s);
  });
}

export const Cursor: React.FC<{ x: number; y: number; pressed: number }> = ({ x, y, pressed }) => (
  <svg
    width={40}
    height={40}
    viewBox="0 0 24 24"
    style={{ position: "absolute", left: x - 6, top: y - 4, transform: `scale(${1 - pressed * 0.18})`, filter: "drop-shadow(0 4px 10px rgba(0,0,0,.6))" }}
  >
    <path d="M5 3l14 8.5-6.2 1.6L9.6 19z" fill="#fff" stroke="#0a0a0a" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

export const Ripple: React.FC<{ x: number; y: number; t: number; color: string }> = ({ x, y, t, color }) =>
  t <= 0 || t >= 1 ? null : (
    <div
      style={{
        position: "absolute",
        left: x - 60 * t,
        top: y - 60 * t,
        width: 120 * t,
        height: 120 * t,
        borderRadius: "50%",
        border: `4px solid ${color}`,
        opacity: 1 - t,
      }}
    />
  );

export type Tone = "ok" | "warn" | "bad" | "neutral";
export const toneColor = (t: Tone) => ({ ok: C.accent, warn: C.amber, bad: C.red, neutral: C.ink2 })[t];

export const Chip: React.FC<{ tone: Tone; children: React.ReactNode; style?: React.CSSProperties }> = ({ tone, children, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 18px",
      borderRadius: 999,
      background: "rgba(6,10,8,0.9)",
      border: `1.5px solid ${toneColor(tone)}`,
      color: C.ink,
      font: `500 26px ${MONO}`,
      whiteSpace: "nowrap",
      boxShadow: `0 10px 30px rgba(0,0,0,.5), 0 0 24px ${toneColor(tone)}33`,
      ...style,
    }}
  >
    <span style={{ width: 10, height: 10, borderRadius: 99, background: toneColor(tone) }} />
    {children}
  </div>
);

export const Shield: React.FC<{ color: string; size?: number }> = ({ color, size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
  </svg>
);

export const GuardCard: React.FC<{ tone: "ok" | "bad"; body: string; t: number }> = ({ tone, body, t }) => {
  const color = toneColor(tone);
  return (
    <div
      style={{
        position: "absolute",
        right: 70,
        top: 150,
        width: 560,
        padding: "26px 30px",
        borderRadius: 18,
        background: "rgba(8,13,11,0.94)",
        border: `2px solid ${color}`,
        boxShadow: `0 30px 80px rgba(0,0,0,.6), 0 0 60px ${color}30`,
        transform: `translateX(${(1 - t) * 640}px)`,
        opacity: t,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Shield color={color} />
        <span style={{ font: `500 22px ${MONO}`, color: C.ink2, letterSpacing: 1 }}>GUARDA · Haiku 5.5</span>
      </div>
      <div style={{ font: `700 54px ${SANS}`, color, margin: "12px 0 10px", letterSpacing: -0.5 }}>
        {tone === "ok" ? "Aprueba" : "Bloquea"}
      </div>
      <div style={{ font: `400 26px/1.4 ${SANS}`, color: C.ink }}>{body}</div>
    </div>
  );
};

/** A step on the remote screen: the capture the agent saw, where it acted and what it did. */
export type Beat = {
  img: string;
  /** Start of the beat as a frame offset inside the scene. */
  at: number;
  x: number;
  y: number;
  zoom: number;
  action?: "click" | "type";
  label?: string;
  tone?: Tone;
  card?: { tone: "ok" | "bad"; body: string };
  rect?: { x0: number; y0: number; x1: number; y1: number; tone: Tone; label: string };
};

const SRC_W = 1280;
const SRC_H = 800;

/** Remote desktop window with a camera that eases toward each beat's point and an animated cursor. */
export const Screen: React.FC<{ beats: Beat[]; end: number; title: string }> = ({ beats, end, title }) => {
  const f = useCurrentFrame();
  const W = 1440;
  const H = (W * SRC_H) / SRC_W;
  const s = W / SRC_W;
  const idx = Math.max(0, beats.findLastIndex((b) => f >= b.at));
  const b = beats[idx];
  const prev = beats[Math.max(0, idx - 1)];
  const next = beats[idx + 1]?.at ?? end;
  const len = next - b.at;
  const move = idx === 0 ? 1 : prog(f, b.at, b.at + Math.min(22, len * 0.45));
  const zoomOf = (bb: Beat) => bb.zoom;
  const z = idx === 0 ? interpolate(f, [0, len], [1, b.zoom], { extrapolateRight: "clamp", easing: ease }) : interpolate(move, [0, 1], [zoomOf(prev), b.zoom]);
  const clampC = (c: number, span: number, zz: number) => Math.min(Math.max(c, span / 2 / zz), span - span / 2 / zz);
  const cx = clampC(interpolate(move, [0, 1], [prev.x, b.x]), SRC_W, z);
  const cy = clampC(interpolate(move, [0, 1], [prev.y, b.y]), SRC_H, z);
  const toScreen = (x: number, y: number) => ({ sx: W / 2 + (x - cx) * s * z, sy: H / 2 + (y - cy) * s * z });
  const curMove = idx === 0 ? prog(f, 6, 26) : move;
  const startPt = idx === 0 ? { x: b.x - 220, y: b.y + 160 } : prev;
  const cur = toScreen(interpolate(curMove, [0, 1], [startPt.x, b.x]), interpolate(curMove, [0, 1], [startPt.y, b.y]));
  const clickAt = b.at + Math.min(26, len * 0.5);
  const rip = (f - clickAt) / 16;
  const pressed = Math.max(0, 1 - Math.abs(f - clickAt) / 4);
  const fadeIn = idx === 0 ? 1 : prog(f, b.at, b.at + 6);
  const labelT = prog(f, clickAt, clickAt + 8);
  const tone = b.tone ?? "ok";
  const pt = toScreen(b.x, b.y);
  const layer = (bb: Beat, o: number) => (
    <div
      key={bb.img + bb.at}
      style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${W / 2 - cx * s * z}px, ${H / 2 - cy * s * z}px) scale(${s * z})`, opacity: o }}
    >
      <Img src={staticFile(bb.img)} style={{ width: SRC_W, height: SRC_H, display: "block" }} />
      {bb.rect && (
        <div
          style={{
            position: "absolute",
            left: bb.rect.x0,
            top: bb.rect.y0,
            width: bb.rect.x1 - bb.rect.x0,
            height: bb.rect.y1 - bb.rect.y0,
            border: `${3 / z}px solid ${toneColor(bb.rect.tone)}`,
            background: `${toneColor(bb.rect.tone)}22`,
            borderRadius: 4,
            opacity: prog(f, bb.at + 8, bb.at + 18),
          }}
        />
      )}
    </div>
  );
  return (
    <div style={{ position: "absolute", left: (1920 - W) / 2, top: 40, width: W, height: H + 44 }}>
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          background: C.surface2,
          border: `1px solid ${C.line}`,
          borderBottom: 0,
          borderRadius: "14px 14px 0 0",
          font: `500 19px ${MONO}`,
          color: C.ink2,
        }}
      >
        {[C.red, C.amber, C.accent].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, opacity: 0.8 }} />
        ))}
        <span style={{ marginLeft: 14 }}>{title}</span>
        <span style={{ marginLeft: "auto", color: C.accent }}>
          paso {idx + 1}/{beats.length}
        </span>
      </div>
      <div style={{ position: "relative", width: W, height: H, overflow: "hidden", borderRadius: "0 0 14px 14px", border: `1px solid ${C.line}`, boxShadow: "0 40px 120px rgba(0,0,0,.65)" }}>
        {idx > 0 && fadeIn < 1 && layer(prev, 1)}
        {layer(b, fadeIn)}
        {b.action && <Ripple x={pt.sx} y={pt.sy} t={rip} color={toneColor(tone)} />}
        {b.action && <Cursor x={cur.sx} y={cur.sy} pressed={pressed} />}
        {b.label && (
          <div
            style={{
              position: "absolute",
              ...(pt.sx > W * 0.6 ? { right: W - pt.sx + 34 } : { left: pt.sx + 34 }),
              top: pt.sy > H * 0.7 ? pt.sy - 100 : pt.sy + 30,
              opacity: labelT,
              transform: `translateY(${(1 - labelT) * 14}px)`,
            }}
          >
            <Chip tone={tone}>{b.label}</Chip>
          </div>
        )}
        {b.rect && (
          <div style={{ position: "absolute", left: 40, top: 30, opacity: prog(f, b.at + 14, b.at + 24) }}>
            <Chip tone={b.rect.tone}>{b.rect.label}</Chip>
          </div>
        )}
        {b.card && <GuardCard tone={b.card.tone} body={b.card.body} t={prog(f, clickAt - 6, clickAt + 10)} />}
      </div>
    </div>
  );
};

export const Pop: React.FC<{ at: number; children: React.ReactNode; y?: number; style?: React.CSSProperties }> = ({ at, children, y = 30, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: f - at, fps, config: { damping: 18, stiffness: 140 } });
  return <div style={{ opacity: Math.min(1, t * 1.4), transform: `translateY(${(1 - t) * y}px)`, ...style }}>{children}</div>;
};
