import { CONFIRMED_FACTS } from "./facts.mjs";

/**
 * Required alongside the evidence gate, not optional — Jake's ruling 2026-08-08
 * (bytomorrow-bos SOP-AGENTIC-SEO-WEBSITES.md §2 item 5; 2nd Brain wiki
 * 01-Foundation/04-faith-loop-and-pride-cycle.md "Extended to every BT-BOS
 * commercial tenant"). Every BT-BOS tenant is commercial, so the Anvil
 * Commercial-face rule applies here too, same as bytomorrow-platform's own SEO
 * pipeline (commit d371899, src/lib/jobs/seo-page-draft.ts) — this is the same
 * map, ported. Canonical sequence: Shame -> Reflection -> Invitation ->
 * Sacrifice -> Faith -> Peace, per the wiki file, not content-by-jake.md's
 * differently-sequenced variant.
 *
 * The phase name itself must never appear in rendered output — these strings
 * are tone direction for the model, never copy to echo back.
 */
const FAITH_LOOP_TONE = {
  reflection:
    "Emotional register (do not name this, just write in it): Reflection. The reader is sitting " +
    "with a problem they haven't fully named yet. Validate it fully — the ache of not " +
    "understanding why this keeps happening — before offering any resolution. Do not rush toward " +
    "an answer or a next step; let the problem be seen clearly first.",
  invitation:
    "Emotional register (do not name this, just write in it): Invitation. The reader already " +
    "knows the problem; they need one small, low-stakes door to open, not a full commitment. " +
    "Offer the next step lightly — 'what if this isn't as hard as it feels' — never pressure or " +
    "imply they're behind for not having acted already.",
  "sacrifice-faith":
    "Emotional register (do not name this, just write in it): Sacrifice into Faith. The reader is " +
    "close to deciding to stop handling this alone. Earn that — show plainly why trusting someone " +
    "else with this specific thing is reasonable — rather than demanding the CTA outright. The ask " +
    "should feel like the natural next sentence, not a pivot.",
};

