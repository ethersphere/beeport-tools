#!/usr/bin/env bash
# Relay.link quote matrix: routes into BZZ on Gnosis (chain 100).
# Matrix: env RELAY_TRADE_TYPE=EXACT_OUTPUT (default) or EXACT_INPUT. EXACT_OUTPUT uses BZZ
# out amount (16 decimals) from target USD via BZZ_PRICE_USD. EXACT_INPUT spends ~target_usd
# on origin (stables: 6 decimals; native: wei from Relay token price).
# Docs: https://docs.relay.link/references/api/get-quote-v2
#       https://docs.relay.link/references/api/get-intents-status-v3
#
# Usage:
#   ./relay-bzz.sh matrix [--raw-dir DIR] [--user ADDR]
#   ./relay-bzz.sh status <requestId>
#   ./relay-bzz.sh price-native <chainId>   # helper: USD price for native gas token
#
# Matrix: one line per cell (OK / FAIL …). RELAY_MATRIX_VERBOSE=1 adds swap details + requestId + status_path.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_JS="${RELAY_JS:-${SCRIPT_DIR}/relay-cli-helpers.mjs}"

RELAY_API="${RELAY_API:-https://api.relay.link}"
# Optional pause between quote calls (seconds, floating point) to reduce flaky NO_SWAP_ROUTES_FOUND under load
RELAY_QUOTE_DELAY="${RELAY_QUOTE_DELAY:-0.15}"
RELAY_TRADE_TYPE="${RELAY_TRADE_TYPE:-EXACT_OUTPUT}"
# Implied BZZ notional for EXACT_OUTPUT matrix: target USD / BZZ_PRICE_USD → 16-decimal BZZ amount
BZZ_PRICE_USD="${BZZ_PRICE_USD:-0.1}"
DEST_CHAIN=100
# BZZ on Gnosis — Relay resolves metadata (16 decimals) even if not in curated list
BZZ_GNOSIS="0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da"
NATIVE="0x0000000000000000000000000000000000000000"
# Default user from Relay OpenAPI examples (replace with a real wallet for live execution)
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

price_native_usd() {
  local cid="$1"
  curl -sS "${RELAY_API}/currencies/token/price?chainId=${cid}&address=${NATIVE}"
}

native_amount_for_usd() {
  # Prints wei (integer string) for ~usd dollars of native token on chainId
  local cid="$1" usd="$2"
  node "$RELAY_JS" native-wei "$cid" "$usd" "$RELAY_API" "$NATIVE"
}

stable_amount_for_usd() {
  # USDC/USDT: 6 decimals (kept for reference / manual quotes)
  local usd="$1"
  node "$RELAY_JS" stable-amount "$usd"
}

# BZZ smallest units (16 decimals) for EXACT_OUTPUT matching ~usd dollars at BZZ_PRICE_USD per 1 BZZ
bzz_output_amount_for_target_usd() {
  local usd="$1"
  node "$RELAY_JS" bzz-out-amount "$usd" "$BZZ_PRICE_USD"
}

# Amount string for matrix row: depends on RELAY_TRADE_TYPE and origin token class
matrix_amount_for_cell() {
  local oc="$1" ocur_kind="$2" usd="$3" oaddr
  case "$RELAY_TRADE_TYPE" in
    EXACT_INPUT)
      case "$ocur_kind" in
        NATIVE)
          native_amount_for_usd "$oc" "$usd"
          ;;
        USDC|USDT)
          stable_amount_for_usd "$usd"
          ;;
        *)
          echo "0"
          ;;
      esac
      ;;
    *)
      bzz_output_amount_for_target_usd "$usd"
      ;;
  esac
}

quote_json() {
  local user="$1" ocid dcid ocur dcur amount tt
  user="$1"
  ocid="$2"
  dcid="$3"
  ocur="$4"
  dcur="$5"
  amount="$6"
  tt="${7:-EXACT_OUTPUT}"
  node "$RELAY_JS" quote-json "$user" "$ocid" "$dcid" "$ocur" "$dcur" "$amount" "$tt"
}

do_quote() {
  local payload="$1" out="$2"
  local code
  code=$(curl -sS -o "$out" -w "%{http_code}" -X POST "${RELAY_API}/quote/v2" \
    -H "Content-Type: application/json" \
    -d "$payload")
  echo "$code"
}

