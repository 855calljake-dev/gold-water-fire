// The gate for a page changed in a pull request. worker/run.mjs gates a NEW
// draft; nothing gated an EDIT until this (bytomorrow-bos
// doctrine/HANDOFF-SEO-IMPROVEMENT-LOOP.md, piece B3: with a forbidden claim, a
// wrong phone number and an em dash on a page, `npm run build` and `npm test`
// both exited 0). CI runs it through worker/checkChangedPages.mjs.
//
// Kept apart from checkPage's defaults on purpose, the same way clarity.mjs is.
// A structural refusal on the worker's path counts toward self-de-graduation
// (run.mjs), and a false positive there demoted this tenant on 2026-08-23. So
// the worker's one-argument checkPage(page) behaves exactly as it did, and
// everything stricter lives here. Moving these checks onto the create path is a
// ruling, not a refactor.
//
// What this adds to checkPage:
//   - internal links are checked against the pages that really exist
//   - a title length limit
//   - no HTML or entities in the title or description
//   - a phone or ROC number that is not the one in facts.mjs is refused
//   - link forms checkPage's scan never saw: single quotes, no quotes, relative
//     paths, and the site's own domain written out in full
//   - service-template pages get the checks that apply to them (checkServicePage)
//
// Measured on the 357 live pages when this was written: none trips a rule above,
// 356 pass, and reconstruction.json is refused if edited, for two real checkPage
// problems that predate this gate (no slug, a 172-character description).
//
// What it does NOT do: judge a plausible false statement that matches no
// pattern. That is the claim verifier (worker/verify.mjs), which is not in CI
// because it needs a key on the Actions secrets. A pass here is not a verdict
// on whether the page is true.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { BRAND } from "../templates/lib.mjs";
import { checkPage, DESCRIPTION_MAX, findToolCallMarkup } from "./evidenceGate.mjs";
import { CONFIRMED_FACTS, findForbiddenClaims } from "./facts.mjs";

// A sanity bound, not a Google rule (the SEO quality standard says preview
// limits are not ranking thresholds). Set above the longest live title, 114
// characters, because this gate reads the whole changed page: a tighter limit
// would refuse an edit that never touched the title. 281 of 357 live titles
// are over 70, so a display-width limit would refuse most of the site.
export const TITLE_MAX = 120;

// Pages scripts/build.mjs renders from templates rather than from content/pages.
// A test parses build.mjs and fails if this list and the build's routes differ.
// /thanks.html and /404.html exist but are not pages anyone should link to.
export const TEMPLATE_PAGES = ["/", "/about.html", "/contact.html", "/craftsmanship.html", "/guides/", "/service-areas/", "/roof/", "/privacy/", "/terms/"];

const SITE_HOST = new URL(BRAND.siteUrl).hostname.replace(/^www\./, "");

// Tags, the event-handler and javascript: forms the body scan looks for, and
// entities: the template escapes these fields, so "&amp;" shows on the page as
// literal text (shipped once in a <title>, see the note in draft.mjs).
const NOT_PLAIN_TEXT = /<[a-z/!?]|\bon\w+\s*=|javascript:|&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/i;

const HREF_ATTR = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const URL_TEXT = /\bhttps?:\/\/\S+/gi;
const SEP = "[\\s.\\-\\u2010-\\u2015]";
const PHONE = new RegExp(`(?<!\\d)(?:\\+?1${SEP}?)?\\(?\\d{3}\\)?${SEP}?\\d{3}${SEP}?\\d{4}(?!\\d)`, "g");
// A "#" before the digits makes any length a license number. Without one it
// takes five or more, so "license in 2019" is a year and not a wrong license. A
// dollar sign ends the search, so "a license can cost $150000" is a price.
const LICENSE_NUMBER = /(?:\b(?:ROC|Registrar of Contractors|licen[cs]e)\b|\blic\.)[^\d\n$]{0,24}?(#\s*\d+|\d{5,})/gi;

// Fields that hold a location rather than reader-facing words.
const NOT_PROSE_KEYS = new Set(["slug", "path", "href", "src"]);

const digitsOf = (s) => String(s).replace(/\D/g, "");
const tenDigits = (s) => {
  const d = digitsOf(s);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};

/**
 * The confirmed phone and ROC number, read out of facts.mjs so there is one
 * source and no number is typed here. A facts block this cannot read throws:
 * a gate that does not know the right number must not report a clean page.
 */
export function parseConfirmedContact(factsText = CONFIRMED_FACTS) {
  const phone = tenDigits(factsText.match(/^- Phone:\s*(.+)$/m)?.[1] ?? "");
  const roc = factsText.match(/^- AZ ROC license:\s*#?\s*(\d+)/m)?.[1];
  if (phone.length !== 10 || !roc) {
    throw new Error("worker/facts.mjs CONFIRMED_FACTS has no readable \"- Phone:\" or \"- AZ ROC license:\" line, so the edit gate cannot check contact details");
  }
  return { phone, roc };
}

/** Every path a page may link to: the real content pages plus the template pages. */
export function loadValidPaths(root) {
  const dir = path.join(root, "content", "pages");
  const paths = new Set(TEMPLATE_PAGES);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    let page;
    try {
      page = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    } catch (err) {
      throw new Error(`content/pages/${file} is not valid JSON: ${err.message}`);
    }
    if (typeof page.path === "string") paths.add(page.path);
  }
  return paths;
}

function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Every string on the page with links and URLs removed, so a number inside a
// URL is not read as a phone number.
function proseStrings(value, out = []) {
  if (typeof value === "string") out.push(value.replace(HREF_ATTR, "").replace(URL_TEXT, ""));
  else if (Array.isArray(value)) value.forEach((v) => proseStrings(v, out));
  else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) if (!NOT_PROSE_KEYS.has(k)) proseStrings(v, out);
  }
  return out;
}

