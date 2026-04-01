#!/usr/bin/env bash
# OpenOcean v4 reverseQuote matrix: exact BZZ OUT on chain → required pay token in (same-chain).
# Matches Relay/LI.FI "fixed BZZ" tiers via BZZ_PRICE_USD (amountDecimals = BZZ 16-decimal amount).
#
# OpenOcean reverseQuote params (see docs): inToken = token you RECEIVE (BZZ),
# outToken = token you PAY (native / USDC / USDT), amountDecimals = BZZ out (smallest units).
# Docs: https://docs.openocean.finance/docs/swap-api/advanced-usage/exact-out
#       https://docs.openocean.finance/docs/swap-api/v4#reversequote
#
# Usage:
#   ./openocean-bzz.sh matrix [--raw-dir DIR]
#   ./openocean-bzz.sh pretty <file.json>
#
# Env: OPENOCEAN_API (default https://open-api.openocean.finance), OPENOCEAN_QUOTE_DELAY,
#      BZZ_PRICE_USD (default 0.1), OPENOCEAN_SLIPPAGE (default 3 = 3%),
#      OPENOCEAN_CHAINS (default xdai; comma codes: eth,base,xdai — see supported-chains),
#      OPENOCEAN_GAS_PRICE_DECIMALS (optional override; else fetched per chain),
#      OPENOCEAN_MATRIX_VERBOSE=1,
#      BZZ_TOKEN_ETH, BZZ_TOKEN_BASE — required on eth/base when those chains are listed

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OO_JS="${OPENOCEAN_JS:-${SCRIPT_DIR}/openocean-cli-helpers.mjs}"

OPENOCEAN_API="${OPENOCEAN_API:-https://open-api.openocean.finance}"
OPENOCEAN_QUOTE_DELAY="${OPENOCEAN_QUOTE_DELAY:-0.25}"
BZZ_PRICE_USD="${BZZ_PRICE_USD:-0.1}"
OPENOCEAN_SLIPPAGE="${OPENOCEAN_SLIPPAGE:-3}"
# Chain *codes* for OpenOcean URL path (not only numeric id). Default: Gnosis.
OPENOCEAN_CHAINS="${OPENOCEAN_CHAINS:-xdai}"

NATIVE_PAY="0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
BZZ_GNOSIS="0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da"
BZZ_ETH="${BZZ_TOKEN_ETH:-}"
BZZ_BASE="${BZZ_TOKEN_BASE:-}"

usdc_for_chain_code() {
  case "$1" in
    eth) echo "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" ;;
    base) echo "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ;;
    xdai) echo "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0" ;;
    *) echo "" ;;
  esac
}

usdt_for_chain_code() {
  case "$1" in
    eth) echo "0xdac17f958d2ee523a2206206994597c13d831ec7" ;;
    base) echo "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2" ;;
    xdai) echo "0x4ecaba5870353805a9f068101a40e0f32ed605c6" ;;
    *) echo "" ;;
  esac
}

chain_display_name() {
  case "$1" in
    eth) echo "ethereum" ;;
    base) echo "base" ;;
    xdai) echo "gnosis" ;;
    *) echo "$1" ;;
  esac
}

bzz_for_chain_code() {
  case "$1" in
    xdai) echo "$BZZ_GNOSIS" ;;
    eth) echo "$BZZ_ETH" ;;
    base) echo "$BZZ_BASE" ;;
    *) echo "" ;;
  esac
}

bzz_out_tier() {
  local usd="$1"
  node "$OO_JS" bzz-out-amount "$usd" "$BZZ_PRICE_USD"
}

gas_decimals() {
  local code="$1"
  node "$OO_JS" gas-price-decimals "$code" "$OPENOCEAN_API"
}

do_quote() {
  local url="$1" out="$2"
  local code
  code=$(curl -sS -o "$out" -w "%{http_code}" -H "accept: application/json" "$url")
  echo "$code"
}

