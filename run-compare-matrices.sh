#!/usr/bin/env bash
# Run Relay + LI.FI BZZ matrices (same tiers/tokens), then compare results.
# Usage: ./run-compare-matrices.sh
# Env:   RELAY_QUOTE_DELAY, LIFI_QUOTE_DELAY, RELAY_TRADE_TYPE (default EXACT_OUTPUT for apples-to-apples with LI.FI toAmount), etc.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_LOG="${ROOT}/relay-routes/last-matrix-relay-for-compare.txt"
LIFI_LOG="${ROOT}/lifi-routes/last-matrix-lifi-for-compare.txt"

echo "=== Relay matrix → ${RELAY_LOG}"
(cd "${ROOT}/relay-routes" && ./relay-bzz.sh matrix) | tee "${RELAY_LOG}"

echo ""
echo "=== LI.FI matrix → ${LIFI_LOG}"
(cd "${ROOT}/lifi-routes" && ./lifi-bzz.sh matrix) | tee "${LIFI_LOG}"

echo ""
echo "=== Comparison"
node "${ROOT}/compare-bzz-matrices.mjs" "${RELAY_LOG}" "${LIFI_LOG}" \
  --md "${ROOT}/compare-relay-lifi.md" \
  --csv "${ROOT}/compare-relay-lifi.csv"

echo ""
echo "Also open: compare-relay-lifi.md / compare-relay-lifi.csv"
