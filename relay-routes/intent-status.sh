#!/usr/bin/env bash
# Poll Relay intent status (after you execute a quote step).
# Docs: https://docs.relay.link/references/api/get-intents-status-v3
#
# Usage: ./intent-status.sh <requestId>
# Env:   RELAY_API (default https://api.relay.link)

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_JS="${RELAY_JS:-${SCRIPT_DIR}/relay-cli-helpers.mjs}"
RELAY_API="${RELAY_API:-https://api.relay.link}"
rid="${1:-}"
if [[ -z "$rid" ]]; then
  echo "usage: $0 <requestId>" >&2
  exit 1
fi
curl -sS "${RELAY_API}/intents/status/v3?requestId=${rid}" | node "$RELAY_JS" json-pretty
