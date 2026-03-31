#!/usr/bin/env node
/**
 * Compare Relay vs LI.FI BZZ-on-Gnosis matrix logs (same layout as relay/lifi matrix output).
 *
 * Usage:
 *   node compare-bzz-matrices.mjs <relay-log.txt> <lifi-log.txt> [--md out.md] [--csv out.csv]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROW_RE =
  /^(\w+)\t(\w+)\t([\d.]+)\t(\d+)\t(.*)$/;

function parseMatrixLog(text) {
  const lines = text.split(/\n/);
  const map = new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    if (line.startsWith("#") || !line.trim()) continue;
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, chain, token, usd, http, rest] = m;
    const okCompact = http === "200" && /^OK(\s|$)/i.test(rest);
    const okVerboseRelay = http === "200" && rest.startsWith("ok ");
    const okVerboseLifi = http === "200" && rest.startsWith("ok tool=");
    const rec = {
      chain,
      token,
      target_usd: usd,
      http,
      ok: okCompact || okVerboseRelay || okVerboseLifi,
      error: "",
    };
    if (!rec.ok) {
      if (/^FAIL\s/i.test(rest)) {
        rec.error = rest.replace(/^FAIL\s+/i, "").trim().slice(0, 60);
      } else if (rest.startsWith("ERROR")) {
        rec.error = rest.replace(/^ERROR\s+/, "").trim().slice(0, 60);
      } else {
        rec.error = rest.slice(0, 60);
      }
    }
    if (i < lines.length && lines[i].startsWith("requestId=")) {
      i += 1;
      if (i < lines.length && lines[i].startsWith("status_path=")) i += 1;
    } else if (i < lines.length && lines[i].startsWith("stepId=")) {
      i += 1;
    }
    map.set(`${chain}|${token}|${usd}`, rec);
  }
  return map;
}

const CHAINS = ["ethereum", "base", "gnosis"];
const TOKENS = ["NATIVE", "USDC", "USDT"];
const TIERS = ["0.1", "1", "10", "100"];

function outcome(r, ok) {
  if (!r) return "—";
  if (ok) return "OK";
  return `fail ${r.http}`;
}

function winner(relayOk, lifiOk) {
  if (relayOk && lifiOk) return "both";
  if (relayOk && !lifiOk) return "Relay only";
  if (!relayOk && lifiOk) return "LI.FI only";
  return "neither";
}

function csvEscape(s) {
  if (/[",\n]/.test(s)) return `"${String(s).replace(/"/g, '""')}"`;
  return String(s);
}

function main() {
  const args = process.argv.slice(2);
  let relayPath;
  let lifiPath;
  let mdPath = "";
  let csvPath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--md") {
      mdPath = args[i + 1];
      i++;
    } else if (args[i] === "--csv") {
      csvPath = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-")) {
      if (!relayPath) relayPath = args[i];
      else if (!lifiPath) lifiPath = args[i];
    }
  }
  if (!relayPath || !lifiPath) {
    console.error(
      "usage: node compare-bzz-matrices.mjs <relay-log.txt> <lifi-log.txt> [--md out.md] [--csv out.csv]",
    );
    process.exit(1);
  }
  const rp = resolve(relayPath);
  const lp = resolve(lifiPath);
  if (!existsSync(rp) || !existsSync(lp)) {
    console.error("Missing log file(s).");
    process.exit(1);
  }
  const relayMap = parseMatrixLog(readFileSync(rp, "utf8"));
  const lifiMap = parseMatrixLog(readFileSync(lp, "utf8"));

  let relayOk = 0;
  let lifiOk = 0;
  let both = 0;
  let relayOnly = 0;
  let lifiOnly = 0;
  let neither = 0;
  const rows = [];

  for (const chain of CHAINS) {
    for (const token of TOKENS) {
      for (const tier of TIERS) {
        const k = `${chain}|${token}|${tier}`;
        const r = relayMap.get(k);
        const l = lifiMap.get(k);
        const ro = !!(r && r.ok);
        const lo = !!(l && l.ok);
        if (ro) relayOk++;
        if (lo) lifiOk++;
        if (ro && lo) both++;
        else if (ro) relayOnly++;
        else if (lo) lifiOnly++;
        else neither++;
        rows.push({
          chain,
          token,
          tier,
          relay: r,
          lifi: l,
          ro,
          lo,
          win: winner(ro, lo),
        });
      }
    }
  }

  const total = CHAINS.length * TOKENS.length * TIERS.length;
  const summary = [
    `Compared ${basename(relayPath)} vs ${basename(lifiPath)} (${total} cells).`,
    "",
    `Relay OK:        ${relayOk}/${total}`,
    `LI.FI OK:        ${lifiOk}/${total}`,
    `Both OK:         ${both}`,
    `Relay only:      ${relayOnly}`,
    `LI.FI only:      ${lifiOnly}`,
    `Neither:         ${neither}`,
    "",
    relayOk === lifiOk
      ? "Same success count."
      : relayOk > lifiOk
        ? `Relay had more successes (+${relayOk - lifiOk}).`
        : `LI.FI had more successes (+${lifiOk - relayOk}).`,
  ].join("\n");

  console.log(summary);
  console.log("");

  const md = [];
  md.push("# Relay vs LI.FI — BZZ on Gnosis matrix comparison");
  md.push("");
  md.push(`Relay log: \`${basename(relayPath)}\` · LI.FI log: \`${basename(lifiPath)}\``);
  md.push("");
  md.push("## Summary");
  md.push("");
  md.push("| Metric | Count |");
  md.push("| --- | ---: |");
  md.push(`| Relay OK | ${relayOk} / ${total} |`);
  md.push(`| LI.FI OK | ${lifiOk} / ${total} |`);
  md.push(`| Both OK | ${both} |`);
  md.push(`| Relay only | ${relayOnly} |`);
  md.push(`| LI.FI only | ${lifiOnly} |`);
  md.push(`| Neither | ${neither} |`);
  md.push("");
  md.push("## Side-by-side (all cells)");
  md.push("");
  md.push(
    "| Origin | Token | Tier USD | Relay | LI.FI | Who wins |",
  );
  md.push("| --- | --- | ---: | --- | --- | --- |");
  for (const row of rows) {
    const rStr = outcome(row.relay, row.ro);
    const lStr = outcome(row.lifi, row.lo);
    md.push(
      `| ${row.chain} | ${row.token} | ${row.tier} | ${rStr} | ${lStr} | ${row.win} |`,
    );
  }
  md.push("");
  md.push("## Summary grid — Relay");
  md.push("");
  md.push("| Origin | Token | $0.10 | $1 | $10 | $100 |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const chain of CHAINS) {
    for (const token of TOKENS) {
      const cells = TIERS.map((t) => {
        const r = relayMap.get(`${chain}|${token}|${t}`);
        if (!r) return "—";
        return r.ok ? "OK" : "✗";
      });
      md.push(`| ${chain} | ${token} | ${cells.join(" | ")} |`);
    }
  }
  md.push("");
  md.push("## Summary grid — LI.FI");
  md.push("");
  md.push("| Origin | Token | $0.10 | $1 | $10 | $100 |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const chain of CHAINS) {
    for (const token of TOKENS) {
      const cells = TIERS.map((t) => {
        const r = lifiMap.get(`${chain}|${token}|${t}`);
        if (!r) return "—";
        return r.ok ? "OK" : "✗";
      });
      md.push(`| ${chain} | ${token} | ${cells.join(" | ")} |`);
    }
  }
  md.push("");

  if (mdPath) {
    writeFileSync(resolve(mdPath), md.join("\n"), "utf8");
    console.log(`Wrote ${mdPath}`);
  }
  if (csvPath) {
    const hdr = [
      "chain",
      "token",
      "target_usd",
      "relay_http",
      "relay_ok",
      "lifi_http",
      "lifi_ok",
      "winner",
    ];
    const lines = [hdr.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.chain,
          row.token,
          row.tier,
          row.relay?.http ?? "",
          row.ro ? "1" : "0",
          row.lifi?.http ?? "",
          row.lo ? "1" : "0",
          csvEscape(row.win),
        ].join(","),
      );
    }
    writeFileSync(resolve(csvPath), lines.join("\n"), "utf8");
    console.log(`Wrote ${csvPath}`);
  }
}

main();