// Every link on the page, from an href field or an href attribute in any string.
function linksIn(value, out = []) {
  if (typeof value === "string") {
    for (const m of value.matchAll(HREF_ATTR)) out.push(m[1] ?? m[2] ?? m[3]);
  } else if (Array.isArray(value)) value.forEach((v) => linksIn(v, out));
  else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "href" && typeof v === "string") out.push(v);
      else linksIn(v, out);
    }
  }
  return out;
}

const brokenLink = (href) => `Broken internal link (not a real page): ${href}`;

function linkProblem(href, validPaths, contact) {
  const h = href.trim();
  if (!h) return "Empty link: an href with nothing in it";
  if (h.startsWith("#")) return null;
  if (h.startsWith("//")) return brokenLink(h);
  if (h.startsWith("/")) return validPaths.has(h.split(/[?#]/)[0]) ? null : brokenLink(h);
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if (!scheme) return `Relative link (write it from the site root, /guides/x.html): ${h}`;
  if (scheme === "mailto") return null;
  if (scheme === "tel") return tenDigits(h.split(";")[0]) === contact.phone ? null : `Wrong phone number in a link: ${h}. facts.mjs has a different one.`;
  if (scheme !== "http" && scheme !== "https") return `Link scheme not allowed: ${h}`;
  let url;
  try {
    url = new URL(h);
  } catch {
    return `Malformed link: ${h}`;
  }
  if (url.hostname.replace(/^www\./, "").toLowerCase() !== SITE_HOST) return null;
  return validPaths.has(url.pathname) ? null : brokenLink(h);
}

/**
 * The checks checkPage does not make. Works on any page shape, so a page
 * checkPage refuses for its shape still gets its title, numbers and links read.
 */
export function checkEditFields(page, { validPaths, factsText = CONFIRMED_FACTS }) {
  const contact = parseConfirmedContact(factsText);
  const problems = [];
  if (!isObj(page)) return { ok: false, problems: ["page is not an object"] };

  if (typeof page.title === "string" && page.title.length > TITLE_MAX) {
    problems.push(`Title too long (${page.title.length} chars, the limit is ${TITLE_MAX})`);
  }
  for (const field of ["title", "description"]) {
    if (typeof page[field] === "string" && NOT_PLAIN_TEXT.test(page[field])) {
      problems.push(`\`${field}\` must be plain text, no HTML or entities: the template escapes it, so it would show on the page as literal characters. Found: ${page[field].slice(0, 80)}`);
    }
  }

  for (const text of proseStrings(page)) {
    for (const m of text.matchAll(PHONE)) {
      if (tenDigits(m[0]) !== contact.phone) problems.push(`Wrong phone number: "${m[0]}". facts.mjs has a different one.`);
    }
    for (const m of text.matchAll(LICENSE_NUMBER)) {
      if (digitsOf(m[1]) !== contact.roc) problems.push(`Wrong ROC or license number: "${m[1]}". facts.mjs has a different one.`);
    }
  }

  for (const href of linksIn(page)) {
    const problem = linkProblem(href, validPaths, contact);
    if (problem) problems.push(problem);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * A page rendered by templates/service.mjs has its own fields. checkPage holds
 * every page to the content-page contract, so it would refuse each of these
 * whatever the edit, and stop at the shape check before its claim and em dash
 * scans ever ran. Those scans run here over every string on the page instead.
 * What a service page does not get is a check of its own shape. The build reads
 * those fields directly, so a page missing one fails there.
 */
function checkServicePage(page) {
  const problems = findToolCallMarkup(page).map((leak) => `Tool-call markup leaked into content at \`${leak.field}\`: "...${leak.snippet}..."`);
  const prose = proseStrings(page);
  const forbidden = findForbiddenClaims(prose.join("\n"));
  if (forbidden.length) problems.push(`Forbidden claim pattern(s) detected: ${forbidden.join(", ")}`);
  for (const text of prose) {
    const at = text.indexOf("—");
    if (at !== -1) problems.push(`Em dash in published prose (no em dashes, ever): "...${text.slice(Math.max(0, at - 40), at + 40)}...". Rewrite with a comma, or a period, colon, or parentheses where a comma will not carry the sentence.`);
  }
  if (typeof page.description === "string" && page.description.length > DESCRIPTION_MAX) problems.push(`Meta description too long (${page.description.length} chars)`);
  return { ok: problems.length === 0, problems };
}

/**
 * The whole edit gate: checkPage, with internal links read against the real
 * pages (or checkServicePage for a service-template page), plus checkEditFields.
 * checkClarityMoves and the Landing Test are left out because 355 of 357 live
 * pages predate those fields, and an edit that may add no new facts cannot add
 * them.
 */
export function checkEditedPage(page, { validPaths, factsText = CONFIRMED_FACTS }) {
  const gate = isObj(page) && page.template === "service"
    ? checkServicePage(page)
    : checkPage(page, { isValidInternalLink: (href) => validPaths.has(href.split(/[?#]/)[0]) });
  const fields = checkEditFields(page, { validPaths, factsText });
  const problems = [...new Set([...gate.problems, ...fields.problems])];
  return { ok: problems.length === 0, problems };
}
