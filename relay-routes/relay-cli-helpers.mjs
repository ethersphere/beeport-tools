#!/usr/bin/env node
/**
 * Small helpers for relay-bzz.sh (no npm deps). Subcommands via argv[2].
 */
import { readFileSync } from "node:fs";

function parseUsd18(s) {
  const t = s.trim();
  const [w, f = ""] = t.split(".");
  const frac = (f + "000000000000000000").slice(0, 18);
  const whole = BigInt(w || "0");
  return whole * 10n ** 18n + BigInt(frac || "0");
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
    case "native-wei": {
      const cid = process.argv[3];
      const usd = parseFloat(process.argv[4]);
      const base = process.argv[5];
      const addr = process.argv[6];
      const url = `${base}/currencies/token/price?chainId=${cid}&address=${addr}`;
      const res = await fetch(url);
      const j = await res.json();
      const price = j.price;
      const wei = BigInt(Math.round((usd / price) * 1e18));
      console.log(String(wei));
      break;
    }
    case "quote-json": {
      const user = process.argv[3];
      const ocid = process.argv[4];
      const dcid = process.argv[5];
      const ocur = process.argv[6];
      const dcur = process.argv[7];
      const amount = process.argv[8];
      const tt = process.argv[9] || "EXACT_OUTPUT";
      const body = {
        user,
        originChainId: parseInt(ocid, 10),
        destinationChainId: parseInt(dcid, 10),
        originCurrency: ocur.toLowerCase(),
        destinationCurrency: dcur.toLowerCase(),
        amount: String(BigInt(amount)),
        tradeType: tt,
      };
      console.log(JSON.stringify(body));
      break;
    }
    case "summarize-quote": {
      const path = process.argv[3];
      const mode = process.argv[4] === "verbose" ? "verbose" : "compact";
      const raw = readFileSync(path, "utf8");
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        const one = raw.slice(0, 200).replace(/\n/g, " ");
        if (mode === "compact") {
          console.log("FAIL invalid-json");
        } else {
          console.log(`ERROR non-json body ${one}`);
        }
        break;
      }
      if (d.message) {
        const code = d.errorCode || "";
        const msg = String(d.message).trim().split("\n")[0];
        if (mode === "compact") {
          console.log(code ? `FAIL ${code}` : `FAIL ${msg.slice(0, 80)}`);
        } else {
          console.log(`ERROR ${code} ${String(d.message).slice(0, 200)}`);
        }
        break;
      }
      if (mode === "compact") {
        console.log("OK");
        break;
      }
      const det = d.details || {};
      const cin = det.currencyIn || {};
      const cout = det.currencyOut || {};
      const op = det.operation;
      let rid;
      for (const s of d.steps || []) {
        if (s.requestId) {
          rid = s.requestId;
          break;
        }
      }
      let check;
      outer: for (const s of d.steps || []) {
        for (const it of s.items || []) {
          const c = it.check || {};
          if (c.endpoint) {
            check = c.endpoint;
            break outer;
          }
        }
      }
      const symIn = (cin.currency || {}).symbol;
      const symOut = (cout.currency || {}).symbol;
      const inf = cin.amountFormatted ?? "";
      const inU = cin.amountUsd ?? "";
      const outf = cout.amountFormatted ?? "";
      const outU = cout.amountUsd ?? "";
      console.log(
        `ok op=${op} in=${symIn} ${inf} ($${inU}) -> out=${symOut} ${outf} ($${outU})`,
      );
      console.log(`requestId=${rid != null ? rid : ""}`);
      if (check) console.log(`status_path=${check}`);
      break;
    }
    case "json-pretty": {
      const stdin = readFileSync(0, "utf8");
      console.log(JSON.stringify(JSON.parse(stdin), null, 2));
      break;
    }
    default:
      console.error(
        "usage: relay-cli-helpers.mjs <stable-amount|bzz-out-amount|native-wei|quote-json|summarize-quote|json-pretty> ...",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
