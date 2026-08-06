import { CONFIRMED_FACTS } from "./facts.mjs";

const PAGE_SCHEMA = {
  name: "emit_page",
  description: "Emit one page's content, matching Gold Water Fire's static site content contract.",
  input_schema: {
    type: "object",
    required: ["slug", "path", "title", "description", "h1", "breadcrumbLabel", "intro", "sections", "faqs", "cta", "evidence"],
    properties: {
      slug: { type: "string", description: "kebab-case, matches the backlog item's slug" },
      path: { type: "string", description: "URL path, e.g. /guides/some-slug.html" },
      title: { type: "string", description: "<title> tag, include 'Gold Water Fire' and 'Phoenix, AZ'" },
      description: { type: "string", description: "meta description, under 160 characters" },
      h1: { type: "string" },
      breadcrumbLabel: { type: "string" },
      intro: { type: "string", description: "Opening paragraph. Rule Zero: validates the reader's situation, does not sell. No solution pitched here." },
      sections: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["heading", "body"],
          properties: {
            eyebrow: { type: "string" },
            heading: { type: "string" },
            body: { type: "string", description: "Plain text or simple <a href> links only. No other HTML." },
            soft: { type: "boolean" },
            cards: {
              type: "array",
              items: {
                type: "object",
                required: ["heading", "body"],
                properties: { heading: { type: "string" }, body: { type: "string" } },
              },
            },
          },
        },
      },
      faqs: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["q", "a"],
          properties: { q: { type: "string" }, a: { type: "string" } },
        },
      },
      cta: {
        type: "object",
        required: ["heading", "body"],
        properties: { heading: { type: "string" }, body: { type: "string" } },
      },
      internalLinks: {
        type: "array",
        items: {
          type: "object",
          required: ["href", "label"],
          properties: { href: { type: "string" }, label: { type: "string" } },
        },
      },
      evidence: { type: "string", description: "One sentence: what backs any specific claim on this page, or confirms nothing beyond general practice is claimed." },
    },
  },
};

function systemPrompt() {
  return `You are drafting one page of website content for Gold Water Fire, a fire and water damage restoration and reconstruction contractor.

CONFIRMED FACTS — the only facts you may state as true about the company:
${CONFIRMED_FACTS}

HARD RULES (violating any of these means the page cannot ship — a code check re-verifies these after you respond, so do not rely on phrasing around them):
1. No number or specific claim that is not in the confirmed facts above. Not rounded, not "typically," not implied. This includes: no IICRC/certification claim, no "bonded and insured," no specific years-in-business or founding date, no job/project count, no specific response-time number (e.g. "1-hour response"), no hard "24/7" claim, no testimonials or star ratings, no competitor names.
2. Rule Zero: the "intro" field validates what the reader is going through. It does not sell, does not pitch a solution, does not mention Gold Water Fire by name in the first sentence.
3. General industry/educational information (how restoration processes work, what causes damage, what to look for) is fine to state as general knowledge — it does not need to trace to a confirmed fact, because it is not a claim about Gold Water Fire specifically. Keep this content genuinely useful and specific (real detail), not generic filler.
4. Body text may contain plain text and simple <a href="/path.html">link text</a> tags to link to Gold Water Fire's own service pages. No other HTML, no scripts, no styles.
5. Write for a homeowner in a stressful situation — clear, direct, no jargon, no hype adjectives ("amazing," "incredible"), no AI-sounding filler phrases.

Call the emit_page tool with the complete page. Do not respond with anything else.`;
}

export async function draftPage({ item, apiKey, model, retryFeedback }) {
  let userPrompt = item.type === "educational"
    ? `Write an educational/how-to page on this topic: "${item.topic}"\n\nThis is general-knowledge content aimed at ranking in search and helping someone right now, not a sales pitch for a specific job Gold Water Fire has done. Slug: ${item.slug}. Suggested path: /guides/${item.slug}.html.`
    : `Write a location page for ${item.city}, matching the service: ${item.service}. Slug: ${item.slug}. Suggested path: ${item.path}. Include real, locally-relevant detail (housing stock era, climate/seasonal risk pattern, anything genuinely specific to this city) rather than generic copy — the same paragraph must not work for a different city.`;

  if (retryFeedback?.length) {
    userPrompt += `\n\nYour previous attempt was rejected for: ${retryFeedback.join("; ")}. The emit_page tool's minItems on "faqs" (at least 2) and "sections" (at least 2) is a hint, not enforced by the API -- you must actually include that many. Fix these specific problems and resubmit the complete page.`;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      // 3000 was too tight: a full page (4 sections + cards + faqs + cta)
      // was hitting stop_reason=max_tokens before ever reaching "faqs",
      // verified via debug logging 2026-08-06 -- every rejected draft had
      // faqs=undefined for exactly this reason, not a compliance issue.
      max_tokens: 8000,
      // temperature is deprecated/rejected on claude-opus-5 (verified against
      // a live API error 2026-08-06) -- omit rather than pin a value.
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt }],
      tools: [PAGE_SCHEMA],
      tool_choice: { type: "tool", name: "emit_page" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((c) => c.type === "tool_use" && c.name === "emit_page");
  if (!toolUse) throw new Error("Model did not call emit_page: " + JSON.stringify(data));

  const usage = data.usage || {};
  if (process.env.RUNTIME_DEBUG) {
    console.log(`[debug] stop_reason=${data.stop_reason}, output_tokens=${usage.output_tokens}`);
  }
  return { page: toolUse.input, usage };
}
