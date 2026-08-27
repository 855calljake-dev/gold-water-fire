// The claim verifier — SOP-AGENTIC-SEO-WEBSITES.md §2.2 (bytomorrow-bos), the
// fresh-context spec-vs-draft check. Catches the one class the structural gate
// cannot: a fluent, plausible, pattern-free false statement about the business.
// Proven before it was written: three seeded lies ("certified by the
// Restoration Industry Association", "served Valley homeowners for more than a
// decade", "five-year workmanship warranty") passed every forbidden pattern in
// facts.mjs untouched, and this prompt caught 3 of 3 with zero false positives
// on two live pages. Calibration history and measured results: SOP §2.2;
// canonical prompt: bytomorrow-bos HANDOFF-CLAIM-VERIFIER.md.
//
// Fresh context is the mechanism, not a nicety: this call never sees the
// drafting prompt, the Faith Loop phase, or the model's reasoning. It gets the
// confirmed-facts spec and the page text, nothing else. The maker's confidence
// is not evidence.
//
// The verifier runs on VERIFIER_MODEL, not cfg.model, per SOP-COST-TIERING §3:
// verification runs at or above the drafting tier. Drafting is on Sonnet 5
// during the trial; the verifier stays on Opus 5. run.mjs prices its usage at
// the verifier model's own rates for the same reason.
//
// No SDK, plain fetch, same as draft.mjs and image.mjs.

import { CONFIRMED_FACTS } from "./facts.mjs";

export const VERIFIER_MODEL = "claude-opus-5";

// Confirmed claims that live in CLAIMS-TO-VERIFY.md but not in facts.mjs
// CONFIRMED_FACTS. Kept here rather than added to CONFIRMED_FACTS because that
// block feeds the DRAFTING prompt, and changing drafting input mid-Sonnet-trial
// would contaminate the trial's comparability. Fold into facts.mjs after the
// trial verdict if desired; update both lists together until then.
const ADDITIONAL_CONFIRMED = `
- 24/7 emergency availability: CONFIRMED 2026-08-07 (CLAIMS-TO-VERIFY.md) — safe to display
- Free inspection offer: CONFIRMED 2026-08-07 (CLAIMS-TO-VERIFY.md) — no detail beyond "free inspection" itself
`.trim();

// The calibrated prompt, ported verbatim from HANDOFF-CLAIM-VERIFIER.md except
// its final output-format paragraph, which the emit_verdict tool schema below
// replaces (same fields, structurally enforced instead of asked for). The
// eight categories ARE the calibration: the first draft flagged 9 claims on a
// live reviewed page, 8 of them ordinary service prose — the exact
// false-positive class that de-graduated this tenant on 2026-08-23. Loosening
// or tightening the categories is a doctrine change in bytomorrow-bos first,
// code second. Em dashes below are part of the calibrated literal (Hard Rule
// 7's data exception, noted in the handoff).
const VERIFIER_PROMPT = `You are an independent claim verifier for a contractor's website page. You did not write this page, you have no knowledge of how it was written, and the writer's confidence is not evidence.

Below are the ONLY confirmed facts about this business, followed by the full text of one drafted page.

Fail the page ONLY for claims in these categories, when they are not grounded in the confirmed facts:
1. Credentials: certifications, licenses beyond those listed, insurance or bonding, industry-association memberships or affiliations, compliance with named standards.
2. History and track record: years in business, company age, job or customer counts, experience framed as the company's own record.
3. Guarantees and warranties of any kind.
4. Specific numbers promised to the customer: response times, completion times, prices, discounts beyond confirmed offers.
5. Testimonials, reviews, ratings, or quoted customers.
6. Services beyond the confirmed service list, offered as this company's own service.
7. Service-area assertions naming places outside the confirmed area. The confirmed boundary includes "outlying areas further than that", so treat "nearby" or "adjacent" phrasing around confirmed cities as grounded; flag only a named place clearly outside the boundary.
8. Named partnerships, awards, or endorsements.

Explicitly IN BOUNDS for the page (never a failure): descriptions of how the company performs its confirmed services — process steps, equipment, documentation practices, what happens when you call, who does the work — and all educational content about the trade. A company that offers a service may describe doing that service.

Rules:
1. Within the eight categories, a claim you cannot ground in the confirmed facts is ungrounded. Uncertainty fails.
2. Paraphrase and implication count within those categories.
3. Judge only what is in front of you; do not assume unstated facts are probably true of a real business.

Report your verdict with the emit_verdict tool. "verdict" is "fail" if ungrounded_claims is non-empty, else "pass".`;

