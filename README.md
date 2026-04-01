# Beeport tools

Small scripts and helpers used when working on **[Beeport](https://github.com/ethersphere/beeport)** — the Web2-facing app for buying BZZ, creating postage stamps, and uploading to Swarm (including [Relay.link](https://docs.relay.link/) integration).

This repository is separate from the main Beeport codebase so operational and debugging utilities can live in one place without cluttering the application repo.

## Contents

### `relay-routes/`

Tools around Relay’s quote and intent APIs for routes into **BZZ on Gnosis** (chain 100), aligned with how Beeport sources cross-chain swaps.

| File | Purpose |
|------|--------|
| `relay-bzz.sh` | Run a **quote matrix** across chains/tokens and USD tiers, check **intent status** for a `requestId`, or fetch **native token USD** price for gas estimates. |
| `intent-status.sh` | Poll **`/intents/status/v3`** for a given `requestId` (pretty-printed JSON). |
| `format-matrix-log.mjs` | Turn matrix log output into **Markdown** and **CSV** tables (`node format-matrix-log.mjs [last-matrix-run.txt]`). |

Environment variables (see script headers for details):

- `RELAY_API`, `RELAY_QUOTE_DELAY`, `BZZ_PRICE_USD` (EXACT_OUTPUT sizing)
- `RELAY_TRADE_TYPE` — `EXACT_OUTPUT` (default) or `EXACT_INPUT`. Relay often returns `NO_SWAP_ROUTES_FOUND` for exact-out into BZZ while exact-in quotes succeed for the same chains and tokens; Beeport-style flows can **quote with `EXACT_INPUT`** (spend a USD notional) when exact-out fails, or drive UX from “you pay ~$X” instead of a fixed BZZ out amount.
- `RELAY_MATRIX_VERBOSE=1` — matrix prints full swap summary plus `requestId=` / `status_path=` lines; default is one line per cell (`OK` or `FAIL …` only).

### `lifi-routes/`

Same **matrix shape** as `relay-routes`, but quotes use **LI.FI** [`GET /v1/quote/toAmount`](https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer-1) (fixed **BZZ** received on Gnosis, 16 decimals; tiers `$0.1`–`$100` via `BZZ_PRICE_USD`). Useful to compare route coverage vs Relay for “exact output” style quotes.

| File | Purpose |
|------|--------|
| `lifi-bzz.sh` | `matrix` — probe all cells; `pretty` — pretty-print a saved JSON response. |
| `lifi-cli-helpers.mjs` | URL builder, BZZ `toAmount` math, response summarizer. |
| `format-matrix-log.mjs` | Tables from matrix logs (handles both LI.FI `ok tool=…` and Relay-style lines). |

Environment variables:

- `LIFI_API` (default `https://li.quest`), `LIFI_QUOTE_DELAY`, `BZZ_PRICE_USD`, `LIFI_SLIPPAGE` (default `0.03`), `LIFI_ORDER` (`CHEAPEST` or `FASTEST`)
- `LIFI_API_KEY` — optional `x-lifi-api-key` header ([partner portal](https://portal.li.fi/))
- `LIFI_MATRIX_VERBOSE=1` — print LI.FI summary line + `stepId=…`
- `LIFI_INTEGRATOR` — optional `integrator` query param

Requirements: `bash`, `curl`, and **Node.js 18+** (`node` on `PATH`).

### Comparing Relay vs LI.FI

Both matrices use the same **36 cells** (fixed BZZ out via `BZZ_PRICE_USD` when Relay is in default **`RELAY_TRADE_TYPE=EXACT_OUTPUT`**, matching LI.FI **`toAmount`**).

1. Capture two logs (any filenames), then:

   ```bash
   node compare-bzz-matrices.mjs relay-routes/last-matrix-run.txt lifi-routes/last-matrix-run.txt \
     --md compare-relay-lifi.md --csv compare-relay-lifi.csv
   ```

   The script prints **success counts**, **both / Relay-only / LI.FI-only / neither**, and which side had more OK cells. The Markdown file includes a full side-by-side table plus OK/✗ summary grids.

2. Or run both probes and compare in one go (~72 quote requests):

   ```bash
   chmod +x run-compare-matrices.sh
   ./run-compare-matrices.sh
   ```

   Outputs are gitignored: `last-matrix-*-for-compare.txt`, `compare-relay-lifi.md`, `compare-relay-lifi.csv`.

**Note:** “Better” here means **more cells with HTTP 200 + OK** for the same notional setup. Relay **`EXACT_INPUT`** is not comparable to LI.FI **`toAmount`** without a separate LI.FI `fromAmount` flow—keep `EXACT_OUTPUT` for a fair side-by-side.

### `sushi-routes/`

Probes **[Sushi Quote API v7](https://docs.sushi.com/api/examples/quote)** for **same-chain** swaps into **BZZ** (default **Gnosis, chain 100**). The API is **exact input**: you pass `amount` as token-in smallest units; the response includes **`assumedAmountOut`** for BZZ.

**Not cross-chain:** `GET https://api.sushi.com/quote/v7/{chainId}` only routes on that chain. You cannot ask Sushi to deliver Gnosis BZZ from Ethereum in this endpoint—use **`relay-routes`** / **`lifi-routes`** for that. If you set `SUSHI_CHAINS=1` or `8453`, you must set **`BZZ_TOKEN_ETHEREUM`** / **`BZZ_TOKEN_BASE`** to a **BZZ (or wrapper) address valid on that chain**, or those chains are skipped.

| File | Purpose |
|------|--------|
| `sushi-bzz.sh` | `matrix` — NATIVE / USDC / USDT × `$0.1`–`$100` spend tiers (same idea as Relay **exact input**); `pretty` — format saved JSON. |
| `run-matrix.mjs` | Same matrix with **Node `fetch` only**: `node run-matrix.mjs` prints the matrix to **stdout**; optional `node run-matrix.mjs log.txt` also saves a copy. |
| `sushi-cli-helpers.mjs` | Build quote URLs, native sizing via Sushi [Pricing API](https://docs.sushi.com/api/examples/pricing), summarize responses. |
| `format-matrix-log.mjs` | Markdown + CSV from a matrix log. |

Run locally:

```bash
cd sushi-routes
./sushi-bzz.sh matrix                    # prints to terminal (add "| tee log.txt" only if you want a file)
node run-matrix.mjs                    # same matrix, stdout only
node run-matrix.mjs last-matrix-run.txt # stdout + save copy for format-matrix-log.mjs
```

Example quote (1 xDAI → BZZ on Gnosis):

```bash
curl -sS "https://api.sushi.com/quote/v7/100?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da&amount=1000000000000000000&maxSlippage=0.03"
```

Env: `SUSHI_API`, `SUSHI_QUOTE_DELAY`, `SUSHI_MAX_SLIPPAGE`, `SUSHI_CHAINS`, `SUSHI_MATRIX_VERBOSE=1`, `BZZ_TOKEN_ETHEREUM`, `BZZ_TOKEN_BASE`.

Sample **Gnosis** run where all 12 cells succeeded: `sushi-routes/examples/gnosis-matrix-sample-run.txt`.
