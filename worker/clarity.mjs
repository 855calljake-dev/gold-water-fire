// The Seven Clarity Moves, wired into the drafting worker. Jake adopted them on
// 2026-09-29 for all Commercial-face content, SEO and content creation, and
// asked for them in this worker on 2026-10-03. Canonical spec: 2nd Brain
// wiki 06-Storyteller-Tactics/05-luntz-seven-moves.md. If this file and that
// page disagree, the wiki page wins and this file is what needs correcting.
//
// What the moves become on a GWF page (the wiki's "SEO and AI search" table,
// required for articles and landing pages):
//
//   move 6  bottomLine     two or three sentences, answer first, under the intro
//   move 1  plainEnglishHeading / plainEnglishBody   "What is X?" + a 40 to 60 word answer
//   move 4  whyItMattersHeading / whyItMattersBody   "Why X matters for [audience]" + a paragraph
//
// Flat strings rather than {heading, body} objects: see the note in draft.mjs.
//   move 7  takeaway       the Takeaway Line, under 25 words, in a Key takeaway box
//   move 5  FAQ questions written the way the homeowner would ask them
//   move 3  optional picture, the good outcome only
//   move 2  the Landing Test, worker/landing.mjs (a judgment gate, so shadow first)
//
// Two moves are BARRED here as reader-facing prompts. The GWF reader is a
// homeowner in the first hours after a loss, dominant emotion Overwhelm (GHL
// brand voice record, assets/brand/ghl-brand-kit.md), which is the Depletion
// cluster, and the wiki bars move 5 ("So what would you do?") for that cluster
// because it hands them one more decision. Move 2 as a prompt carries the same
// limit. Both are checked below, not just asked for.
//
// Checked in code because this tenant publishes with no human between a draft
// and the live site (graduated 2026-08-12). Word-count bounds are a little
// wider than the prompt asks for, on purpose: a structural refusal can count
// toward self-de-graduation (run.mjs), and a page that misses "40 to 60 words"
// by three words is not a broken drafter.

// The seven phrases, normalized: lower case, straight apostrophes.
export const CANONICAL_PHRASES = [
  "let me put that in plain english",
  "tell me what you took from that",
  "imagine this",
  "here's why this matters to you",
  "so what would you do",
  "the bottom line is",
  "here's what i want you to remember",
];

