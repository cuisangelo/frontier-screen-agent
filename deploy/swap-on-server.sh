#!/bin/sh
# Runs on the server: waits for the moment no task is running, then restarts the
# agent on the already-built image within that gap. The evaluator only sends the
# next task after its next poll (every 5 s), so the gap is 0-5 s; the watcher
# checks every 0.2 s and the restart skips Docker's 10 s stop grace period.
# Usage (on the server, from /opt/agent): sh swap-on-server.sh <version>
set -eu
VERSION="$1"
TASKS=/var/lib/docker/volumes/agent_data/_data/tasks
# The volume is root-only, so the glob must expand inside the sudo shell, not ours;
# expanded outside it matches nothing and always reports zero running tasks.
running() { sudo sh -c "grep -l '\"estado\":\"en_curso\"' $TASKS/*.json 2>/dev/null | wc -l"; }

echo "$(date +%T) esperando una ventana sin tareas en curso (ahora: $(running))"
i=0
while [ "$(running)" -gt 0 ]; do
  sleep 0.2
  i=$((i + 1))
  [ $i -lt 4500 ] || { echo "sin ventana en 15 min, no se cambió nada"; exit 1; }
done
echo "$(date +%T.%N | cut -c1-12) ventana encontrada, cambiando"
AGENT_VERSION="$VERSION" docker compose up -d --no-deps --timeout 1 agent 2>&1 | tail -1
until curl -fs localhost:80 -H "Host: ${AGENT_DOMAIN:-agent.frontier.cuisangelo.com}" -o /dev/null 2>/dev/null || docker compose exec -T agent node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1))" 2>/dev/null; do sleep 0.2; done
echo "$(date +%T.%N | cut -c1-12) agente nuevo respondiendo"
