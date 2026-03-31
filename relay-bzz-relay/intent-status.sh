#!/usr/bin/env bash
# Poll Relay intent status (after you execute a quote step).
# Docs: https://docs.relay.link/references/api/get-intents-status-v3
#
# Usage: ./intent-status.sh <requestId>
# Env:   RELAY_API (default https://api.relay.link)

set -u
RELAY_API="${RELAY_API:-https://api.relay.link}"
rid="${1:-}"
if [[ -z "$rid" ]]; then
  echo "usage: $0 <requestId>" >&2
  exit 1
fi
curl -sS "${RELAY_API}/intents/status/v3?requestId=${rid}" | python3 -m json.tool
