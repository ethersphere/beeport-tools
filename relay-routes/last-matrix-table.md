# Relay → BZZ on Gnosis — quote matrix

Parsed from `last-matrix-run.txt`. Destination: **Gnosis (100), BZZ**. Rows use **EXACT_OUTPUT**: API `amount` is BZZ out (16 decimals); column *target USD* is the notional tier (BZZ out ≈ target ÷ **BZZ_PRICE_USD** from the log header, typically **$0.10/BZZ**).

## Summary grid (target USD tier)

| Origin | Token | $0.10 | $1 | $10 | $100 |
| --- | --- | --- | --- | --- | --- |
| ethereum | NATIVE | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| ethereum | USDC | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| ethereum | USDT | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| base | NATIVE | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| base | USDC | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | OK — **1000.0** BZZ (≈ $92.675906 out) |
| base | USDT | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| gnosis | NATIVE | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| gnosis | USDC | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |
| gnosis | USDT | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found | OK — **100.0** BZZ (≈ $9.267591 out) | **Fail** (400) — NO_SWAP_ROUTES_FOUND no routes found |

## Full rows (sortable)

| Chain | Token | Target USD | HTTP | BZZ out | Out USD | Result | requestId |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| ethereum | NATIVE | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | NATIVE | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | NATIVE | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | NATIVE | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDC | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDC | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDC | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDC | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDT | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDT | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDT | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| ethereum | USDT | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | NATIVE | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | NATIVE | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | NATIVE | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | NATIVE | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDC | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDC | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDC | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDC | 100 | 200 | 1000.0 | 92.675906 | OK | `0x78d4c0dc2fbd56da…` |
| base | USDT | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDT | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDT | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| base | USDT | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | NATIVE | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | NATIVE | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | NATIVE | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | NATIVE | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDC | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDC | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDC | 10 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDC | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDT | 0.1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDT | 1 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
| gnosis | USDT | 10 | 200 | 100.0 | 9.267591 | OK | `0xb2dcd7d45397e974…` |
| gnosis | USDT | 100 | 400 | — | — | NO_SWAP_ROUTES_FOUND no routes found | — |
