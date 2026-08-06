import { findForbiddenClaims } from "./facts.mjs";

const UNSAFE_HTML = /<script|<style|on\w+\s*=|javascript:/i;
const ALLOWED_INLINE_TAG = /<(?!\/?a(\s|>))[a-z][^>]*>/i; // any tag that isn't <a ...> or </a>
const HREF_RE = /href="([^"]*)"/gi;

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

function bodyFields(page) {
  const fields = [page.intro];
  for (const s of page.sections || []) {
    fields.push(s.body);
    for (const c of s.cards || []) fields.push(c.body);
  }
  for (const f of page.faqs || []) fields.push(f.a);
  return fields.filter(Boolean);
}

// Structural check, run in code after generation — not left to prompt
// compliance alone. Mirrors agent-runtime's "dry-run is structural" principle.
export function checkPage(page) {
  const problems = [];

  const text = flattenText(page);
  const forbidden = findForbiddenClaims(text);
  if (forbidden.length) {
    problems.push(`Forbidden claim pattern(s) detected: ${forbidden.join(", ")}`);
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
  if (!page.faqs || page.faqs.length < 2) problems.push("Fewer than 2 FAQs — visible Q&A is required per SOP-AGENTIC-SEO-WEBSITES.md §3");
  if (page.description && page.description.length > 165) problems.push(`Meta description too long (${page.description.length} chars)`);

  return { ok: problems.length === 0, problems };
}
