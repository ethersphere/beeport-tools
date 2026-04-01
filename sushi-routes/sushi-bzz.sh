#!/usr/bin/env bash
# Sushi Quote API v7 matrix: same-chain swaps into BZZ (exact input — amount is spend on origin).
# Primary: Gnosis (100). Optional: Ethereum (1) / Base (8453) if you set BZZ_TOKEN_ETHEREUM / BZZ_TOKEN_BASE
# (Sushi validates tokenOut per chain; the Gnosis BZZ address is invalid on 1/8453.)
#
# NOT cross-chain: each GET /quote/v7/{chainId} only routes on that chain. See README for Relay/LI.FI.
# Docs: https://docs.sushi.com/api/examples/quote
#
# Usage:
#   ./sushi-bzz.sh matrix [--raw-dir DIR]
#   ./sushi-bzz.sh pretty <file.json>
#
# Env: SUSHI_API (default https://api.sushi.com), SUSHI_QUOTE_DELAY, SUSHI_MAX_SLIPPAGE (default 0.03),
#      SUSHI_CHAINS (default 100; comma-separated e.g. 100,1), SUSHI_MATRIX_VERBOSE=1,
#      BZZ_TOKEN_ETHEREUM, BZZ_TOKEN_BASE — required for chain 1 / 8453 rows

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUSHI_JS="${SUSHI_JS:-${SCRIPT_DIR}/sushi-cli-helpers.mjs}"

SUSHI_API="${SUSHI_API:-https://api.sushi.com}"
SUSHI_QUOTE_DELAY="${SUSHI_QUOTE_DELAY:-0.2}"
SUSHI_MAX_SLIPPAGE="${SUSHI_MAX_SLIPPAGE:-0.03}"
# Default: Gnosis only (BZZ + liquidity on Sushi).
SUSHI_CHAINS="${SUSHI_CHAINS:-100}"

NATIVE_IN="0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
BZZ_GNOSIS="0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da"

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

bzz_out_for_chain() {
  case "$1" in
    100) echo "$BZZ_GNOSIS" ;;
    1) echo "${BZZ_TOKEN_ETHEREUM:-}" ;;
    8453) echo "${BZZ_TOKEN_BASE:-}" ;;
    *) echo "" ;;
  esac
}

stable_amount_for_usd() {
  local usd="$1"
  node "$SUSHI_JS" stable-amount "$usd"
}

native_amount_for_usd() {
  local cid="$1" usd="$2"
  node "$SUSHI_JS" native-wei-sushi "$cid" "$usd" "$SUSHI_API"
}

do_quote() {
  local url="$1" out="$2"
  local code
  code=$(curl -sS -o "$out" -w "%{http_code}" -H "accept: application/json" "$url")
  echo "$code"
}

summarize_sushi() {
  local file="$1"
  if [[ "${SUSHI_MATRIX_VERBOSE:-}" == "1" ]]; then
    node "$SUSHI_JS" summarize-sushi-quote "$file" verbose
  else
    node "$SUSHI_JS" summarize-sushi-quote "$file" compact
  fi
}

cmd_matrix() {
  local RAW_DIR=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --raw-dir)
        RAW_DIR="$2"
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

  echo "# Sushi Quote v7 → BZZ matrix | API=${SUSHI_API} | chains=${SUSHI_CHAINS}"
  echo "# Exact INPUT: amount = spend on origin (xDAI/ETH wei or USDC/USDT 6 decimals) for target USD tier"
  echo "# Cross-chain: not supported by this API (single chainId per request). See relay-routes / lifi-routes."
  echo "# Columns: origin_chain | origin_token | target_usd | http | summary"
  echo ""

  local oc oname bzz oid amt url tmp code
  local dollars=(0.1 1 10 100)
  IFS=',' read -r -a origins <<< "${SUSHI_CHAINS// /}"

  for oc in "${origins[@]}"; do
    [[ -z "$oc" ]] && continue
    oname=$(chain_name "$oc")
    bzz=$(bzz_out_for_chain "$oc")
    if [[ -z "$bzz" ]]; then
      echo "# skip chain ${oc} (${oname}): set BZZ token env for this chain (see script header)"
      continue
    fi

    for usd in "${dollars[@]}"; do
      amt=$(native_amount_for_usd "$oc" "$usd")
      url=$(node "$SUSHI_JS" quote-url "$SUSHI_API" "$oc" "$NATIVE_IN" "$bzz" "$amt" "$SUSHI_MAX_SLIPPAGE")
      tmp=$(mktemp)
      code=$(do_quote "$url" "$tmp")
      printf "%s\t%s\t%s\t%s\t" "$oname" "NATIVE" "$usd" "$code"
      summarize_sushi "$tmp"
      if [[ -n "$RAW_DIR" ]]; then
        cp "$tmp" "${RAW_DIR}/native_${oname}_${usd}usd.json"
      fi
      rm -f "$tmp"
      sleep "$SUSHI_QUOTE_DELAY" 2>/dev/null || true
    done

    oid=$(usdc_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(stable_amount_for_usd "$usd")
        url=$(node "$SUSHI_JS" quote-url "$SUSHI_API" "$oc" "$oid" "$bzz" "$amt" "$SUSHI_MAX_SLIPPAGE")
        tmp=$(mktemp)
        code=$(do_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDC" "$usd" "$code"
        summarize_sushi "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdc_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$SUSHI_QUOTE_DELAY" 2>/dev/null || true
      done
    fi

    oid=$(usdt_for_chain "$oc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(stable_amount_for_usd "$usd")
        url=$(node "$SUSHI_JS" quote-url "$SUSHI_API" "$oc" "$oid" "$bzz" "$amt" "$SUSHI_MAX_SLIPPAGE")
        tmp=$(mktemp)
        code=$(do_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDT" "$usd" "$code"
        summarize_sushi "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdt_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$SUSHI_QUOTE_DELAY" 2>/dev/null || true
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
  cat "$f" | node "$SUSHI_JS" json-pretty
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
    echo "Sushi Quote v7 — BZZ matrix (same-chain)" >&2
    echo "" >&2
    echo "  $0 matrix [--raw-dir DIR]" >&2
    echo "  $0 pretty <file.json>" >&2
    exit 1
    ;;
esac
