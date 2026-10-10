#!/bin/sh
# Copies the agent's task records and traces from the server into <out-dir>/run.
# Hidden-set task texts end up here: keep <out-dir> out of git (data/ is ignored).
# Usage: deploy/pull-data.sh <out-dir>
set -eu
OUT="$1"
HOST="ec2-user@100.49.238.204"
KEY="$HOME/.ssh/frontier-agent.pem"
ssh -i "$KEY" "$HOST" 'cd /opt/agent && rm -rf /tmp/run && docker compose cp agent:/data /tmp/run >/dev/null && tar czf /tmp/run.tgz -C /tmp run'
mkdir -p "$OUT"
scp -q -i "$KEY" "$HOST:/tmp/run.tgz" "$OUT/run.tgz"
rm -rf "$OUT/run"
tar xzf "$OUT/run.tgz" -C "$OUT"
echo "tareas: $(ls "$OUT/run/tasks" | wc -l | tr -d ' ') en $OUT/run"
