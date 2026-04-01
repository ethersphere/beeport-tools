#!/usr/bin/env node
/**
 * Same matrix as openocean-bzz.sh via Node fetch (stdout by default).
 * Usage: node run-matrix.mjs [save-copy.txt]
 */
const OPENOCEAN_API = process.env.OPENOCEAN_API || "https://open-api.openocean.finance";
const DELAY_MS = Number(process.env.OPENOCEAN_QUOTE_DELAY || 0.25) * 1000;
const BZZ_PRICE_USD = process.env.BZZ_PRICE_USD || "0.1";
const SLIPPAGE = process.env.OPENOCEAN_SLIPPAGE || "3";
const CHAINS = (process.env.OPENOCEAN_CHAINS || "xdai")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BZZ = {
  xdai: "0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da",
  eth: process.env.BZZ_TOKEN_ETH || "",
  base: process.env.BZZ_TOKEN_BASE || "",
};
const USDC = {
  xdai: "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0",
  eth: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  base: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
};
const USDT = {
  xdai: "0x4ecaba5870353805a9f068101a40e0f32ed605c6",
  eth: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  base: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
};
const NAMES = { eth: "ethereum", base: "base", xdai: "gnosis" };
const TIERS = ["0.1", "1", "10", "100"];

function parseUsd18(s) {
  const t = s.trim();
  const [w, f = ""] = t.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  const whole = BigInt(w || "0");
  return whole * 10n ** 18n + BigInt(frac || "0");
}

function bzzOut(usdStr) {
  const usdS = parseUsd18(usdStr);
  const priceS = parseUsd18(BZZ_PRICE_USD);
  return String((usdS * 10n ** 16n) / priceS);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gasDecimals(chain) {
  if (process.env.OPENOCEAN_GAS_PRICE_DECIMALS) {
    return process.env.OPENOCEAN_GAS_PRICE_DECIMALS;
  }
  const res = await fetch(`${OPENOCEAN_API}/v4/${chain}/gasPrice`);
  const j = await res.json();
  if (j.code !== 200 || !j.data) throw new Error("gasPrice");
  const s = j.data.standard ?? j.data.fast;
  return String(BigInt(Math.round(Number(s) * 1e9)));
}

function summarizeCompact(body) {
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return "FAIL invalid-json";
  }
  if (j.code !== 200 || !j.data) {
    return `FAIL ${String(j.message || j.msg || "api").slice(0, 80)}`;
  }
  const d = j.data;
  if (d.reverseAmount == null || d.reverseAmount === "") return "FAIL no-reverseAmount";
  return "OK";
}

async function reverseQuote(chain, bzz, payToken, bzzAmt, gas, signal) {
  const u = new URL(`${OPENOCEAN_API}/v4/${chain}/reverseQuote`);
  u.searchParams.set("inTokenAddress", bzz);
  u.searchParams.set("outTokenAddress", payToken);
  u.searchParams.set("amountDecimals", bzzAmt);
  u.searchParams.set("gasPriceDecimals", gas);
  u.searchParams.set("slippage", SLIPPAGE);
  const res = await fetch(u.toString(), { signal });
  const text = await res.text();
  return { http: res.status, text };
}

async function main() {
  const savePath = process.argv[2];
  const lines = [];
  lines.push(`# OpenOcean reverseQuote | API=${OPENOCEAN_API} | chains=${CHAINS.join(",")}`);
  lines.push("# Exact BZZ out (tiers); pay token in NATIVE/USDC/USDT");
  lines.push("# Columns: origin_chain | origin_token | target_usd | http | summary");
  lines.push("");

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 120000);

  try {
    for (const chain of CHAINS) {
      const bzz = BZZ[chain];
      if (!bzz) {
        lines.push(`# skip ${chain}: set BZZ_TOKEN_ETH / BZZ_TOKEN_BASE`);
        continue;
      }
      const oname = NAMES[chain] || chain;
      const gas = await gasDecimals(chain);
      await sleep(DELAY_MS);

      for (const usd of TIERS) {
        const amt = bzzOut(usd);
        const { http, text } = await reverseQuote(chain, bzz, NATIVE, amt, gas, ac.signal);
        lines.push(`${oname}\tNATIVE\t${usd}\t${http}\t${summarizeCompact(text)}`);
        await sleep(DELAY_MS);
      }

      const usdc = USDC[chain];
      if (usdc) {
        for (const usd of TIERS) {
          const amt = bzzOut(usd);
          const { http, text } = await reverseQuote(chain, bzz, usdc, amt, gas, ac.signal);
          lines.push(`${oname}\tUSDC\t${usd}\t${http}\t${summarizeCompact(text)}`);
          await sleep(DELAY_MS);
        }
      }

      const usdt = USDT[chain];
      if (usdt) {
        for (const usd of TIERS) {
          const amt = bzzOut(usd);
          const { http, text } = await reverseQuote(chain, bzz, usdt, amt, gas, ac.signal);
          lines.push(`${oname}\tUSDT\t${usd}\t${http}\t${summarizeCompact(text)}`);
          await sleep(DELAY_MS);
        }
      }
    }
  } finally {
    clearTimeout(to);
  }

  const { writeFileSync } = await import("node:fs");
  const text = lines.join("\n") + "\n";
  process.stdout.write(text);
  const cells = lines.filter((l) => l.includes("\t") && !l.startsWith("#")).length;
  const ok = lines.filter((l) => /\t200\tOK$/.test(l)).length;
  if (savePath) {
    writeFileSync(savePath, text, "utf8");
    console.error(`Also saved ${savePath} (${cells} cells, ${ok} OK)`);
  } else {
    console.error(`Done: ${cells} cells, ${ok} OK (matrix on stdout)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
