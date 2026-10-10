#!/bin/sh
# One command for the whole video: voice-over, assets and render.
# Usage: sh video/build.sh <openai|say>
#   openai: gpt-4o-mini-tts with OPENAI_API_KEY from the project .env (final voice)
#   say:    macOS Paulina (provisional voice)
set -e
ENGINE=${1:?"usage: sh video/build.sh <openai|say>"}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=/Users/cuis/Code/frontier-screen-agent/.claude/worktrees/system-design/data/evidencia/video
PUB=$OUT/public
CHROME=/Users/cuis/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell

sh "$HERE/assets.sh"
node "$HERE/voice.ts" "$ENGINE" "$PUB"
cd "$HERE"
pnpm exec remotion render src/index.ts Demo "$OUT/video-final.mp4" \
  --public-dir "$PUB" --browser-executable "$CHROME" --codec h264 --crf 18 --audio-codec aac --audio-bitrate 192k --concurrency 6
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/video-final.mp4")
echo "duration: $DUR s"
awk -v d="$DUR" 'BEGIN { if (d > 120) { print "video is longer than 2:00"; exit 1 } }'
