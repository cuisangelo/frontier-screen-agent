// Generates one voice-over clip per scene and the timeline the composition reads.
// Usage: node video/voice.ts <openai|say> <public-dir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [engine, publicDir] = process.argv.slice(2);
if (engine !== "openai" && engine !== "say") throw new Error("engine must be openai or say");
if (!publicDir) throw new Error("public dir is required");

const scenes: { id: string; text: string }[] = JSON.parse(readFileSync(join(import.meta.dirname, "narration.json"), "utf8"));
const voDir = join(publicDir, "vo");
mkdirSync(voDir, { recursive: true });

const INSTRUCTIONS =
  "Habla en español latinoamericano neutro, como un presentador de producto tecnológico: natural, cálido y seguro, " +
  "con energía contenida y ritmo ágil, sin tono de anuncio ni de lectura robótica. Pausas breves en los dos puntos. Pronuncia API como 'a pe i' y POST como 'post'.";

async function openai(text: string, out: string): Promise<void> {
  process.loadEnvFile("/Users/cuis/Code/frontier-screen-agent/.env");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing from .env");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts-2025-12-15", voice: "cedar", input: text, instructions: INSTRUCTIONS, response_format: "wav" }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  const raw = `${out}.raw.wav`;
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", out]);
}

function say(text: string, out: string): void {
  const aiff = `${out}.aiff`;
  execFileSync("say", ["-v", "Paulina", "-r", "178", "-o", aiff, text]);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", aiff, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", out]);
}

const timeline: { id: string; text: string; seconds: number }[] = [];
for (const s of scenes) {
  const out = join(voDir, `${s.id}.wav`);
  if (engine === "openai") await openai(s.text, out);
  else say(s.text, out);
  const seconds = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).trim(),
  );
  timeline.push({ id: s.id, text: s.text, seconds });
  console.log(`${s.id}: ${seconds.toFixed(2)} s`);
}
writeFileSync(join(publicDir, "timeline.json"), JSON.stringify({ engine, scenes: timeline }, null, 2));
console.log(`total voice: ${timeline.reduce((a, s) => a + s.seconds, 0).toFixed(1)} s`);
