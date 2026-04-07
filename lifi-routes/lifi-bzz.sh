#!/usr/bin/env bash
# LI.FI quote matrix: GET /v1/quote/toAmount → fixed BZZ out on Gnosis (100).
# Same USD tiers / BZZ_PRICE_USD mapping as relay-routes (toAmount = BZZ smallest units, 16 decimals).
# Docs: https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer-1
#
# Usage:
#   ./lifi-bzz.sh matrix [--deny-bridges LIST] [--raw-dir DIR] [--user ADDR]
#   ./lifi-bzz.sh pretty <file.json>   # pretty-print saved response
#
# Env: LIFI_API (default https://li.quest), LIFI_QUOTE_DELAY, BZZ_PRICE_USD, LIFI_SLIPPAGE (default 0.03),
#      LIFI_ORDER (CHEAPEST|FASTEST, default CHEAPEST), LIFI_API_KEY (optional x-lifi-api-key),
#      LIFI_MATRIX_VERBOSE=1 for full summary line + stepId, LIFI_INTEGRATOR (optional query param),
#      LIFI_DENY_BRIDGES — comma-separated bridge keys → repeated denyBridges= on the quote URL (optional).
#      Same effect as matrix --deny-bridges LIST (CLI overrides env for that run when passed).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIFI_JS="${LIFI_JS:-${SCRIPT_DIR}/lifi-cli-helpers.mjs}"

LIFI_API="${LIFI_API:-https://li.quest}"
LIFI_QUOTE_DELAY="${LIFI_QUOTE_DELAY:-0.2}"
BZZ_PRICE_USD="${BZZ_PRICE_USD:-0.1}"
LIFI_SLIPPAGE="${LIFI_SLIPPAGE:-0.03}"
LIFI_ORDER="${LIFI_ORDER:-CHEAPEST}"
DEST_CHAIN=100
BZZ_GNOSIS="0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da"
NATIVE="0x0000000000000000000000000000000000000000"
DEFAULT_USER="0x03508bb71268bba25ecacc8f620e01866650532c"

usdc_for_chain() {
  case "$1" in
    1) echo "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" ;;
    8453) echo "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ;;
    100) echo "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0" ;;
    *) echo "" ;;
  esac
}

usdt_for_chain() {
  case "$1" in
    1) echo "0xdac17f958d2ee523a2206206994597c13d831ec7" ;;
    8453) echo "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2" ;;
    100) echo "0x4ecaba5870353805a9f068101a40e0f32ed605c6" ;;
    *) echo "" ;;
  esac
}

chain_name() {
  case "$1" in
    1) echo "ethereum" ;;
    8453) echo "base" ;;
    100) echo "gnosis" ;;
    *) echo "chain-$1" ;;
  esac
}

bzz_to_amount_for_tier() {
  local usd="$1"
  node "$LIFI_JS" bzz-out-amount "$usd" "$BZZ_PRICE_USD"
}

curl_headers=(-H "accept: application/json")
if [[ -n "${LIFI_API_KEY:-}" ]]; then
  curl_headers+=(-H "x-lifi-api-key: ${LIFI_API_KEY}")
fi

do_lifi_quote() {
  local url="$1" out="$2"
  local code
  code=$(curl -sS -o "$out" -w "%{http_code}" "${curl_headers[@]}" "$url")
  echo "$code"
}

summarize_lifi() {
  local file="$1"
  if [[ "${LIFI_MATRIX_VERBOSE:-}" == "1" ]]; then
    node "$LIFI_JS" summarize-lifi-quote "$file" verbose
  else
    node "$LIFI_JS" summarize-lifi-quote "$file" compact
  fi
}

