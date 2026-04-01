#!/usr/bin/env node
/**
 * Run the same matrix as sushi-bzz.sh without bash/curl (Node fetch only).
 * Usage:
 *   node run-matrix.mjs              # print matrix to stdout (CLI)
 *   node run-matrix.mjs log.txt     # same, also save a copy to log.txt
 */
import { writeFileSync } from "node:fs";

const SUSHI_API = process.env.SUSHI_API || "https://api.sushi.com";
const DELAY_MS = Number(process.env.SUSHI_QUOTE_DELAY || 0.2) * 1000;
const MAX_SLIPPAGE = process.env.SUSHI_MAX_SLIPPAGE || "0.03";
const CHAINS = (process.env.SUSHI_CHAINS || "100")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !Number.isNaN(n));

const NATIVE_IN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BZZ_GNOSIS = "0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da";

const WRAPPED_NATIVE = {
  1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  8453: "0x4200000000000000000000000000000000000006",
  100: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
};

const USDC = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  8453: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  100: "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0",
};
const USDT = {
  1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  8453: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  100: "0x4ecaba5870353805a9f068101a40e0f32ed605c6",
};

const CHAIN_NAMES = { 1: "ethereum", 8453: "base", 100: "gnosis" };
const TIERS = ["0.1", "1", "10", "100"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function nativeWei(chainId, usd) {
  const w = WRAPPED_NATIVE[chainId];
  if (!w) throw new Error(`no wrapped native for ${chainId}`);
  const url = `${SUSHI_API}/price/v1/${chainId}/${w}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`price ${res.status}`);
  const price = await res.json();
  return BigInt(Math.round((usd / price) * 1e18));
}

function stableAmount(usd) {
  return BigInt(Math.round(parseFloat(usd) * 1e6));
}

function bzzForChain(cid) {
  if (cid === 100) return BZZ_GNOSIS;
  if (cid === 1) return process.env.BZZ_TOKEN_ETHEREUM || "";
  if (cid === 8453) return process.env.BZZ_TOKEN_BASE || "";
  return "";
}

function quoteUrl(chainId, tokenIn, tokenOut, amount) {
  const u = new URL(`${SUSHI_API}/quote/v7/${chainId}`);
  u.searchParams.set("tokenIn", tokenIn);
  u.searchParams.set("tokenOut", tokenOut);
  u.searchParams.set("amount", String(amount));
  u.searchParams.set("maxSlippage", String(MAX_SLIPPAGE));
  return u.toString();
}

function summarizeCompact(body, http) {
  let d;
  try {
    d = JSON.parse(body);
  } catch {
    return "FAIL invalid-json";
  }
  if (d.status === "Success" && d.assumedAmountOut != null) return "OK";
  if (Number(d.status) === 422 || (d.errors && Array.isArray(d.errors))) {
    const det = (d.errors && d.errors[0] && d.errors[0].detail) || d.detail || "validation";
    return `FAIL ${String(det).slice(0, 80)}`;
  }
  return `FAIL ${String(d.title || d.status || http).slice(0, 80)}`;
}

async function main() {
  const savePath = process.argv[2];
  const lines = [];
  lines.push(`# Sushi Quote v7 → BZZ matrix | API=${SUSHI_API} | chains=${CHAINS.join(",")}`);
  lines.push("# Exact INPUT: amount = spend on origin for target USD tier");
  lines.push("# Columns: origin_chain | origin_token | target_usd | http | summary");
  lines.push("");

  for (const cid of CHAINS) {
    const oname = CHAIN_NAMES[cid] || `chain-${cid}`;
    const bzz = bzzForChain(cid);
    if (!bzz) {
      lines.push(`# skip chain ${cid}: set BZZ token env`);
      continue;
    }
    const c = cid;

    for (const usd of TIERS) {
      const amt = await nativeWei(c, parseFloat(usd));
      const url = quoteUrl(String(c), NATIVE_IN, bzz, amt);
      const res = await fetch(url);
      const body = await res.text();
      lines.push(`${oname}\tNATIVE\t${usd}\t${res.status}\t${summarizeCompact(body, res.status)}`);
      await sleep(DELAY_MS);
    }

    const usdc = USDC[c];
    if (usdc) {
      for (const usd of TIERS) {
        const amt = stableAmount(usd);
        const url = quoteUrl(String(c), usdc, bzz, amt);
        const res = await fetch(url);
        const body = await res.text();
        lines.push(`${oname}\tUSDC\t${usd}\t${res.status}\t${summarizeCompact(body, res.status)}`);
        await sleep(DELAY_MS);
      }
    }

    const usdt = USDT[c];
    if (usdt) {
      for (const usd of TIERS) {
        const amt = stableAmount(usd);
        const url = quoteUrl(String(c), usdt, bzz, amt);
        const res = await fetch(url);
        const body = await res.text();
        lines.push(`${oname}\tUSDT\t${usd}\t${res.status}\t${summarizeCompact(body, res.status)}`);
        await sleep(DELAY_MS);
      }
    }
  }

  const text = lines.join("\n") + "\n";
  process.stdout.write(text);
  const cells = lines.filter((l) => l.includes("\t") && !l.startsWith("#")).length;
  const ok = lines.filter((l) => /\t200\tOK$/.test(l)).length;
  if (savePath) {
    writeFileSync(savePath, text, "utf8");
    console.error(`Also saved ${savePath} (${cells} cells, ${ok} OK)`);
  } else {
    console.error(`Done: ${cells} cells, ${ok} OK (matrix is on stdout above)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
