#!/bin/sh
# Prints OpenRouter usage and remaining limit for the project key without echoing the key.
set -a; . /Users/cuis/Code/frontier-screen-agent/.env; set +a
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY" |
  python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print({k: d.get(k) for k in ("usage", "limit", "limit_remaining")})'
