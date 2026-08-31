import { findForbiddenClaims } from "./facts.mjs";

const UNSAFE_HTML = /<script|<style|on\w+\s*=|javascript:/i;
const ALLOWED_INLINE_TAG = /<(?!\/?a(\s|>))[a-z][^>]*>/i; // any tag that isn't <a ...> or </a>
const HREF_RE = /href="([^"]*)"/gi;
const HREF_ATTR_RE = /href="[^"]*"/gi;
const EM_DASH = /—/;

// The site's real internal paths — kept in sync with templates/shell.mjs's
// NAV plus known non-nav pages. A drafted page linking anywhere else 404s.
// Caught here 2026-08-06: the model invented a "/services/" prefix that
// doesn't exist on the actual site, in every page of the first live batch.
const VALID_INTERNAL_LINKS = new Set([
  "/", "/water-damage-restoration.html", "/fire-damage-restoration.html",
  "/reconstruction.html", "/about.html", "/contact.html",
]);

function extractHrefs(fields) {
  const hrefs = [];
  for (const field of fields) {
    for (const m of field.matchAll(HREF_RE)) hrefs.push(m[1]);
  }
  return hrefs;
}

function flattenText(page) {
  const parts = [page.title, page.description, page.h1, page.intro, page.evidence];
  for (const s of page.sections || []) {
    parts.push(s.heading, s.body);
    for (const c of s.cards || []) parts.push(c.heading, c.body);
  }
  for (const f of page.faqs || []) parts.push(f.q, f.a);
  if (page.cta) parts.push(page.cta.heading, page.cta.body);
  return parts.filter(Boolean).join("\n");
}

/**
 * Every field that reaches a reader on the rendered page, one entry per field
 * so a failure can point at which one. Deliberately NOT the same list as
 * flattenText: `evidence` is an internal note the template never renders
 * (templates/content-page.mjs), and `eyebrow` / `breadcrumbLabel` /
 * internalLinks labels ARE rendered but aren't part of the claim scan.
 *
 * href values are stripped first. A URL is data, not writing: an em dash
 * inside one is a link that resolves, and "rewriting" it breaks the link.
 * bytomorrow-bos CLAUDE.md Hard Rule 7, "this is a content rule, not a data
 * rule."
 */
function proseFields(page) {
  const fields = [page.title, page.description, page.h1, page.breadcrumbLabel, page.intro];
  for (const s of page.sections || []) {
    fields.push(s.eyebrow, s.heading, s.body);
    for (const c of s.cards || []) fields.push(c.heading, c.body);
  }
  for (const f of page.faqs || []) fields.push(f.q, f.a);
  if (page.cta) fields.push(page.cta.heading, page.cta.body);
  for (const l of page.internalLinks || []) fields.push(l.label);
  return fields.filter((f) => typeof f === "string" && f).map((f) => f.replace(HREF_ATTR_RE, ""));
}