const PAGE_SCHEMA = {
  name: "emit_page",
  description: "Emit one page's content, matching Gold Water Fire's static site content contract.",
  input_schema: {
    type: "object",
    required: ["slug", "path", "title", "description", "h1", "breadcrumbLabel", "intro", "sections", "faqs", "cta", "evidence"],
    properties: {
      slug: { type: "string", description: "kebab-case, matches the backlog item's slug" },
      path: { type: "string", description: "URL path, e.g. /guides/some-slug.html" },
      // Plain-text fields. The template escapes these at render time, so an
      // HTML entity here double-escapes and ships visibly broken -- "&amp;"
      // renders as "&amp;" on the page, not "&". This happened for real:
      // phoenix-reconstruction's drafted h1/title came back as "Reconstruction
      // &amp; Rebuild" and shipped that way to the live <h1> and <title>
      // (fixed 2026-08-10). Only `body` and `a` accept markup, and they say so.
      title: { type: "string", description: "<title> tag, include 'Gold Water Fire' and 'Phoenix, AZ'. Plain text -- write '&' as a literal ampersand, never '&amp;' or any other HTML entity or tag." },
      description: { type: "string", description: "meta description, under 160 characters. Plain text, no HTML entities or tags." },
      h1: { type: "string", description: "Plain text, no HTML entities or tags -- write '&' as a literal ampersand. Also rendered verbatim as the page image's caption (SOP-AGENTIC-SEO-WEBSITES.md 8.3)." },
      breadcrumbLabel: { type: "string", description: "Plain text, no HTML entities or tags." },
      intro: { type: "string", description: "Opening paragraph. Rule Zero: validates the reader's situation, does not sell. No solution pitched here." },
      sections: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["heading", "body"],
          properties: {
            eyebrow: { type: "string", description: "Plain text, no HTML entities or tags." },
            heading: { type: "string", description: "Plain text, no HTML entities or tags." },
            body: { type: "string", description: "Plain text or simple <a href> links only. No other HTML." },
            soft: { type: "boolean" },
            cards: {
              type: "array",
              items: {
                type: "object",
                required: ["heading", "body"],
                properties: {
                  heading: { type: "string", description: "Plain text, no HTML entities or tags." },
                  body: { type: "string" },
                },
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
          properties: { q: { type: "string", description: "Plain text, no HTML entities or tags." }, a: { type: "string" } },
        },
      },
      cta: {
        type: "object",
        required: ["heading", "body"],
        // Both escaped by the template, unlike section/card body.
        properties: {
          heading: { type: "string", description: "Plain text, no HTML entities or tags." },
          body: { type: "string", description: "Plain text, no HTML entities or tags." },
        },
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

function systemPrompt(faithLoopPhase) {
  return `You are drafting one page of website content for Gold Water Fire, a fire and water damage restoration and reconstruction contractor.

CONFIRMED FACTS — the only facts you may state as true about the company:
${CONFIRMED_FACTS}

${FAITH_LOOP_TONE[faithLoopPhase] ?? FAITH_LOOP_TONE.reflection}

HARD RULES (violating any of these means the page cannot ship — a code check re-verifies these after you respond, so do not rely on phrasing around them):
1. No number or specific claim that is not in the confirmed facts above. Not rounded, not "typically," not implied. This includes: no IICRC/certification claim, no "bonded and insured," no specific years-in-business or founding date, no job/project count, no specific response-time number (e.g. "1-hour response"), no hard "24/7" claim, no testimonials or star ratings, no competitor names.
2. Rule Zero: the "intro" field validates what the reader is going through. It does not sell, does not pitch a solution, does not mention Gold Water Fire by name in the first sentence.
3. General industry/educational information (how restoration processes work, what causes damage, what to look for) is fine to state as general knowledge — it does not need to trace to a confirmed fact, because it is not a claim about Gold Water Fire specifically. Keep this content genuinely useful and specific (real detail), not generic filler.
4. Body text may contain plain text and simple <a href="...">link text</a> tags. The ONLY valid internal link targets are these exact paths — do not invent a "/services/" prefix or any other URL, these are the real ones: /water-damage-restoration.html, /fire-damage-restoration.html, /reconstruction.html, /about.html, /contact.html. Link to these verbatim.
5. Write for a homeowner in a stressful situation — clear, direct, no jargon, no hype adjectives ("amazing," "incredible"), no AI-sounding filler phrases.
6. Never write the words "Faith Loop," "Reflection," "Invitation," "Sacrifice," or any label for the emotional register above. It is a direction for how you write, never content to name — the page must read as plain, unstructured human writing.

Call the emit_page tool with the complete page. Do not respond with anything else.`;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeString(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name) => {
    const key = name.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return whole;
  });
}

function decodeField(obj, key) {
  if (obj && typeof obj[key] === "string") obj[key] = decodeString(obj[key]);
}

/**
 * The model sometimes writes HTML entities into plain-text fields. It emitted
 * "Mesa Reconstruction &amp; Rebuild" as a title; the template then escaped
 * that string correctly, as it must, and the ampersand reached the live
 * <title> and <h1> as "&amp;amp;". It shipped on 2026-08-12 before anyone
 * noticed, and an older guide page had the same defect.
 *
 * Fixed here, where model output enters the pipeline, rather than by making
 * the template escape less. The template is right; one that tries to guess
 * whether a string is already encoded will eventually guess wrong in the
 * other direction, which is a worse bug because it lets markup through.
 *
 * ONLY the fields the template escapes are decoded. `intro`,
 * `sections[].body`, `sections[].cards[].body` and `faqs[].a` are
 * interpolated RAW so they can carry the plain <a> links the schema allows --
 * there "&amp;" is already correct, and decoding it would emit a bare
 * ampersand into raw markup. A first attempt walked every string blindly and
 * corrupted a body field that was perfectly fine; reading the diff caught it.
 * If the template's escaping ever changes, this list has to change with it.
 */
export function decodeEscapedFields(page) {
  for (const k of ["title", "h1", "description", "breadcrumbLabel", "evidence"]) decodeField(page, k);
  for (const s of page.sections || []) {
    for (const k of ["eyebrow", "heading"]) decodeField(s, k);
    for (const c of s.cards || []) decodeField(c, "heading");
  }
  for (const f of page.faqs || []) decodeField(f, "q");
  for (const k of ["heading", "body"]) decodeField(page.cta, k);
  for (const l of page.internalLinks || []) decodeField(l, "label");
  return page;
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
      system: systemPrompt(item.faithLoopPhase),
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
  return { page: decodeEscapedFields(toolUse.input), usage };
}
