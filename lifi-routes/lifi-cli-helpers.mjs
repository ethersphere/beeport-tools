#!/usr/bin/env node
/**
 * Helpers for lifi-bzz.sh — LI.FI GET /v1/quote/toAmount (exact output on destination).
 * Docs: https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer-1
 */
import { readFileSync } from "node:fs";

function parseUsd18(s) {
  const t = s.trim();
  const [w, f = ""] = t.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  const whole = BigInt(w || "0");
  return whole * 10n ** 18n + BigInt(frac || "0");
}

function formatTokenAmount(rawStr, decimals) {
  const d = Number(decimals);
  if (!rawStr || d < 0 || d > 36) return rawStr || "";
  const n = BigInt(rawStr);
  const neg = n < 0n;
  const v = neg ? -n : n;
  const base = 10n ** BigInt(d);
  const whole = v / base;
  const frac = v % base;
  if (frac === 0n) return (neg ? "-" : "") + whole.toString();
  const fracS = frac.toString().padStart(d, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + `${whole}.${fracS}`;
}

function buildToAmountUrl(base, params) {
  const u = new URL(`${base.replace(/\/$/, "")}/v1/quote/toAmount`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "stable-amount": {
      const usd = parseFloat(process.argv[3]);
      console.log(String(Math.round(usd * 1e6)));
      break;
    }
    case "bzz-out-amount": {
      const usdStr = process.argv[3];
      const priceStr = process.argv[4];
      const usdS = parseUsd18(usdStr);
      const priceS = parseUsd18(priceStr);
      if (priceS === 0n) throw new Error("BZZ_PRICE_USD must be non-zero");
      const amt = (usdS * 10n ** 16n) / priceS;
      console.log(String(amt));
      break;
    }
    case "quote-toamount-url": {
      const base = process.argv[3];
      const fromChain = process.argv[4];
      const toChain = process.argv[5];
      const fromToken = process.argv[6];
      const toToken = process.argv[7];
      const fromAddress = process.argv[8];
      const toAmount = process.argv[9];
      const slippage = process.argv[10] || "0.03";
      const order = process.argv[11] || "CHEAPEST";
      const integrator = process.env.LIFI_INTEGRATOR || "";
      const params = {
        fromChain,
        toChain,
        fromToken: fromToken.toLowerCase(),
        toToken: toToken.toLowerCase(),
        fromAddress,
        toAmount: String(BigInt(toAmount)),
        slippage,
        order,
      };
      if (integrator) params.integrator = integrator;
      console.log(buildToAmountUrl(base, params));
      break;
    }
    case "summarize-lifi-quote": {
      const path = process.argv[3];
      const mode = process.argv[4] === "verbose" ? "verbose" : "compact";
      const raw = readFileSync(path, "utf8");
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        if (mode === "compact") console.log("FAIL invalid-json");
        else console.log(`ERROR non-json body ${raw.slice(0, 200).replace(/\n/g, " ")}`);
        break;
      }
      const msg = d.message || d.errorMessage || (d.errors && String(d.errors));
      if (msg && !d.action) {
        const short = String(msg).trim().split("\n")[0].slice(0, 120);
        if (mode === "compact") console.log(`FAIL ${short}`);
        else console.log(`ERROR ${short}`);
        break;
      }
      const action = d.action;
      const est = d.estimate;
      if (!action || !est) {
        if (mode === "compact") console.log("FAIL no-step");
        else console.log("ERROR missing action/estimate");
        break;
      }
      if (mode === "compact") {
        console.log("OK");
        break;
      }
      const fin = action.fromToken || {};
      const tout = action.toToken || {};
      const symIn = fin.symbol || "?";
      const symOut = tout.symbol || "?";
      const decIn = fin.decimals ?? 18;
      const decOut = tout.decimals ?? 18;
      const humanIn = formatTokenAmount(est.fromAmount || action.fromAmount, decIn);
      const humanOut = formatTokenAmount(est.toAmount, decOut);
      const inUsd = est.fromAmountUSD ?? "";
      const outUsd = est.toAmountUSD ?? "";
      const tool = d.tool || d.type || "";
      console.log(
        `ok tool=${tool} in=${symIn} ${humanIn} ($${inUsd}) -> out=${symOut} ${humanOut} ($${outUsd})`,
      );
      if (d.id) console.log(`stepId=${d.id}`);
      break;
    }
    case "json-pretty": {
      const stdin = readFileSync(0, "utf8");
      console.log(JSON.stringify(JSON.parse(stdin), null, 2));
      break;
    }
    default:
      console.error(
        "usage: lifi-cli-helpers.mjs <stable-amount|bzz-out-amount|quote-toamount-url|summarize-lifi-quote|json-pretty> ...",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
