#!/usr/bin/env node
/**
 * Parse openocean-bzz.sh / run-matrix.mjs matrix logs (and compatible relay/lifi/sushi lines).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROW_RE =
  /^(\w+)\t(\w+)\t([\d.]+)\t(\d+)\t(.*)$/;
const OK_RE_RELAY =
  /in=\S+\s+[\d.]+\s+\(\$([\d.]+)\)\s+->\s+out=BZZ\s+([\d.]+)\s+\(\$([\d.]+)\)/;
const OK_RE_LIFI =
  /ok tool=\S+ in=\S+\s+[\d.]+\s+\(\$([\d.]+)\)\s+->\s+out=\S+\s+([\d.]+)\s+\(\$([\d.]+)\)/;
const OK_RE_SUSHI = /out=BZZ\s+([\d.]+)/;
const OK_RE_OO = /ok oo want=\S+\s+([\d.]+)/;

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
    const okVerboseSushi = http === "200" && rest.startsWith("ok sushi");
    const okVerboseOo = http === "200" && rest.startsWith("ok oo");
    const rec = {
      chain,
      token,
      target_usd: usd,
      http,
      ok:
        okCompact ||
        okVerboseRelay ||
        okVerboseLifi ||
        okVerboseSushi ||
        okVerboseOo,
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
        } else {
          om = rest.match(OK_RE_SUSHI);
          if (om) rec.bzz_out = om[1];
          else {
            om = rest.match(OK_RE_OO);
            if (om) rec.bzz_out = om[1];
          }
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
  if (text.includes("OpenOcean reverseQuote")) {
    return { kind: "OPENOCEAN", trade: "reverseQuote" };
  }
  if (text.includes("Sushi Quote")) return { kind: "SUSHI", trade: "EXACT_INPUT" };
  if (text.includes("LI.FI") && text.includes("toAmount")) return { kind: "LIFI", trade: "toAmount" };
  if (text.includes("tradeType=EXACT_INPUT")) return { kind: "RELAY", trade: "EXACT_INPUT" };
  return { kind: "RELAY", trade: "EXACT_OUTPUT" };
}

function writeMarkdown(rows, path, sourceLog, mode) {
  const usdOrder = ["0.1", "1", "10", "100"];
  const chains = [...new Set(rows.map((r) => r.chain))].sort();
  const tokens = [...new Set(rows.map((r) => r.token))];
  const tokenOrder = ["NATIVE", "USDC", "USDT"];
  const orderedTokens = tokenOrder.filter((t) => tokens.includes(t)).concat(
    tokens.filter((t) => !tokenOrder.includes(t)),
  );

  function cell(chain, token, usd) {
    for (const r of rows) {
      if (r.chain === chain && r.token === token && r.target_usd === usd) {
        if (r.ok) {
          if (r.bzz_out) return `OK — **${r.bzz_out}** BZZ`;
          return "OK";
        }
        return `**Fail** (${r.http}) — ${r.error || "error"}`;
      }
    }
    return "—";
  }

  const lines = [];
  let title = "# Matrix — parsed log";
  if (mode.kind === "OPENOCEAN") {
    title = "# OpenOcean reverseQuote — exact BZZ out (same-chain)";
  } else if (mode.kind === "SUSHI") {
    title = "# Sushi → BZZ — quote matrix (same-chain)";
  }
  lines.push(title);
  lines.push("");
  let modeNote;
  if (mode.kind === "OPENOCEAN") {
    modeNote =
      "Rows use **[OpenOcean v4 reverseQuote](https://docs.openocean.finance/docs/swap-api/advanced-usage/exact-out)** (**exact BZZ out**): `amountDecimals` is fixed BZZ received; **`reverseAmount`** is required pay token in. Same-chain only.";
  } else if (mode.kind === "SUSHI") {
    modeNote =
      "Rows use **[Sushi Quote v7](https://docs.sushi.com/api/examples/quote)** (**exact input**): `amount` is spend on that chain; **BZZ out** is estimated (`assumedAmountOut`). **Not cross-chain** — each row is `GET /quote/v7/{chainId}` on that chain only.";
  } else {
    modeNote = "See source log header for provider.";
  }
  lines.push(`Parsed from \`${sourceLog}\`. ${modeNote}`);
  lines.push("");
  lines.push("## Summary grid (target USD tier ≈ spend)");
  lines.push("");
  lines.push("| Origin | Token | $0.10 | $1 | $10 | $100 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const chain of chains.length ? chains : ["gnosis"]) {
    for (const token of orderedTokens.length ? orderedTokens : ["NATIVE", "USDC", "USDT"]) {
      if (!rows.some((r) => r.chain === chain && r.token === token)) continue;
      const cells = usdOrder.map((u) => cell(chain, token, u));
      lines.push(`| ${chain} | ${token} | ${cells.join(" | ")} |`);
    }
  }
  lines.push("");
  lines.push("## Full rows");
  lines.push("");
  const bzzCol =
    mode.kind === "OPENOCEAN" ? "BZZ out (quoted)" : "BZZ out (est.)";
  lines.push(`| Chain | Token | Target USD | HTTP | ${bzzCol} | Result |`);
  lines.push("| --- | --- | ---: | ---: | --- | --- |");
  for (const r of rows) {
    const res = r.ok ? "OK" : (r.error || "fail");
    const bzz = r.bzz_out || "—";
    lines.push(
      `| ${r.chain} | ${r.token} | ${r.target_usd} | ${r.http} | ${bzz} | ${res} |`,
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