const VERDICT_SCHEMA = {
  name: "emit_verdict",
  description: "Report the claim-verification verdict for this page.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["pass", "fail"] },
      ungrounded_claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "integer", minimum: 1, maximum: 8 },
            quote: { type: "string", description: "shortest page excerpt asserting the claim" },
            why: { type: "string", description: "one sentence" },
          },
          required: ["category", "quote", "why"],
        },
      },
    },
    required: ["verdict", "ungrounded_claims"],
  },
};

// The same fields evidenceGate sees. A field the verifier never reads is a
// field a lie can hide in — keep this in step with checkPage's coverage.
export function pageText(page) {
  const parts = [page.title, page.description, page.h1, page.intro];
  for (const s of page.sections || []) parts.push(s.heading, s.body);
  for (const f of page.faqs || []) parts.push(f.q, f.a);
  const c = page.cta;
  if (c && typeof c === "object") parts.push(c.heading, c.body);
  else if (c) parts.push(String(c));
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Verify one drafted page against the confirmed-facts spec.
 * Returns { verdict: "pass" | "fail" | "error", claims, usage, reason }.
 * Never throws: an "error" verdict is the caller's fail-closed signal in
 * enforce mode and a logged non-event in shadow mode. Per Hard Rule 5 the
 * reason always says what actually happened.
 */
export async function verifyClaims({ page, apiKey, model = VERIFIER_MODEL }) {
  const body = {
    model,
    // Opus 5 thinks by default and max_tokens caps thinking plus output
    // together; the verdict itself is small but the reasoning needs room.
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `${VERIFIER_PROMPT}\n\n=== CONFIRMED FACTS ===\n${CONFIRMED_FACTS}\n${ADDITIONAL_CONFIRMED}\n\n=== PAGE TEXT ===\n${pageText(page)}`,
    }],
    tools: [VERDICT_SCHEMA],
    tool_choice: { type: "tool", name: "emit_verdict" },
  };

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return { verdict: "error", claims: [], usage: {}, reason: `verifier fetch failed: ${err.message}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { verdict: "error", claims: [], usage: {}, reason: `verifier API error ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json().catch(() => null);
  if (!data) return { verdict: "error", claims: [], usage: {}, reason: "verifier returned unparseable JSON" };

  // Refusals arrive as HTTP 200 with stop_reason "refusal" — checking the
  // status code alone would swallow them (Hard Rule 5's exact failure class).
  if (data.stop_reason === "refusal") {
    return { verdict: "error", claims: [], usage: data.usage || {}, reason: "verifier request refused (stop_reason=refusal)" };
  }

  const toolUse = data.content?.find((c) => c.type === "tool_use" && c.name === "emit_verdict");
  if (!toolUse || !toolUse.input?.verdict) {
    return { verdict: "error", claims: [], usage: data.usage || {}, reason: `verifier did not emit a verdict (stop_reason=${data.stop_reason})` };
  }

  const claims = Array.isArray(toolUse.input.ungrounded_claims) ? toolUse.input.ungrounded_claims : [];
  // Belt and braces: the schema says verdict tracks claims, but a model that
  // says "pass" while listing claims gets the stricter reading.
  const verdict = claims.length > 0 ? "fail" : toolUse.input.verdict;
  return { verdict, claims, usage: data.usage || {}, reason: null };
}
