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
| `format-matrix-log.py` | Turn `relay-bzz.sh` matrix log output into **Markdown** and **CSV** tables for review or sharing. |

Requirements: `bash`, `curl`, and `python3` where noted. See comments at the top of each script for usage and environment variables (e.g. `RELAY_API`, `RELAY_QUOTE_DELAY`, `BZZ_PRICE_USD`).
