#!/usr/bin/env node
/**
 * Parse lifi-bzz.sh (or relay) matrix log into Markdown + CSV tables.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROW_RE =
  /^(\w+)\t(\w+)\t([\d.]+)\t(\d+)\t(.*)$/;
const OK_RE_RELAY =
  /in=\S+\s+[\d.]+\s+\(\$([\d.]+)\)\s+->\s+out=BZZ\s+([\d.]+)\s+\(\$([\d.]+)\)/;
const OK_RE_LIFI =
  /ok tool=\S+ in=\S+\s+[\d.]+\s+\(\$([\d.]+)\)\s+->\s+out=\S+\s+([\d.]+)\s+\(\$([\d.]+)\)/;

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
    const okVerboseRelay = http === "200" && rest.startsWith("ok ");
    const okVerboseLifi = http === "200" && rest.startsWith("ok tool=");
    const rec = {
      chain,
      token,
      target_usd: usd,
      http,
      ok: okCompact || okVerboseRelay || okVerboseLifi,
      error: "",
      bzz_out: "",
      in_usd: "",
      out_usd: "",
      request_id: "",
    };
    if (rec.ok) {
      let om = rest.match(OK_RE_RELAY);
      if (om) {
        rec.in_usd = om[1];
        rec.bzz_out = om[2];
        rec.out_usd = om[3];
      } else {
        om = rest.match(OK_RE_LIFI);
        if (om) {
          rec.in_usd = om[1];
          rec.bzz_out = om[2];
          rec.out_usd = om[3];
        }
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
    } else if (i < lines.length && lines[i].startsWith("stepId=")) {
      rec.request_id = lines[i].split("=", 2)[1].trim();
      i += 1;
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

function detectMode(text) {
  if (text.includes("LI.FI") && text.includes("toAmount")) return { kind: "LIFI", trade: "toAmount" };
  if (text.includes("tradeType=EXACT_INPUT")) return { kind: "RELAY", trade: "EXACT_INPUT" };
  return { kind: "RELAY", trade: "EXACT_OUTPUT" };
}

function writeMarkdown(rows, path, sourceLog, mode) {
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
  const title =
    mode.kind === "LIFI"
      ? "# LI.FI → BZZ on Gnosis — quote matrix (`/v1/quote/toAmount`)"
      : "# Relay → BZZ on Gnosis — quote matrix";
  lines.push(title);
  lines.push("");
  let modeNote;
  if (mode.kind === "LIFI") {
    modeNote =
      "Rows use LI.FI **[toAmount](https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer-1)** (destination amount fixed): `toAmount` is BZZ in 16 decimals; tier USD maps via **BZZ_PRICE_USD** in the log header.";
  } else if (mode.trade === "EXACT_INPUT") {
    modeNote =
      "Rows use **EXACT_INPUT**: spend on origin ≈ **target USD** tier (native wei or stable 6 decimals).";
  } else {
    modeNote =
      "Rows use **EXACT_OUTPUT**: BZZ out (16 decimals); tier ≈ target ÷ **BZZ_PRICE_USD** (e.g. $0.10/BZZ).";
  }
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
    "| Chain | Token | Target USD | HTTP | BZZ out | Out USD | Result | step/request |",
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
const mode = detectMode(text);
const rows = parseLog(text);
const mdPath = resolve(process.cwd(), args.md);
const csvPath = resolve(process.cwd(), args.csv);
writeCsv(rows, csvPath);
writeMarkdown(rows, mdPath, basename(args.logFile), mode);
console.log(`Wrote ${args.md} and ${args.csv} (${rows.length} rows)`);
