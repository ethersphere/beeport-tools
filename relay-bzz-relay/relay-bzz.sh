#!/usr/bin/env bash
# Relay.link quote matrix: routes into BZZ on Gnosis (chain 100).
# Matrix uses tradeType EXACT_OUTPUT: amount is BZZ to receive (16 decimals). Target USD
# tiers ($0.1 / $1 / $10 / $100) map to BZZ via env BZZ_PRICE_USD (default 0.1 → $0.10/BZZ).
# Docs: https://docs.relay.link/references/api/get-quote-v2
#       https://docs.relay.link/references/api/get-intents-status-v3
#
# Usage:
#   ./relay-bzz.sh matrix [--raw-dir DIR] [--user ADDR]
#   ./relay-bzz.sh status <requestId>
#   ./relay-bzz.sh price-native <chainId>   # helper: USD price for native gas token

set -u

RELAY_API="${RELAY_API:-https://api.relay.link}"
# Optional pause between quote calls (seconds, floating point) to reduce flaky NO_SWAP_ROUTES_FOUND under load
RELAY_QUOTE_DELAY="${RELAY_QUOTE_DELAY:-0.15}"
# Implied BZZ notional for matrix: target USD / BZZ_PRICE_USD → amount in 16-decimal base units for EXACT_OUTPUT
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
  python3 -c "
import json, sys, urllib.request, ssl
cid = int(sys.argv[1])
usd = float(sys.argv[2])
base = sys.argv[3]
addr = sys.argv[4]
ctx = ssl.create_default_context()
url = f'{base}/currencies/token/price?chainId={cid}&address={addr}'
with urllib.request.urlopen(url, context=ctx) as r:
    price = json.load(r)['price']
wei = int(round((usd / price) * 10**18))
print(wei)
" "$cid" "$usd" "$RELAY_API" "$NATIVE"
}

stable_amount_for_usd() {
  # USDC/USDT: 6 decimals (kept for reference / manual quotes)
  local usd="$1"
  python3 -c "print(int(round(float('$usd') * 10**6)))"
}

# BZZ smallest units (16 decimals) for EXACT_OUTPUT matching ~usd dollars at BZZ_PRICE_USD per 1 BZZ
bzz_output_amount_for_target_usd() {
  local usd="$1"
  python3 -c "
from decimal import Decimal
u = Decimal('${usd}')
p = Decimal('${BZZ_PRICE_USD}')
bzz = u / p
amt = int(bzz * Decimal(10 ** 16))
print(amt)
"
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
  python3 -c "import json; print(json.dumps({
    'user': '$user',
    'originChainId': int('$ocid'),
    'destinationChainId': int('$dcid'),
    'originCurrency': '$ocur'.lower(),
    'destinationCurrency': '$dcur'.lower(),
    'amount': str(int('$amount')),
    'tradeType': '$tt',
  }))"
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
  python3 -c "
import json, sys
path = sys.argv[1]
with open(path) as f:
    raw = f.read()
try:
    d = json.loads(raw)
except json.JSONDecodeError:
    print('ERROR non-json body', raw[:200].replace(chr(10), ' '))
    sys.exit(0)
if d.get('message'):
    print('ERROR', d.get('errorCode') or '', d.get('message')[:200])
    sys.exit(0)
det = d.get('details') or {}
cin = det.get('currencyIn') or {}
cout = det.get('currencyOut') or {}
op = det.get('operation')
rid = None
for s in d.get('steps') or []:
    if s.get('requestId'):
        rid = s['requestId']
        break
check = None
for s in d.get('steps') or []:
    for it in s.get('items') or []:
        c = it.get('check') or {}
        if c.get('endpoint'):
            check = c['endpoint']
            break
    if check:
        break
sym_in = (cin.get('currency') or {}).get('symbol')
sym_out = (cout.get('currency') or {}).get('symbol')
print(f\"ok op={op} in={sym_in} {cin.get('amountFormatted')} (\${cin.get('amountUsd')}) -> out={sym_out} {cout.get('amountFormatted')} (\${cout.get('amountUsd')})\")
print(f\"requestId={rid}\")
if check:
    print(f\"status_path={check}\")
" "$file"
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
  echo "# tradeType=EXACT_OUTPUT | amount=BZZ out (16 decimals) | implied BZZ notional: target_usd / BZZ_PRICE_USD (BZZ_PRICE_USD=${BZZ_PRICE_USD})"
  echo "# Columns: origin_chain | origin_token | target_usd | http | summary"
  echo ""

  local oc oid oname amt payload tmp code
  local dollars=(0.1 1 10 100)
  local origins=(1 8453 100)

  for oc in "${origins[@]}"; do
    oname=$(chain_name "$oc")
    # Same BZZ output size for NATIVE/USDC/USDT: maps target USD to BZZ via BZZ_PRICE_USD
    for usd in "${dollars[@]}"; do
      amt=$(bzz_output_amount_for_target_usd "$usd")
      payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$NATIVE" "$BZZ_GNOSIS" "$amt")
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
        amt=$(bzz_output_amount_for_target_usd "$usd")
        payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$amt")
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
        amt=$(bzz_output_amount_for_target_usd "$usd")
        payload=$(quote_json "$USER_ADDR" "$oc" "$DEST_CHAIN" "$oid" "$BZZ_GNOSIS" "$amt")
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
  curl -sS "${RELAY_API}/intents/status/v3?requestId=${rid}" | python3 -m json.tool
}

cmd_price_native() {
  local cid="${1:-}"
  if [[ -z "$cid" ]]; then
    echo "usage: $0 price-native <chainId>" >&2
    exit 1
  fi
  price_native_usd "$cid" | python3 -m json.tool
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
    echo "  $0 matrix [--raw-dir DIR] [--user 0x...]   # EXACT_OUTPUT BZZ; target \$0.1..\$100 at BZZ_PRICE_USD (env, default 0.1)" >&2
    echo "  $0 status <requestId>                       # GET /intents/status/v3" >&2
    echo "  $0 price-native <chainId>                  # native USD price (for debugging)" >&2
    exit 1
    ;;
esac