summarize_oo() {
  local file="$1"
  if [[ "${OPENOCEAN_MATRIX_VERBOSE:-}" == "1" ]]; then
    node "$OO_JS" summarize-openocean "$file" verbose
  else
    node "$OO_JS" summarize-openocean "$file" compact
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

  echo "# OpenOcean reverseQuote → exact BZZ out | API=${OPENOCEAN_API} | chains=${OPENOCEAN_CHAINS}"
  echo "# inToken=BZZ (receive), outToken=pay asset; amountDecimals=BZZ out (16 dec); tiers \$0.1..\$100 / BZZ_PRICE_USD"
  echo "# Same-chain only. Slippage=${OPENOCEAN_SLIPPAGE}%"
  echo "# Columns: origin_chain | origin_token | target_usd | http | summary"
  echo ""

  local cc oname bzz oid gas amt url tmp code
  local dollars=(0.1 1 10 100)
  IFS=',' read -r -a origins <<< "${OPENOCEAN_CHAINS// /}"

  for cc in "${origins[@]}"; do
    [[ -z "$cc" ]] && continue
    oname=$(chain_display_name "$cc")
    bzz=$(bzz_for_chain_code "$cc")
    if [[ -z "$bzz" ]]; then
      echo "# skip ${cc}: set BZZ_TOKEN_ETH / BZZ_TOKEN_BASE for eth/base, or unknown code"
      continue
    fi
    gas=$(gas_decimals "$cc")

    for usd in "${dollars[@]}"; do
      amt=$(bzz_out_tier "$usd")
      url=$(node "$OO_JS" reverse-quote-url "$OPENOCEAN_API" "$cc" "$bzz" "$NATIVE_PAY" "$amt" "$gas" "$OPENOCEAN_SLIPPAGE")
      tmp=$(mktemp)
      code=$(do_quote "$url" "$tmp")
      printf "%s\t%s\t%s\t%s\t" "$oname" "NATIVE" "$usd" "$code"
      summarize_oo "$tmp"
      if [[ -n "$RAW_DIR" ]]; then
        cp "$tmp" "${RAW_DIR}/native_${oname}_${usd}usd.json"
      fi
      rm -f "$tmp"
      sleep "$OPENOCEAN_QUOTE_DELAY" 2>/dev/null || true
    done

    oid=$(usdc_for_chain_code "$cc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(bzz_out_tier "$usd")
        url=$(node "$OO_JS" reverse-quote-url "$OPENOCEAN_API" "$cc" "$bzz" "$oid" "$amt" "$gas" "$OPENOCEAN_SLIPPAGE")
        tmp=$(mktemp)
        code=$(do_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDC" "$usd" "$code"
        summarize_oo "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdc_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$OPENOCEAN_QUOTE_DELAY" 2>/dev/null || true
      done
    fi

    oid=$(usdt_for_chain_code "$cc")
    if [[ -n "$oid" ]]; then
      for usd in "${dollars[@]}"; do
        amt=$(bzz_out_tier "$usd")
        url=$(node "$OO_JS" reverse-quote-url "$OPENOCEAN_API" "$cc" "$bzz" "$oid" "$amt" "$gas" "$OPENOCEAN_SLIPPAGE")
        tmp=$(mktemp)
        code=$(do_quote "$url" "$tmp")
        printf "%s\t%s\t%s\t%s\t" "$oname" "USDT" "$usd" "$code"
        summarize_oo "$tmp"
        if [[ -n "$RAW_DIR" ]]; then
          cp "$tmp" "${RAW_DIR}/usdt_${oname}_${usd}usd.json"
        fi
        rm -f "$tmp"
        sleep "$OPENOCEAN_QUOTE_DELAY" 2>/dev/null || true
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
  cat "$f" | node "$OO_JS" json-pretty
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
    echo "OpenOcean reverseQuote — exact BZZ out (same-chain)" >&2
    echo "" >&2
    echo "  $0 matrix [--raw-dir DIR]" >&2
    echo "  $0 pretty <file.json>" >&2
    exit 1
    ;;
esac
