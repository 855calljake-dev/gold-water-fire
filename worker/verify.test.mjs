#!/usr/bin/env node
// Seeded regression test for the §2.2 claim verifier module. Run it:
//
//   node worker/verify.test.mjs
//
// Same reasoning as imageTextGate.test.mjs: reading a gate tells you what its
// author meant; running it tells you what it does. This file stubs the
// Anthropic API (no key, no spend, deterministic) and asserts every verdict
// path verify.mjs can take — especially the failure modes, because a verifier
// whose errors look like passes is Hard Rule 5's exact failure class. The
// PROMPT's accuracy is proven separately, on real pages, in
// bytomorrow-bos SOP-AGENTIC-SEO-WEBSITES.md §2.2 (3/3 seeded lies caught,
// zero false positives on live pages); this file guards the plumbing.

import assert from "node:assert/strict";
import { verifyClaims, pageText } from "./verify.mjs";

const PAGE = {
  title: "T", description: "D", h1: "H", intro: "I",
  sections: [{ heading: "S1", body: "B1" }],
  faqs: [{ q: "Q1", a: "A1" }],
  cta: { heading: "C", body: "CB" },
};

function apiResponse(payload, { status = 200, raw = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (raw) throw new Error("bad json"); return payload; },
    text: async () => (raw ? "not json" : JSON.stringify(payload)),
  };
}

const realFetch = globalThis.fetch;
let queued;
globalThis.fetch = async () => {
  if (typeof queued === "function") return queued();
  return queued;
};

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (err) { failures += 1; console.log(`FAIL  ${name}: ${err.message}`); }
}

// pageText covers every field a lie could hide in
await check("pageText covers all rendered fields", () => {
  const t = pageText(PAGE);
  for (const s of ["T", "D", "H", "I", "S1", "B1", "Q1", "A1", "C", "CB"]) {
    assert.ok(t.includes(s), `missing ${s}`);
  }
});

// clean verdict
await check("pass verdict comes through", async () => {
  queued = apiResponse({ stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "tool_use", name: "emit_verdict", input: { verdict: "pass", ungrounded_claims: [] } }] });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "pass");
  assert.equal(v.claims.length, 0);
  assert.equal(v.usage.input_tokens, 10);
});

// fail verdict with claims
await check("fail verdict carries the quoted claims", async () => {
  queued = apiResponse({ stop_reason: "tool_use", usage: {},
    content: [{ type: "tool_use", name: "emit_verdict", input: { verdict: "fail",
      ungrounded_claims: [{ category: 3, quote: "five-year warranty", why: "no warranty confirmed" }] } }] });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "fail");
  assert.equal(v.claims[0].category, 3);
});

// a "pass" that lists claims gets the stricter reading
await check("pass-with-claims is read as fail", async () => {
  queued = apiResponse({ stop_reason: "tool_use", usage: {},
    content: [{ type: "tool_use", name: "emit_verdict", input: { verdict: "pass",
      ungrounded_claims: [{ category: 1, quote: "certified", why: "ungrounded" }] } }] });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "fail");
});

// refusal arrives as HTTP 200 — must NOT read as a pass
await check("refusal (HTTP 200) is an error, never a pass", async () => {
  queued = apiResponse({ stop_reason: "refusal", content: [], usage: {} });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "error");
  assert.match(v.reason, /refusal/);
});

// HTTP error
await check("HTTP 500 is an error with the status in the reason", async () => {
  queued = apiResponse({ err: "boom" }, { status: 500 });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "error");
  assert.match(v.reason, /500/);
});

// network failure
await check("fetch throw is an error, not an exception", async () => {
  queued = () => { throw new Error("ECONNRESET"); };
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "error");
  assert.match(v.reason, /ECONNRESET/);
});

// unparseable body
await check("unparseable JSON is an error", async () => {
  queued = apiResponse(null, { raw: true });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "error");
});

// no tool_use in response
await check("missing emit_verdict is an error", async () => {
  queued = apiResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "looks fine" }], usage: {} });
  const v = await verifyClaims({ page: PAGE, apiKey: "k" });
  assert.equal(v.verdict, "error");
  assert.match(v.reason, /did not emit/);
});

globalThis.fetch = realFetch;

if (failures) {
  console.log(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll verify.mjs plumbing tests passed.");