summarize_quote() {
  local file="$1"
  if [[ "${RELAY_MATRIX_VERBOSE:-}" == "1" ]]; then
    node "$RELAY_JS" summarize-quote "$file" verbose
  else
    node "$RELAY_JS" summarize-quote "$file" compact
  fi
}

cmd_matrix() {
  local USER_ADDR="$DEFAULT_USER" RAW_DIR=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
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
  if [[ -n "$RAW_DIR" ]]; then
    mkdir -p "$RAW_DIR"
  fi

  echo "# Relay BZZ-on-Gnosis quote matrix | API=${RELAY_API} | user=${USER_ADDR}"
  if [[ "$RELAY_TRADE_TYPE" == "EXACT_INPUT" ]]; then
    echo "# tradeType=EXACT_INPUT | amount=spend on origin (native wei or stable 6 decimals) ≈ target_usd USD notional"
  else
    echo "# tradeType=EXACT_OUTPUT | amount=BZZ out (16 decimals) | implied BZZ notional: target_usd / BZZ_PRICE_USD (BZZ_PRICE_USD=${BZZ_PRICE_USD})"
  fi
  echo "# Columns: origin_chain | origin_token | target_usd | http | summary"
  echo ""

  local oc oid oname amt payload tmp code
  local dollars=(0.1 1 10 100)
  local origins=(1 8453 100)

  for oc in "${origins[@]}"; do
    oname=$(chain_name "$oc")
    # Same BZZ output size for NATIVE/USDC/USDT: maps target USD to BZZ via BZZ_PRICE_USD
    for usd in "${dollars[@]}"; do
      amt=$(matrix_amount_for_cell "$oc" "NATIVE" "$usd")
      payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$NATIVE" "$BZZ_GNOSIS" "$amt" "$RELAY_TRADE_TYPE")
      tmp=$(mktemp)
      code=$(do_quote "$payload" "$tmp")
      printf "%s\t%s\t%s\t%s\t" "$oname" "NATIVE" "$usd" "$code"
      summarize_quote "$tmp"
      if [[ -n "$RAW_DIR" ]]; then
        cp "$tmp" "${RAW_DIR}/native_${oname}_${usd}usd.json"
      fi
      rm -f "$tmp"
      sleep "$RELAY_QUOTE_DELAY" 2>/dev/null || true
    done

    # USDC
    oid=$(usdc_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(matrix_amount_for_cell "$oc" "USDC" "$usd")
        payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$amt" "$RELAY_TRADE_TYPE")
        tmp=$(mktemp)
        code=$(do_quote "$payload" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDC" "$usd" "$code"
        summarize_quote "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdc_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$RELAY_QUOTE_DELAY" 2>/dev/null || true
      done
    fi

    # USDT
    oid=$(usdt_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(matrix_amount_for_cell "$oc" "USDT" "$usd")
        payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$amt" "$RELAY_TRADE_TYPE")
        tmp=$(mktemp)
        code=$(do_quote "$payload" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDT" "$usd" "$code"
        summarize_quote "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdt_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$RELAY_QUOTE_DELAY" 2>/dev/null || true
      done
    fi
  done
}

cmd_status() {
  local rid="${1:-}"
  if [[ -z "$rid" ]]; then
    echo "usage: $0 status <requestId>" >&2
    exit 1
  fi
  curl -sS "${RELAY_API}/intents/status/v3?requestId=${rid}" | node "$RELAY_JS" json-pretty
}

cmd_price_native() {
  local cid="${1:-}"
  if [[ -z "$cid" ]]; then
    echo "usage: $0 price-native <chainId>" >&2
    exit 1
  fi
  price_native_usd "$cid" | node "$RELAY_JS" json-pretty
}

case "${1:-}" in
  matrix)
    shift
    cmd_matrix "$@"
    ;;
  status)
    shift
    cmd_status "${1:-}"
    ;;
  price-native)
    shift
    cmd_price_native "${1:-}"
    ;;
  *)
    echo "Relay BZZ (Gnosis) quote helper" >&2
    echo "" >&2
    echo "  $0 matrix [--raw-dir DIR] [--user 0x...]   # RELAY_TRADE_TYPE=EXACT_OUTPUT|EXACT_INPUT; tiers \$0.1..\$100" >&2
    echo "  $0 status <requestId>                       # GET /intents/status/v3" >&2
    echo "  $0 price-native <chainId>                  # native USD price (for debugging)" >&2
    exit 1
    ;;
esac
