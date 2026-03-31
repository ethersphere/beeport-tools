#!/usr/bin/env node
/**
 * Parse relay-bzz.sh matrix log into Markdown + CSV tables.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROW_RE =
  /^(\w+)\t(\w+)\t([\d.]+)\t(\d+)\t(.*)$/;
const OK_RE =
  /in=\S+\s+[\d.]+\s+\(\$([\d.]+)\)\s+->\s+out=BZZ\s+([\d.]+)\s+\(\$([\d.]+)\)/;

function parseLog(text) {
  const lines = text.split(/\n/);
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    if (line.startsWith("#") || !line.trim()) continue;
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, chain, token, usd, http, rest] = m;
    const okCompact = http === "200" && /^OK(\s|$)/i.test(rest);
    const okVerbose = http === "200" && rest.startsWith("ok ");
    const rec = {
      chain,
      token,
      target_usd: usd,
      http,
      ok: okCompact || okVerbose,
      error: "",
      bzz_out: "",
      in_usd: "",
      out_usd: "",
      request_id: "",
    };
    if (rec.ok) {
      const om = rest.match(OK_RE);
      if (om) {
        rec.in_usd = om[1];
        rec.out_usd = om[3];
        rec.bzz_out = om[2];
      }
    } else if (/^FAIL\s/i.test(rest)) {
      rec.error = rest.replace(/^FAIL\s+/i, "").trim().slice(0, 80);
    } else if (rest.startsWith("ERROR")) {
      rec.error = rest.replace(/^ERROR\s+/, "").trim().slice(0, 80);
    } else {
      rec.error = rest.slice(0, 80);
    }
    if (i < lines.length && lines[i].startsWith("requestId=")) {
      rec.request_id = lines[i].split("=", 2)[1].trim();
      i += 1;
      if (i < lines.length && lines[i].startsWith("status_path=")) i += 1;
    }
    rows.push(rec);
  }
  return rows;
}

function csvEscape(s) {
  if (/[",\n]/.test(s)) return `"${String(s).replace(/"/g, '""')}"`;
  return String(s);
}

function writeCsv(rows, path) {
  const fields = [
    "chain",
    "token",
    "target_usd",
    "http",
    "ok",
    "bzz_out",
    "in_usd",
    "out_usd",
    "error",
    "request_id",
  ];
  const lines = [fields.join(",")];
  for (const r of rows) {
    lines.push(
      fields.map((f) => csvEscape(r[f])).join(","),
    );
  }
  writeFileSync(path, lines.join("\n"), "utf8");
}

function detectTradeType(text) {
  if (text.includes("tradeType=EXACT_INPUT")) return "EXACT_INPUT";
  return "EXACT_OUTPUT";
}

function writeMarkdown(rows, path, sourceLog, tradeType) {
  const usdOrder = ["0.1", "1", "10", "100"];
  const chains = ["ethereum", "base", "gnosis"];
  const tokens = ["NATIVE", "USDC", "USDT"];

  function cell(chain, token, usd) {
    for (const r of rows) {
      if (r.chain === chain && r.token === token && r.target_usd === usd) {
        if (r.ok) {
          if (r.bzz_out)
            return `OK — **${r.bzz_out}** BZZ (≈ $${r.out_usd} out)`;
          return "OK";
        }
        return `**Fail** (${r.http}) — ${r.error || "error"}`;
      }
    }
    return "—";
  }

  const lines = [];
  lines.push("# Relay → BZZ on Gnosis — quote matrix");
  lines.push("");
  const modeNote =
    tradeType === "EXACT_INPUT"
      ? "Rows use **EXACT_INPUT**: API `amount` is spend on the origin chain (native wei or stable 6 decimals) for the **target USD** tier."
      : "Rows use **EXACT_OUTPUT**: API `amount` is BZZ out (16 decimals); column *target USD* is the notional tier (BZZ out ≈ target ÷ **BZZ_PRICE_USD** from the log header, typically **$0.10/BZZ**).";
  lines.push(
    `Parsed from \`${sourceLog}\`. Destination: **Gnosis (100), BZZ**. ${modeNote}`,
  );
  lines.push("");
  lines.push("## Summary grid (target USD tier)");
  lines.push("");
  lines.push("| Origin | Token | $0.10 | $1 | $10 | $100 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const chain of chains) {
    for (const token of tokens) {
      const cells = usdOrder.map((u) => cell(chain, token, u));
      lines.push(`| ${chain} | ${token} | ${cells.join(" | ")} |`);
    }
  }
  lines.push("");
  lines.push("## Full rows (sortable)");
  lines.push("");
  lines.push(
    "| Chain | Token | Target USD | HTTP | BZZ out | Out USD | Result | requestId |",
  );
  lines.push("| --- | --- | ---: | ---: | --- | --- | --- | --- |");
  for (const r of rows) {
    let res;
    let bzz;
    let ousd;
    if (r.ok) {
      res = "OK";
      bzz = r.bzz_out || "—";
      ousd = r.out_usd || "—";
    } else {
      res = r.error || "fail";
      bzz = "—";
      ousd = "—";
    }
    const rid =
      r.request_id.length > 20
        ? `\`${r.request_id.slice(0, 18)}…\``
        : r.request_id
          ? `\`${r.request_id}\``
          : "—";
    lines.push(
      `| ${r.chain} | ${r.token} | ${r.target_usd} | ${r.http} | ${bzz} | ${ousd} | ${res} | ${rid} |`,
    );
  }
  lines.push("");
  writeFileSync(path, lines.join("\n"), "utf8");
}

function parseArgs(argv) {
  const out = { logFile: "last-matrix-run.txt", md: "last-matrix-table.md", csv: "last-matrix-table.csv" };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--md") {
      out.md = rest[i + 1];
      i++;
    } else if (rest[i] === "--csv") {
      out.csv = rest[i + 1];
      i++;
    } else if (!rest[i].startsWith("-")) {
      out.logFile = rest[i];
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const logPath = resolve(process.cwd(), args.logFile);
if (!existsSync(logPath)) {
  console.error(`Missing ${args.logFile}`);
  process.exit(1);
}
const text = readFileSync(logPath, "utf8");
const tradeType = detectTradeType(text);
const rows = parseLog(text);
const mdPath = resolve(process.cwd(), args.md);
const csvPath = resolve(process.cwd(), args.csv);
writeCsv(rows, csvPath);
writeMarkdown(rows, mdPath, basename(args.logFile), tradeType);
console.log(`Wrote ${args.md} and ${args.csv} (${rows.length} rows)`);
