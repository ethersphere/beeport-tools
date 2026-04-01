#!/usr/bin/env node
/**
 * OpenOcean Swap API v4 — reverseQuote (exact BZZ out → required pay token in).
 * Docs: https://docs.openocean.finance/docs/swap-api/v4
 * Exact-out flow: https://docs.openocean.finance/docs/swap-api/advanced-usage/exact-out
 *
 * reverseQuote naming (OpenOcean): inToken = asset you want to RECEIVE (BZZ),
 * outToken = asset you SELL (xDAI/USDC/USDT), amountDecimals = receive amount (BZZ smallest units).
 */
import { readFileSync } from "node:fs";

function parseUsd18(s) {
  const t = s.trim();
  const [w, f = ""] = t.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  const whole = BigInt(w || "0");
  return whole * 10n ** 18n + BigInt(frac || "0");
}

function buildReverseUrl(base, chain, inToken, outToken, amountDecimals, gasPriceDecimals, slippage) {
  const u = new URL(`${base.replace(/\/$/, "")}/v4/${chain}/reverseQuote`);
  u.searchParams.set("inTokenAddress", inToken);
  u.searchParams.set("outTokenAddress", outToken);
  u.searchParams.set("amountDecimals", String(amountDecimals));
  u.searchParams.set("gasPriceDecimals", String(gasPriceDecimals));
  u.searchParams.set("slippage", String(slippage));
  return u.toString();
}

function formatRawAmount(rawStr, decimals) {
  const d = Number(decimals);
  if (rawStr == null || d < 0 || d > 36) return String(rawStr ?? "");
  const n = BigInt(String(rawStr));
  const base = 10n ** BigInt(d);
  const whole = n / base;
  const frac = n % base;
  if (frac === 0n) return whole.toString();
  const fracS = frac.toString().padStart(d, "0").replace(/0+$/, "");
  return `${whole}.${fracS}`;
}

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
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
    case "gas-price-decimals": {
      const chain = process.argv[3];
      const apiBase = process.argv[4] || "https://open-api.openocean.finance";
      const override = process.env.OPENOCEAN_GAS_PRICE_DECIMALS;
      if (override) {
        console.log(override);
        break;
      }
      const url = `${apiBase}/v4/${chain}/gasPrice`;
      const res = await fetch(url);
      const j = await res.json();
      if (j.code !== 200 || !j.data) throw new Error(`gasPrice: ${JSON.stringify(j).slice(0, 200)}`);
      const s = j.data.standard ?? j.data.fast ?? j.data.instant;
      if (s == null) throw new Error("no standard gas in response");
      // Integer from API is treated as gwei → wei (matches BSC-style examples using ~1e9 scale).
      const wei = BigInt(Math.round(Number(s) * 1e9));
      console.log(String(wei));
      break;
    }
    case "reverse-quote-url": {
      const base = process.argv[3];
      const chain = process.argv[4];
      const inToken = process.argv[5];
      const outToken = process.argv[6];
      const amountDecimals = process.argv[7];
      const gasPriceDecimals = process.argv[8];
      const slippage = process.argv[9] || "3";
      console.log(
        buildReverseUrl(base, chain, inToken, outToken, amountDecimals, gasPriceDecimals, slippage),
      );
      break;
    }
    case "summarize-openocean": {
      const path = process.argv[3];
      const mode = process.argv[4] === "verbose" ? "verbose" : "compact";
      const raw = readFileSync(path, "utf8");
      let j;
      try {
        j = JSON.parse(raw);
      } catch {
        if (mode === "compact") console.log("FAIL invalid-json");
        else console.log(`ERROR non-json ${raw.slice(0, 120)}`);
        break;
      }
      if (j.code !== 200 || !j.data) {
        const msg = j.message || j.msg || JSON.stringify(j).slice(0, 120);
        if (mode === "compact") console.log(`FAIL ${String(msg).slice(0, 80)}`);
        else console.log(`ERROR ${msg}`);
        break;
      }
      const d = j.data;
      if (d.reverseAmount == null || d.reverseAmount === "") {
        if (mode === "compact") console.log("FAIL no-reverseAmount");
        else console.log("ERROR missing reverseAmount");
        break;
      }
      if (mode === "compact") {
        console.log("OK");
        break;
      }
      const pay = d.outToken || {};
      const want = d.inToken || {};
      const paySym = pay.symbol || "?";
      const wantSym = want.symbol || "BZZ";
      const payDec = pay.decimals ?? 18;
      const revStr =
        d.reverseAmount != null
          ? formatRawAmount(String(d.reverseAmount), payDec)
          : "?";
      const bzzStr =
        d.inAmount != null ? formatRawAmount(String(d.inAmount), want.decimals ?? 16) : "?";
      console.log(
        `ok oo want=${wantSym} ${bzzStr} <- pay≈${paySym} ${revStr} (price_impact=${d.price_impact ?? "n/a"})`,
      );
      break;
    }
    case "json-pretty": {
      const stdin = readFileSync(0, "utf8");
      console.log(JSON.stringify(JSON.parse(stdin), null, 2));
      break;
    }
    default:
      console.error(
        "usage: openocean-cli-helpers.mjs <bzz-out-amount|gas-price-decimals|reverse-quote-url|summarize-openocean|json-pretty> ...",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
