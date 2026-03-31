# Beeport tools

Small scripts and helpers used when working on **[Beeport](https://github.com/ethersphere/beeport)** — the Web2-facing app for buying BZZ, creating postage stamps, and uploading to Swarm (including [Relay.link](https://docs.relay.link/) integration).

This repository is separate from the main Beeport codebase so operational and debugging utilities can live in one place without cluttering the application repo.

## Contents

### `relay-bzz-relay/`

Tools around Relay’s quote and intent APIs for routes into **BZZ on Gnosis** (chain 100), aligned with how Beeport sources cross-chain swaps.

| File | Purpose |
|------|--------|
| `relay-bzz.sh` | Run a **quote matrix** across chains/tokens and USD tiers, check **intent status** for a `requestId`, or fetch **native token USD** price for gas estimates. |
| `intent-status.sh` | Poll **`/intents/status/v3`** for a given `requestId` (pretty-printed JSON). |
| `format-matrix-log.mjs` | Turn `relay-bzz.sh` matrix log output into **Markdown** and **CSV** tables for review or sharing (`node format-matrix-log.mjs [last-matrix-run.txt]`). |

Environment variables (see script headers for details):

- `RELAY_API`, `RELAY_QUOTE_DELAY`, `BZZ_PRICE_USD` (EXACT_OUTPUT sizing)
- `RELAY_TRADE_TYPE` — `EXACT_OUTPUT` (default) or `EXACT_INPUT`. Relay often returns `NO_SWAP_ROUTES_FOUND` for exact-out into BZZ while exact-in quotes succeed for the same chains and tokens; Beeport-style flows can **quote with `EXACT_INPUT`** (spend a USD notional) when exact-out fails, or drive UX from “you pay ~$X” instead of a fixed BZZ out amount.
- `RELAY_MATRIX_VERBOSE=1` — matrix prints full swap summary plus `requestId=` / `status_path=` lines; default is one line per cell (`OK` or `FAIL …` only).

Requirements: `bash`, `curl`, and **Node.js 18+** (`node` on `PATH`) for `relay-cli-helpers.mjs` and `format-matrix-log.mjs`.
