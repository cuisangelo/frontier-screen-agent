# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""Turns a task trace (events.jsonl + screenshots) into an MP4 replay.

Each action is shown on the screenshot the agent was looking at, with the click
point marked and a caption; guard verdicts get a longer frame with their reason.
Usage: uv run scripts/trace-video.py <trace-dir> <task text> <out.mp4> [seconds-per-step]
"""

import json
import re
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 900
SCALE = 0.875  # 1280x800 screenshots shrink to 1120x700, leaving room for captions
SX, SY = 240, 16
BG, INK, MUTED = "#0d1712", "#e8f3ec", "#8fb39d"
GREEN, RED, AMBER = "#3ecf8e", "#ff5c5c", "#f5b942"
FONT = "/System/Library/Fonts/SFNS.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def card(title: str, body: str, color: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((120, 200), title, font=font(44), fill=color)
    y = 300
    for line in textwrap.wrap(body, 62):
        d.text((120, y), line, font=font(38), fill=INK)
        y += 56
    return img


def frame(shot: Path, caption: str, color: str, point=None, detail: str = "") -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    img.paste(Image.open(shot).convert("RGB").resize((1120, 700), Image.LANCZOS), (SX, SY))
    d = ImageDraw.Draw(img, "RGBA")
    if point:
        x, y = point[0] * SCALE + SX, point[1] * SCALE + SY
        for r, a in ((34, 90), (22, 255)):
            d.ellipse((x - r, y - r, x + r, y + r), outline=color + f"{a:02x}", width=5)
    lines = textwrap.wrap(detail, 100, max_lines=3, placeholder=" …")
    d.text((SX, SY + 724), caption, font=font(34), fill=color)
    for i, line in enumerate(lines):
        d.text((SX, SY + 774 + 32 * i), line, font=font(24), fill=INK)
    return img


def caption_for(ev: dict) -> tuple[str, str, tuple | None]:
    a = ev["action"]
    pt = (ev["x"], ev["y"]) if "x" in ev else None
    if a == "click":
        commit = ev.get("purpose") == "commit"
        return (f"Clic en «{ev['target']}»" + (" · guardado" if commit else ""), AMBER if commit else GREEN, pt)
    if a == "type_into":
        return (f"Escribe «{ev['text']}» en {ev['field']}", GREEN, pt)
    if a == "choose":
        return (f"Elige «{ev['option']}» en {ev['field']}", GREEN, pt)
    if a == "press":
        return (f"Tecla {ev.get('keys', '')}", GREEN, None)
    if a == "scroll":
        return ("Desplaza la pantalla", GREEN, pt)
    return (a, GREEN, pt)


def main() -> None:
    trace, task, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    step = float(sys.argv[4]) if len(sys.argv) > 4 else 1.4
    events = [json.loads(l) for l in (trace / "events.jsonl").read_text().splitlines() if l.strip()]
    frames: list[tuple[Image.Image, float]] = [(card("Tarea", task, MUTED), 2.7 * step)]
    shot = None
    for ev in events:
        if "screenshot" in ev:
            shot = trace / ev["screenshot"]
        elif "guard" in ev and shot:
            ok = ev["approve"]
            m = re.match(r'clic en \((\d+), (\d+)\) sobre "(.+)"', ev["guard"])
            what = f"clic en «{m[3]}»" if m else ev["guard"]
            title = ("La guarda aprueba: " if ok else "La guarda bloquea: ") + what
            pt = (int(m[1]), int(m[2])) if m else None
            frames.append((frame(shot, title, GREEN if ok else RED, pt, ev["reason"]), 4.6 * step))
        elif ev.get("action") == "finish":
            color = GREEN if ev["estado"] == "terminada" else AMBER
            frames.append((card(f"Resumen · {ev['estado']}", ev["resumen"], color), 4.2 * step))
        elif "action" in ev and shot:
            text, color, pt = caption_for(ev)
            frames.append((frame(shot, text, color, pt), step))
    with tempfile.TemporaryDirectory() as tmp:
        lst = Path(tmp) / "list.txt"
        entries = []
        for i, (img, secs) in enumerate(frames):
            p = Path(tmp) / f"{i:03d}.png"
            img.save(p)
            entries.append(f"file '{p}'\nduration {secs}")
        lst.write_text("\n".join(entries) + "\n")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
             # the concat demuxer drops the last entry's duration, so hold the final card explicitly
             "-vf", f"fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration={frames[-1][1]}", "-c:v", "libx264", "-crf", "18", str(out)],
            check=True,
        )
    total = sum(s for _, s in frames)
    print(f"{out}: {len(frames)} cuadros, {total:.1f} s")


main()
