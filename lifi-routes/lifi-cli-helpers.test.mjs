#!/usr/bin/env node
/**
 * URL builder tests (no network). Run: node --test lifi-routes/lifi-cli-helpers.test.mjs
 */
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const helper = join(dir, "lifi-cli-helpers.mjs");

const quoteArgs = [
  "quote-toamount-url",
  "https://li.quest",
  "1",
  "100",
  "0x0000000000000000000000000000000000000000",
  "0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da",
  "0x03508bb71268bba25ecacc8f620e01866650532c",
  "10000000000000000",
  "0.03",
  "CHEAPEST",
];

function runQuote(env) {
  return spawnSync(process.execPath, [helper, ...quoteArgs], {
    env: { ...process.env, ...env, LIFI_INTEGRATOR: "" },
    encoding: "utf8",
  });
}

test("quote URL omits denyBridges when LIFI_DENY_BRIDGES is unset", () => {
  const env = { ...process.env };
  delete env.LIFI_DENY_BRIDGES;
  const r = spawnSync(process.execPath, [helper, ...quoteArgs], {
    env: { ...env, LIFI_INTEGRATOR: "" },
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout.trim(), /denyBridges=/);
});

test("empty LIFI_DENY_BRIDGES omits denyBridges", () => {
  const r = runQuote({ LIFI_DENY_BRIDGES: "" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout.trim(), /denyBridges=/);
});

test("LIFI_DENY_BRIDGES=relay adds denyBridges=relay", () => {
  const r = runQuote({ LIFI_DENY_BRIDGES: "relay" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /[?&]denyBridges=relay(?:&|$)/);
});

test("LIFI_DENY_BRIDGES can list multiple bridges", () => {
  const r = runQuote({ LIFI_DENY_BRIDGES: "relay,hop" });
  assert.strictEqual(r.status, 0, r.stderr);
  const u = r.stdout.trim();
  assert.ok(u.includes("denyBridges=relay") && u.includes("denyBridges=hop"));
});