cmd_matrix() {
  local USER_ADDR="$DEFAULT_USER" RAW_DIR="" DENY_BRIDGES_CLI_SET=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --deny-bridges)
        if [[ $# -lt 2 ]]; then
          echo "error: --deny-bridges requires a list (comma-separated keys, or '' for none)" >&2
          exit 1
        fi
        LIFI_DENY_BRIDGES="$2"
        DENY_BRIDGES_CLI_SET=1
        shift 2
        ;;
      --raw-dir)
        RAW_DIR="$2"
        shift 2
        ;;
      --user)
        USER_ADDR="$2"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
    esac
  done
  if [[ "$DENY_BRIDGES_CLI_SET" -eq 1 ]]; then
    export LIFI_DENY_BRIDGES
  fi
  if [[ -n "$RAW_DIR" ]]; then
    mkdir -p "$RAW_DIR"
  fi

  echo "# LI.FI BZZ-on-Gnosis matrix | API=${LIFI_API} | endpoint=GET /v1/quote/toAmount | user=${USER_ADDR}"
  if [[ -n "${LIFI_DENY_BRIDGES:-}" ]]; then
    echo "# denyBridges=${LIFI_DENY_BRIDGES} (comma-separated → repeated query params; keys from LI.FI GET /v1/tools)"
  else
    echo "# denyBridges=(none — set LIFI_DENY_BRIDGES=relay,hop or use --deny-bridges relay to exclude bridges)"
  fi
  echo "# toAmount=BZZ out (16 dec) | tiers \$0.1..\$100 via BZZ_PRICE_USD=${BZZ_PRICE_USD} | slippage=${LIFI_SLIPPAGE} | order=${LIFI_ORDER}"
  echo "# Columns: origin_chain | origin_token | target_usd | http | summary"
  echo ""

  local oc oid oname amt url tmp code
  local dollars=(0.1 1 10 100)
  local origins=(1 8453 100)

  for oc in "${origins[@]}"; do
    oname=$(chain_name "$oc")
    for usd in "${dollars[@]}"; do
      amt=$(bzz_to_amount_for_tier "$usd")
      url=$(node "$LIFI_JS" quote-toamount-url "$LIFI_API" "$oc" "$DEST_CHAIN" "$NATIVE" "$BZZ_GNOSIS" "$USER_ADDR" "$amt" "$LIFI_SLIPPAGE" "$LIFI_ORDER")
      tmp=$(mktemp)
      code=$(do_lifi_quote "$url" "$tmp")
      printf "%s\t%s\t%s\t%s\t" "$oname" "NATIVE" "$usd" "$code"
      summarize_lifi "$tmp"
      if [[ -n "$RAW_DIR" ]]; then
        cp "$tmp" "${RAW_DIR}/native_${oname}_${usd}usd.json"
      fi
      rm -f "$tmp"
      sleep "$LIFI_QUOTE_DELAY" 2>/dev/null || true
    done

    oid=$(usdc_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(bzz_to_amount_for_tier "$usd")
        url=$(node "$LIFI_JS" quote-toamount-url "$LIFI_API" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$USER_ADDR" "$amt" "$LIFI_SLIPPAGE" "$LIFI_ORDER")
        tmp=$(mktemp)
        code=$(do_lifi_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDC" "$usd" "$code"
        summarize_lifi "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdc_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$LIFI_QUOTE_DELAY" 2>/dev/null || true
      done
    fi

    oid=$(usdt_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(bzz_to_amount_for_tier "$usd")
        url=$(node "$LIFI_JS" quote-toamount-url "$LIFI_API" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$USER_ADDR" "$amt" "$LIFI_SLIPPAGE" "$LIFI_ORDER")
        tmp=$(mktemp)
        code=$(do_lifi_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDT" "$usd" "$code"
        summarize_lifi "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdt_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$LIFI_QUOTE_DELAY" 2>/dev/null || true
      done
    fi
  done
}

cmd_pretty() {
  local f="${1:-}"
  if [[ -z "$f" || ! -f "$f" ]]; then
    echo "usage: $0 pretty <file.json>" >&2
    exit 1
  fi
  cat "$f" | node "$LIFI_JS" json-pretty
}

case "${1:-}" in
  matrix)
    shift
    cmd_matrix "$@"
    ;;
  pretty)
    shift
    cmd_pretty "${1:-}"
    ;;
  *)
    echo "LI.FI BZZ (Gnosis) quote helper — /v1/quote/toAmount" >&2
    echo "" >&2
    echo "  $0 matrix [--deny-bridges LIST] [--raw-dir DIR] [--user 0x...]" >&2
    echo "  $0 pretty <file.json>" >&2
    exit 1
    ;;
esac
