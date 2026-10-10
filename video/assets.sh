#!/bin/sh
# Copies the practice-app (SIGECOM) trace screenshots the composition uses into the public dir.
set -e
T=/Users/cuis/Code/frontier-screen-agent/.claude/worktrees/system-design/data/traces
P=/Users/cuis/Code/frontier-screen-agent/.claude/worktrees/system-design/data/evidencia/video/public
mkdir -p "$P/e1" "$P/e2" "$P/theme"
for n in 001 015 017 019 021 027 029 032; do cp "$T/local-E1-1791666002824/$n.png" "$P/e1/$n.png"; done
for n in 015 018 021; do cp "$T/local-E2-1791653683605/$n.png" "$P/e2/$n.png"; done
cp "$T/local-E1-1791653825357/041.png" "$P/theme/v39.png"
cp "$T/local-E1-1791666002824/029.png" "$P/theme/v42.png"
cp "$T/local-E1-1791666002824/001.png" "$P/theme/aviso.png"
