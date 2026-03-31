#!/usr/bin/env python3
"""Parse relay-bzz.sh matrix log into Markdown + CSV tables.

Expects matrix output with tradeType EXACT_OUTPUT: `target_usd` is the label tier
($0.1..$100); BZZ out size is implied by BZZ_PRICE_USD in the log header (default $0.10/BZZ).
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

ROW_RE = re.compile(
    r"^(?P<chain>\w+)\t(?P<token>\w+)\t(?P<usd>[\d.]+)\t(?P<http>\d+)\t(?P<rest>.*)$"
)
OK_RE = re.compile(
    r"in=\S+\s+[\d.]+\s+\(\$(?P<in_usd>[\d.]+)\)\s+->\s+out=BZZ\s+(?P<bzz>[\d.]+)\s+\(\$(?P<out_usd>[\d.]+)\)"
)


def parse_log(text: str) -> list[dict]:
    rows: list[dict] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if line.startswith("#") or not line.strip():
            continue
        m = ROW_RE.match(line)
        if not m:
            continue
        d = m.groupdict()
        http = d["http"]
        rest = d["rest"]
        rec = {
            "chain": d["chain"],
            "token": d["token"],
            "target_usd": d["usd"],
            "http": http,
            "ok": http == "200" and rest.startswith("ok "),
            "error": "",
            "bzz_out": "",
            "in_usd": "",
            "out_usd": "",
            "request_id": "",
        }
        if rec["ok"]:
            om = OK_RE.search(rest)
            if om:
                rec["in_usd"] = om.group("in_usd")
                rec["out_usd"] = om.group("out_usd")
                rec["bzz_out"] = om.group("bzz")
        elif rest.startswith("ERROR"):
            rec["error"] = rest.replace("ERROR ", "").strip()[:80]
        else:
            rec["error"] = rest[:80]
        if i < len(lines) and lines[i].startswith("requestId="):
            rec["request_id"] = lines[i].split("=", 1)[1].strip()
            i += 1
            if i < len(lines) and lines[i].startswith("status_path="):
                i += 1
        rows.append(rec)
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    fields = [
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
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def write_markdown(rows: list[dict], path: Path, source_log: str) -> None:
    usd_order = ["0.1", "1", "10", "100"]
    chains = ["ethereum", "base", "gnosis"]
    tokens = ["NATIVE", "USDC", "USDT"]

    def cell(chain: str, token: str, usd: str) -> str:
        for r in rows:
            if r["chain"] == chain and r["token"] == token and r["target_usd"] == usd:
                if r["ok"]:
                    return f"OK — **{r['bzz_out']}** BZZ (≈ ${r['out_usd']} out)"
                return f"**Fail** ({r['http']}) — {r['error'] or 'error'}"
        return "—"

    lines: list[str] = []
    lines.append("# Relay → BZZ on Gnosis — quote matrix (EXACT_OUTPUT)")
    lines.append("")
    lines.append(
        f"Parsed from `{source_log}`. Destination: **Gnosis (100), BZZ**. "
        "Rows use **EXACT_OUTPUT**: API `amount` is BZZ (16 decimals); column *target USD* is the notional tier (BZZ out ≈ target ÷ **BZZ_PRICE_USD** from the log header, typically **\\$0.10/BZZ**)."
    )
    lines.append("")
    lines.append("## Summary grid (target USD tier → implied BZZ at $0.10/BZZ)")
    lines.append("")
    lines.append(
        "| Origin | Token | $0.10 | $1 | $10 | $100 |"
    )
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for chain in chains:
        for token in tokens:
            cells = [cell(chain, token, u) for u in usd_order]
            lines.append(f"| {chain} | {token} | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("## Full rows (sortable)")
    lines.append("")
    lines.append(
        "| Chain | Token | Target USD | HTTP | BZZ out | Out USD | Result | requestId |"
    )
    lines.append("| --- | --- | ---: | ---: | --- | --- | --- | --- |")
    for r in rows:
        if r["ok"]:
            res = "OK"
            bzz = r["bzz_out"]
            ousd = r["out_usd"]
        else:
            res = r["error"] or "fail"
            bzz = "—"
            ousd = "—"
        rid = f"`{r['request_id'][:18]}…`" if len(r["request_id"]) > 20 else (f"`{r['request_id']}`" if r["request_id"] else "—")
        lines.append(
            f"| {r['chain']} | {r['token']} | {r['target_usd']} | {r['http']} | {bzz} | {ousd} | {res} | {rid} |"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("log_file", type=Path, nargs="?", default=Path("last-matrix-run.txt"))
    ap.add_argument("--md", type=Path, default=Path("last-matrix-table.md"))
    ap.add_argument("--csv", type=Path, default=Path("last-matrix-table.csv"))
    args = ap.parse_args()
    if not args.log_file.exists():
        print(f"Missing {args.log_file}", file=sys.stderr)
        sys.exit(1)
    text = args.log_file.read_text(encoding="utf-8")
    rows = parse_log(text)
    write_csv(rows, args.csv)
    write_markdown(rows, args.md, source_log=str(args.log_file.name))
    print(f"Wrote {args.md} and {args.csv} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