// Move 5 and move 2 as reader-facing prompts, including the wiki's rotation
// wordings. Narrow on purpose: "your move" only as a sentence of its own, so
// "your move-out date" passes.
const DEPLETION_BARRED = [
  { label: "move 5 (\"what would you do?\")", re: /\bwhat would you do\b/i },
  { label: "move 5 (\"where do you land?\")", re: /\bwhere do you land\b/i },
  { label: "move 5 (\"your move\")", re: /\byour move[.!?]/i },
  { label: "move 2 (\"tell me what you took from that\")", re: /\btell me what you took from (that|this)\b/i },
  { label: "move 2 (\"what's your read?\")", re: /\bwhat'?s your read\b/i },
  { label: "move 2 (\"what would you take from this?\")", re: /\bwhat would you take from (this|that)\b/i },
];

// Moves 2, 6 and 7 are not Luntz's (wiki "Provenance"), and none of this is
// credited to him in public copy.
const LUNTZ = /\bluntz\b/i;

const LIMITS = {
  bottomLineSentences: [1, 4], // prompt asks for 2 or 3
  bottomLineWords: 90,
  plainEnglishWords: [35, 75], // prompt asks for 40 to 60
  whyItMattersWords: [25, 180],
  takeawayWords: 25, // wiki: "under 25 words"; prompt asks for under 25
};

const words = (s) => (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []).length;
// Sentence count that does not split on "a.m." or "St." style abbreviations
// often enough to matter: a terminator followed by space and a capital, or the end.
const sentences = (s) => (String(s).trim().match(/[.!?](?=\s+[A-Z0-9"“]|\s*$)/g) || []).length;
const norm = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'");

function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every reader-facing string, including the clarity fields. */
export function readerStrings(page) {
  const out = [page.title, page.description, page.h1, page.intro, page.bottomLine,
    page.plainEnglishHeading, page.plainEnglishBody, page.whyItMattersHeading, page.whyItMattersBody, page.takeaway];
  for (const s of Array.isArray(page.sections) ? page.sections : []) {
    if (!isObj(s)) continue;
    out.push(s.eyebrow, s.heading, s.body);
    for (const c of Array.isArray(s.cards) ? s.cards : []) if (isObj(c)) out.push(c.heading, c.body);
  }
  for (const f of Array.isArray(page.faqs) ? page.faqs : []) if (isObj(f)) out.push(f.q, f.a);
  if (isObj(page.cta)) out.push(page.cta.heading, page.cta.body);
  return out.filter((v) => typeof v === "string" && v);
}

function plainText(problems, field, value) {
  if (/<[a-z/!]/i.test(value)) problems.push(`\`${field}\` must be plain text, no HTML: the template escapes it, so a tag would show on the page as literal characters.`);
}

/**
 * The clarity moves contract. Separate from checkPage on purpose: checkPage's
 * regression suite holds real pages from before 2026-10-03 as known-clean, and
 * those pages rightly carry none of these fields. run.mjs runs both on every
 * new draft and treats a problem from either as a structural refusal.
 */
export function checkClarityMoves(page) {
  const problems = [];
  if (!isObj(page)) return { ok: false, problems: ["page is not an object"] };

  // move 6: bottom line up top
  const bl = page.bottomLine;
  if (typeof bl !== "string" || !bl.trim()) {
    problems.push("Missing `bottomLine` (clarity move 6): two or three sentences that give the answer first, before any section.");
  } else {
    const n = sentences(bl);
    if (n < LIMITS.bottomLineSentences[0] || n > LIMITS.bottomLineSentences[1]) problems.push(`\`bottomLine\` has ${n} sentences; write two or three.`);
    if (words(bl) > LIMITS.bottomLineWords) problems.push(`\`bottomLine\` is ${words(bl)} words; keep it to two or three short sentences.`);
    plainText(problems, "bottomLine", bl);
  }

  // move 1: plain-English definition
  const peH = page.plainEnglishHeading, peB = page.plainEnglishBody;
  if (typeof peH !== "string" || !peH.trim() || typeof peB !== "string" || !peB.trim()) {
    problems.push("Missing `plainEnglishHeading` / `plainEnglishBody` (clarity move 1): a \"What is [term]?\" heading with a 40 to 60 word plain answer under it.");
  } else {
    if (!/^what\s+(is|are|does|do)\b/i.test(peH.trim()) || !peH.trim().endsWith("?")) {
      problems.push(`\`plainEnglishHeading\` must be a question that starts "What is" (or "What are", "What does"): got "${peH}".`);
    }
    const n = words(peB);
    if (n < LIMITS.plainEnglishWords[0] || n > LIMITS.plainEnglishWords[1]) problems.push(`\`plainEnglishBody\` is ${n} words; write 40 to 60.`);
    plainText(problems, "plainEnglishHeading", peH);
    plainText(problems, "plainEnglishBody", peB);
  }

  // move 4: why it matters
  const wmH = page.whyItMattersHeading, wmB = page.whyItMattersBody;
  if (typeof wmH !== "string" || !wmH.trim() || typeof wmB !== "string" || !wmB.trim()) {
    problems.push("Missing `whyItMattersHeading` / `whyItMattersBody` (clarity move 4): a \"Why [topic] matters for [the reader]\" heading tying the page to the reader's own problem.");
  } else {
    if (!/\bwhy\b/i.test(wmH) || !/\bmatters?\b/i.test(wmH)) {
      problems.push(`\`whyItMattersHeading\` must read "Why [topic] matters for [audience]": got "${wmH}".`);
    }
    const n = words(wmB);
    if (n < LIMITS.whyItMattersWords[0] || n > LIMITS.whyItMattersWords[1]) problems.push(`\`whyItMattersBody\` is ${n} words; write one short paragraph (about 40 to 120).`);
    plainText(problems, "whyItMattersHeading", wmH);
    plainText(problems, "whyItMattersBody", wmB);
  }

  // move 7: one takeaway
  const tk = page.takeaway;
  if (typeof tk !== "string" || !tk.trim()) {
    problems.push("Missing `takeaway` (clarity move 7): the one sentence, under 25 words, the reader should remember.");
  } else {
    if (words(tk) > LIMITS.takeawayWords) problems.push(`\`takeaway\` is ${words(tk)} words; it must be under 25.`);
    if (sentences(tk) > 1) problems.push("`takeaway` must be one sentence.");
    // "One idea" is asked for in the prompt and measured by the Landing Test,
    // NOT checked here. A semicolon check was tried on 2026-10-03 and refused a
    // single-idea takeaway that used a semicolon grammatically, one the Landing
    // Test passed. A false positive here counts toward de-graduation, which is
    // how a bare-word pattern demoted this tenant on 2026-08-23.
    plainText(problems, "takeaway", tk);
  }

  // Wording rules, across everything a reader sees.
  const strings = readerStrings(page);
  const all = norm(strings.join("\n"));
  for (const phrase of CANONICAL_PHRASES) {
    const count = all.split(phrase).length - 1;
    if (count > 1) problems.push(`The phrase "${phrase}" appears ${count} times; each clarity phrase may appear at most once on a page.`);
  }
  for (const b of DEPLETION_BARRED) {
    if (b.re.test(all)) problems.push(`Barred for this reader: ${b.label}. The reader is overwhelmed; do not hand them a question to decide. Close with the next step instead.`);
  }
  if (LUNTZ.test(all)) problems.push("Do not name or credit Luntz in public copy.");

  return { ok: problems.length === 0, problems };
}

// The drafting instructions for the moves, appended to draft.mjs's system
// prompt. Mirrors the wiki page's table, scoped to this reader.
export const CLARITY_PROMPT = `CLARITY MOVES (required on every page; a code check verifies the structural parts):
- bottomLine (move 6): two or three short sentences giving the answer first. It renders directly under the intro, so the intro still validates the reader (Rule Zero) and the bottom line is where the answer starts.
- plainEnglishHeading / plainEnglishBody (move 1): pick the one term this reader is least likely to know. The heading is the question "What is [term]?" (or "What are"/"What does"); the body answers it in 40 to 60 words of plain English, no jargon inside the definition.
- whyItMattersHeading / whyItMattersBody (move 4): the heading reads "Why [topic] matters for [this reader]" (for example "Why a slow leak matters for a Mesa homeowner"); the body ties the topic to the reader's own house, money or health in one short paragraph.
- takeaway (move 7): the single sentence, under 25 words, you want the reader to remember. ONE idea, not a summary or a list of points: not "X, Y and Z", and avoid semicolons. Decide it first, then build the page to deliver it: the bottomLine leads to it and every section supports it. It renders in a "Key takeaway" box near the close.
- FAQs (move 5): write each question the way a homeowner would actually ask it out loud.
- Move 3 is optional: one picture of how it goes when it is handled well ("Picture the crew rolling in the dehumidifiers..."). Never picture the disaster getting worse.
- Optional spoken phrasing, used naturally: "Let me put that in plain English", "Here's why this matters to you", "The bottom line is", "Here's what I want you to remember", "Imagine this", or a variation ("In plain English:", "Short version:", "If you remember one thing:", "Picture this:"). Each exact phrase at most once on the page, and the payoff comes in the same or the very next sentence. A phrase that announces and then stalls is a failure.
- BARRED for this reader, who is overwhelmed: never end a section or the page by asking them to decide ("So what would you do?", "Where do you land?", "Your move", "What's your read?"). Close with the next step instead.
- Never mention Frank Luntz or any source for these moves.
- These clarity fields are plain text strings: no HTML, no links, no nested structure.`;
