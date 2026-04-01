#!/usr/bin/env node
/**
 * Helpers for sushi-bzz.sh — Sushi Quote API v7 (same-chain only).
 * Docs: https://docs.sushi.com/api/examples/quote
 */
import { readFileSync } from "node:fs";

const WRAPPED_NATIVE = {
  1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  8453: "0x4200000000000000000000000000000000000006",
  100: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
};

function formatTokenAmount(rawStr, decimals) {
  const d = Number(decimals);
  if (rawStr === undefined || rawStr === null || d < 0 || d > 36) return String(rawStr ?? "");
  const n = BigInt(String(rawStr));
  const neg = n < 0n;
  const v = neg ? -n : n;
  const base = 10n ** BigInt(d);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return (neg ? "-" : "") + whole.toString();
  const fracS = frac.toString().padStart(d, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + `${whole}.${fracS}`;
}

function buildQuoteUrl(base, chainId, tokenIn, tokenOut, amount, maxSlippage) {
  const u = new URL(`${base.replace(/\/$/, "")}/quote/v7/${chainId}`);
  u.searchParams.set("tokenIn", tokenIn);
  u.searchParams.set("tokenOut", tokenOut);
  u.searchParams.set("amount", String(amount));
  u.searchParams.set("maxSlippage", String(maxSlippage));
  return u.toString();
}

function tokenMeta(tokens, idx) {
  if (!Array.isArray(tokens) || idx == null) return { symbol: "?", decimals: 18 };
  const t = tokens[idx];
  if (!t) return { symbol: "?", decimals: 18 };
  return { symbol: t.symbol || "?", decimals: t.decimals ?? 18 };
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "stable-amount": {
      const usd = parseFloat(process.argv[3]);
      console.log(String(Math.round(usd * 1e6)));
      break;
    }
    case "native-wei-sushi": {
      const chainId = process.argv[3];
      const usd = parseFloat(process.argv[4]);
      const apiBase = process.argv[5] || "https://api.sushi.com";
      const wrapped = WRAPPED_NATIVE[chainId];
      if (!wrapped) throw new Error(`native-wei-sushi: unsupported chainId ${chainId}`);
      const url = `${apiBase}/price/v1/${chainId}/${wrapped}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`price API ${res.status}`);
      const price = await res.json();
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
        throw new Error("invalid price response");
      }
      const wei = BigInt(Math.round((usd / price) * 1e18));
      console.log(String(wei));
      break;
    }
    case "quote-url": {
      const base = process.argv[3];
      const chainId = process.argv[4];
      const tokenIn = process.argv[5];
      const tokenOut = process.argv[6];
      const amount = process.argv[7];
      const maxSlippage = process.argv[8] || "0.03";
      console.log(
        buildQuoteUrl(base, chainId, tokenIn, tokenOut, BigInt(amount), maxSlippage),
      );
      break;
    }
    case "summarize-sushi-quote": {
      const path = process.argv[3];
      const mode = process.argv[4] === "verbose" ? "verbose" : "compact";
      const raw = readFileSync(path, "utf8");
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        if (mode === "compact") console.log("FAIL invalid-json");
        else console.log(`ERROR non-json ${raw.slice(0, 120)}`);
        break;
      }
      if (d.status === "Success" && d.assumedAmountOut != null) {
        if (mode === "compact") {
          console.log("OK");
        } else {
          const tin = tokenMeta(d.tokens, d.tokenFrom);
          const tout = tokenMeta(d.tokens, d.tokenTo);
          const humanIn = formatTokenAmount(d.amountIn, tin.decimals);
          const humanOut = formatTokenAmount(d.assumedAmountOut, tout.decimals);
          const impact =
            d.priceImpact !== undefined ? String(d.priceImpact) : "";
          console.log(
            `ok sushi in=${tin.symbol} ${humanIn} -> out=${tout.symbol} ${humanOut} (priceImpact=${impact})`,
          );
        }
        break;
      }
      if (Number(d.status) === 422 || (d.errors && Array.isArray(d.errors))) {
        const det =
          (d.errors && d.errors[0] && d.errors[0].detail) || d.detail || d.title || "validation";
        if (mode === "compact") console.log(`FAIL ${String(det).slice(0, 80)}`);
        else console.log(`ERROR ${JSON.stringify(d).slice(0, 300)}`);
        break;
      }
      const msg = d.title || d.detail || d.status || "no-quote";
      if (mode === "compact") console.log(`FAIL ${String(msg).slice(0, 80)}`);
      else console.log(`ERROR ${JSON.stringify(d).slice(0, 300)}`);
      break;
    }
    case "json-pretty": {
      const stdin = readFileSync(0, "utf8");
      console.log(JSON.stringify(JSON.parse(stdin), null, 2));
      break;
    }
    default:
      console.error(
        "usage: sushi-cli-helpers.mjs <stable-amount|native-wei-sushi|quote-url|summarize-sushi-quote|json-pretty> ...",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
