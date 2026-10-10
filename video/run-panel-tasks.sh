#!/bin/sh
# Runs practice-app tests one at a time against the local panel server (port 8790)
# so the panel shows several tasks with their history. The desktop is shared: never parallel.
# Usage: sh video/run-panel-tasks.sh material/pruebas/E1-crear-cliente.json [...]
set -e
BASE=/Users/cuis/Code/frontier-screen-agent/.claude/worktrees/system-design
cd "$BASE"
for prueba in "$@"; do
  echo "== $(date +%H:%M:%S) $prueba"
  node scripts/remote-test.ts /Users/cuis/Code/frontier-screen-agent/.env http://localhost:8790 "$prueba"
done