function bodyFields(page) {
  const fields = [page.intro];
  for (const s of page.sections || []) {
    fields.push(s.body);
    for (const c of s.cards || []) fields.push(c.body);
  }
  for (const f of page.faqs || []) fields.push(f.a);
  return fields.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Shape validation. Added 2026-08-31 after batch PR #25, where two of eight
// pages carried `sections` as a raw 3-4KB STRING holding a truncated tool-call
// response the model emitted instead of clean JSON, and `cta` as a string too.
// Both passed this gate cleanly.
//
// They passed because every reader above is defensive in the wrong direction:
// `for (const s of page.sections || [])` over a string iterates its CHARACTERS,
// so `s.heading` is undefined, everything filters out, and the gate scans an
// empty document and calls it clean. The Netlify build caught it instead, at
// templates/content-page.mjs line 40's `sections.map()`. That was luck: on a
// tenant whose template tolerates the bad shape, these ship. It is also a
// repeat, jaketaylor-home-loans commit 9f7fd1a fixed the same root cause on
// that tenant and added no gate either time.
//
// So: validate the shape of every field the template consumes, before anything
// downstream touches it, and say which field and which type in the message.
// ---------------------------------------------------------------------------

// Every top-level key the pipeline writes or the template reads. A key outside
// this set is content that will never render, which is what a split object
// looks like: PR #25's two bad pages both carried a stray top-level `body`,
// the second half of a `cta` the model tore in half.
const TOP_LEVEL_FIELDS = new Set([
  "slug", "path", "title", "description", "h1", "breadcrumbLabel", "intro",
  "sections", "faqs", "cta", "evidence", "internalLinks", "photo",
  "type", "serviceType", "datePublished", "dateModified",
]);

// The model's own tool-call wrapper, leaked into a content field verbatim.
// Deliberately narrow: it matches the XML-ish tag form only, never the bare
// word, so ordinary restoration prose about a "parameter" cannot trip it.
// A literal angle-bracket tag is already illegal in body prose (only <a> is
// permitted above), so this pattern costs nothing in false positives and names
// a distinct, actionable failure instead of a vague type mismatch.
const TOOL_CALL_MARKUP =
  /<\/?\s*(?:antml:)?(?:parameter|invoke|function_calls|function_results)\b/i;

function typeName(value) {
  if (Array.isArray(value)) return "an array";
  if (value === null) return "null";
  if (value === undefined) return "missing";
  if (typeof value === "string") return `a string (${value.length} chars)`;
  return `a ${typeof value}`;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shapeProblem(field, found, expected) {
  return `Shape violation at \`${field}\`: found ${found}, expected ${expected}. The template reads this field directly (templates/content-page.mjs), so a wrong shape crashes the build or renders empty.`;
}

/**
 * Walk every string anywhere in the page and report tool-call markup, with the
 * field path so the run record says where. Recursive on purpose: PR #25's leak
 * sat inside a field the gate's own field-lists never visited.
 */
export function findToolCallMarkup(value, path = "page", found = []) {
  if (typeof value === "string") {
    const at = value.search(TOOL_CALL_MARKUP);
    if (at !== -1) {
      found.push({ field: path, snippet: value.slice(Math.max(0, at - 20), at + 60).replace(/\s+/g, " ") });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findToolCallMarkup(v, `${path}[${i}]`, found));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) findToolCallMarkup(v, `${path}.${k}`, found);
  }
  return found;
}

function checkString(problems, field, value, { required = true } = {}) {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || !value.trim()) {
    problems.push(shapeProblem(field, typeName(value), required ? "a non-empty string" : "a string when present"));
  }
}

function checkObjectArray(problems, field, value, itemFields, { required = true, minLength = 1 } = {}) {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    problems.push(shapeProblem(field, typeName(value), "an array of objects"));
    return;
  }
  if (value.length < minLength) {
    problems.push(shapeProblem(field, `an array of ${value.length}`, `an array of at least ${minLength}`));
    return;
  }
  value.forEach((item, i) => {
    const at = `${field}[${i}]`;
    if (!isPlainObject(item)) {
      problems.push(shapeProblem(at, typeName(item), "an object"));
      return;
    }
    for (const key of itemFields) checkString(problems, `${at}.${key}`, item[key]);
  });
}

/**
 * Every field templates/content-page.mjs and templates/shell.mjs call .map(),
 * .length or a property access on. Checked before the claim, em dash, HTML and
 * link scans, because all of those walk these same structures and silently
 * scan nothing when the shape is wrong.
 */
export function checkShape(page) {
  const problems = [];

  if (!isPlainObject(page)) {
    return { ok: false, problems: [shapeProblem("page", typeName(page), "an object")] };
  }

  for (const field of ["title", "description", "h1", "breadcrumbLabel", "intro"]) {
    checkString(problems, field, page[field]);
  }

  // sections[] -> sections.map() at content-page.mjs:40
  if (!Array.isArray(page.sections)) {
    problems.push(shapeProblem("sections", typeName(page.sections), "an array of section objects"));
  } else if (!page.sections.length) {
    problems.push(shapeProblem("sections", "an empty array", "at least one section object"));
  } else {
    page.sections.forEach((section, i) => {
      const at = `sections[${i}]`;
      if (!isPlainObject(section)) {
        problems.push(shapeProblem(at, typeName(section), "an object"));
        return;
      }
      checkString(problems, `${at}.heading`, section.heading);
      checkString(problems, `${at}.eyebrow`, section.eyebrow, { required: false });
      if (section.cards === undefined) {
        // The no-cards branch renders `<p>${s.body}</p>` unconditionally.
        checkString(problems, `${at}.body`, section.body);
      } else {
        checkString(problems, `${at}.body`, section.body, { required: false });
        checkObjectArray(problems, `${at}.cards`, section.cards, ["heading", "body"]);
      }
    });
  }

  // faqs[] -> faqs.map() here and in shell.mjs's FAQPage schema
  checkObjectArray(problems, "faqs", page.faqs, ["q", "a"]);

  // cta -> esc(cta.heading) / esc(cta.body), read unconditionally
  if (!isPlainObject(page.cta)) {
    problems.push(shapeProblem("cta", typeName(page.cta), "an object with `heading` and `body`"));
  } else {
    checkString(problems, "cta.heading", page.cta.heading);
    checkString(problems, "cta.body", page.cta.body);
  }

  // internalLinks[] -> internalLinks.map(), optional
  checkObjectArray(problems, "internalLinks", page.internalLinks, ["href", "label"], { required: false, minLength: 0 });

  // photo -> photo.src / photo.alt, optional here (the no-image-no-ship rule
  // lives in run.mjs, not in the shape contract). `null` is accepted as
  // "no photo" and nothing else is: the template guards this one on
  // truthiness (`photo ? ... : ""`, and `photo?.src` in shell.mjs), so null
  // renders correctly, and five live pages already store it that way. The
  // array fields get no such latitude, because `internalLinks = []` is a
  // default parameter and defaults do not fire on null: a null there is a
  // `.length` on null at render time.
  if (page.photo !== undefined && page.photo !== null) {
    if (!isPlainObject(page.photo)) {
      problems.push(shapeProblem("photo", typeName(page.photo), "an object with `src` and `alt`"));
    } else {
      checkString(problems, "photo.src", page.photo.src);
      checkString(problems, "photo.alt", page.photo.alt);
    }
  }

  for (const key of Object.keys(page)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      problems.push(`Unknown top-level field \`${key}\` (${typeName(page[key])}): nothing in the template reads it, so it renders nowhere. In PR #25 a stray top-level \`body\` was the torn-off second half of \`cta\`.`);
    }
  }

  return { ok: problems.length === 0, problems };
}

