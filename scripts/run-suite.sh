#!/bin/sh
# Runs practice tasks one after another (they share one desktop).
# Usage: scripts/run-suite.sh <env-file> <model> <prueba.json>...
set -e
env_file="$1"; model="$2"; shift 2
for prueba in "$@"; do
  PI_BIN="${PI_BIN:-pi}" node --openssl-legacy-provider scripts/run-test.ts "$env_file" "$prueba" "$model" 2>&1 | grep -v ExperimentalWarning
done
