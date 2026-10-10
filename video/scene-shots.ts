// Extracts one still per scene (at 60% of its voice) from the rendered video, for review.
// Usage: node video/scene-shots.ts <public-dir> <video.mp4> <out-dir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [publicDir, video, outDir] = process.argv.slice(2);
if (!publicDir || !video || !outDir) throw new Error("usage: scene-shots.ts <public-dir> <video.mp4> <out-dir>");
mkdirSync(outDir, { recursive: true });

// Mirrors the scene timing constants in src/Demo.tsx.
const FPS = 30, LEAD = 9, TAIL = 21, TRANSITION = 12, CLOSE_HOLD = 90;
const { scenes } = JSON.parse(readFileSync(join(publicDir, "timeline.json"), "utf8")) as { scenes: { id: string; seconds: number }[] };
let start = 0;
scenes.forEach((s, i) => {
  const voice = Math.ceil(s.seconds * FPS);
  const len = voice + LEAD + TAIL + (i === scenes.length - 1 ? CLOSE_HOLD : 0);
  const at = (start + LEAD + voice * 0.6) / FPS;
  const out = join(outDir, `${String(i + 1).padStart(2, "0")}-${s.id}.png`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", at.toFixed(2), "-i", video, "-frames:v", "1", out]);
  console.log(`${out} @ ${at.toFixed(1)} s`);
  start += len - TRANSITION;
});