// Structural check, run in code after generation — not left to prompt
// compliance alone. Mirrors agent-runtime's "dry-run is structural" principle.
export function checkPage(page) {
  const problems = [];

  // Shape first, and alone. Every check below walks sections, faqs and cta as
  // structures; on a wrong shape they scan nothing and report clean, which is
  // exactly how PR #25's two corrupted pages got through. Returning here keeps
  // the run record honest: one nameable failure, not a clean bill of health
  // for a document the gate never actually read.
  for (const leak of findToolCallMarkup(page)) {
    problems.push(`Tool-call markup leaked into content at \`${leak.field}\`: "...${leak.snippet}...". The model emitted its own tool-call wrapper instead of clean JSON, so the field holds transport markup, not writing. Redraft this page; do not try to repair the field.`);
  }
  problems.push(...checkShape(page).problems);
  if (problems.length) return { ok: false, problems };

  const text = flattenText(page);
  const forbidden = findForbiddenClaims(text);
  if (forbidden.length) {
    problems.push(`Forbidden claim pattern(s) detected: ${forbidden.join(", ")}`);
  }

  // Jake's ruling 2026-08-13, bytomorrow-bos CLAUDE.md Hard Rule 7: no em
  // dashes in content, ever, on any surface. Enforced here and not only in the
  // drafting prompt because GWF publishes autonomously (SOP-AGENTIC-SEO-
  // WEBSITES.md 2.4, graduated 2026-08-12) -- there is no human between a
  // draft and the live site, so prompt compliance alone would put a new em
  // dash on the site every cron run.
  for (const field of proseFields(page)) {
    const at = field.search(EM_DASH);
    if (at !== -1) {
      const snippet = field.slice(Math.max(0, at - 40), at + 40);
      problems.push(`Em dash in published prose (no em dashes, ever): "...${snippet}...". Rewrite with a comma, or a period, colon, or parentheses where a comma will not carry the sentence.`);
    }
  }

  for (const field of bodyFields(page)) {
    if (UNSAFE_HTML.test(field)) problems.push(`Unsafe HTML in body field: ${field.slice(0, 80)}`);
    if (ALLOWED_INLINE_TAG.test(field)) problems.push(`Disallowed HTML tag (only <a> is permitted) in: ${field.slice(0, 80)}`);
  }

  const linkedHrefs = [
    ...extractHrefs(bodyFields(page)),
    ...(page.internalLinks || []).map((l) => l.href),
  ];
  for (const href of linkedHrefs) {
    if (href.startsWith("/") && !VALID_INTERNAL_LINKS.has(href)) {
      problems.push(`Broken internal link (not a real page): ${href}`);
    }
  }

  if (!page.slug || !/^[a-z0-9-]+$/.test(page.slug)) problems.push(`Invalid slug: ${page.slug}`);
  if (!page.path || !page.path.startsWith("/")) problems.push(`Invalid path: ${page.path}`);
  if (!page.faqs || page.faqs.length < 2) problems.push("Fewer than 2 FAQs: visible Q&A is required per SOP-AGENTIC-SEO-WEBSITES.md §3");
  if (page.description && page.description.length > 165) problems.push(`Meta description too long (${page.description.length} chars)`);

  return { ok: problems.length === 0, problems };
}
