// The Landing Test, clarity move 2 ("Tell me what you took from that"), from
// the 2nd Brain wiki 06-Storyteller-Tactics/05-luntz-seven-moves.md: before
// release, a cold reader who never saw the brief says in one sentence what
// they took from the draft, and that is compared to the Takeaway Line. Match
// passes; anything else is a rewrite.
//
// Two calls, deliberately:
//   1. The cold read. It sees the page WITHOUT its takeaway box, because a
//      reader handed the answer is not a cold reader. It never sees the
//      drafting prompt or the intended takeaway.
//   2. The comparison. It sees only the two sentences. Folding both into one
//      call would show the reader the target before it reads, which is the
//      thing the test exists to prevent.
//
// This is a JUDGMENT gate, so it follows the claim verifier's rollout
// (SOP-AGENTIC-SEO-WEBSITES.md §2.2, bytomorrow-bos): RUNTIME_LANDING_MODE
// defaults to "shadow", which logs every verdict into the run output and the
// batch PR body and blocks nothing. It does not hard-block until two shadow
// batches have been spot-checked by a person, and it never feeds
// self-de-graduation (run.mjs). Same never-throws contract as verify.mjs.

import { VERIFIER_MODEL } from "./verify.mjs";
import { readerStrings } from "./clarity.mjs";

export const LANDING_MODEL = VERIFIER_MODEL;

const READ_TOOL = {
  name: "emit_reading",
  description: "Report what you took from the page.",
  input_schema: {
    type: "object",
    properties: { took: { type: "string", description: "One sentence: the main thing you took from this page." } },
    required: ["took"],
  },
};

const MATCH_TOOL = {
  name: "emit_match",
  description: "Report whether the two sentences carry the same main point.",
  input_schema: {
    type: "object",
    properties: {
      match: { type: "boolean" },
      why: { type: "string", description: "One sentence." },
    },
    required: ["match", "why"],
  },
};

/** The page as a reader sees it, minus the takeaway box. */
export function coldReadText(page) {
  const { takeaway, ...rest } = page;
  return readerStrings(rest).join("\n\n");
}

async function call({ apiKey, model, prompt, tool, maxTokens }) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return { error: `fetch failed: ${err.message}`, usage: {} };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `API error ${res.status}: ${text.slice(0, 200)}`, usage: {} };
  }
  const data = await res.json().catch(() => null);
  if (!data) return { error: "unparseable JSON", usage: {} };
  if (data.stop_reason === "refusal") return { error: "request refused (stop_reason=refusal)", usage: data.usage || {} };
  const use = data.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
  if (!use?.input) return { error: `no ${tool.name} (stop_reason=${data.stop_reason})`, usage: data.usage || {} };
  return { input: use.input, usage: data.usage || {} };
}

const addUsage = (a, b) => ({
  input_tokens: (a.input_tokens || 0) + (b.input_tokens || 0),
  output_tokens: (a.output_tokens || 0) + (b.output_tokens || 0),
});

/**
 * Returns { verdict: "pass" | "fail" | "error", took, why, usage, reason }.
 * Never throws.
 */
export async function landingTest({ page, apiKey, model = LANDING_MODEL }) {
  if (typeof page?.takeaway !== "string" || !page.takeaway.trim()) {
    return { verdict: "error", took: null, why: null, usage: {}, reason: "page has no takeaway to test against" };
  }

  const read = await call({
    apiKey, model, tool: READ_TOOL, maxTokens: 4000,
    prompt: `You are a homeowner in the Phoenix area who just found this page while dealing with damage to your house. Read it once, the way you actually would.\n\nThen tell me what you took from it, in one sentence. Not a summary of every point: the one thing you would walk away with.\n\n=== PAGE ===\n${coldReadText(page)}`,
  });
  if (read.error) return { verdict: "error", took: null, why: null, usage: read.usage, reason: `cold read: ${read.error}` };
  // Model output that ends up in the batch PR body, which Hard Rule 7 covers
  // (no em dashes in anything a reader sees). Normalized here, at the edge.
  const clean = (s) => String(s || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();
  const took = clean(read.input.took);
  if (!took) return { verdict: "error", took: null, why: null, usage: read.usage, reason: "cold read returned an empty sentence" };

  const cmp = await call({
    apiKey, model, tool: MATCH_TOOL, maxTokens: 3000,
    prompt: `Two sentences follow. The first is what a writer wanted a reader to remember. The second is what a reader actually took away.\n\nDo they carry the same main point? The same point in different words is a match. A narrower point, a side point, or a different point is not.\n\nIntended: ${page.takeaway}\nReader took: ${took}`,
  });
  const usage = addUsage(read.usage, cmp.usage);
  if (cmp.error) return { verdict: "error", took, why: null, usage, reason: `comparison: ${cmp.error}` };

  return { verdict: cmp.input.match === true ? "pass" : "fail", took, why: clean(cmp.input.why), usage, reason: null };
}
