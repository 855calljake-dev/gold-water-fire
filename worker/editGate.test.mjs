#!/usr/bin/env node
// Tests for the edit-path gate. Run by worker/evidenceGate.test.mjs, so
// `npm test` covers it, or on its own: node worker/editGate.test.mjs
//
// Every refusal below is a page the build and the old test suite would have
// shipped. The wrong numbers in this file are test inputs: the right ones are
// always read from facts.mjs, never typed, including here.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEditedPage, checkEditFields, loadValidPaths, parseConfirmedContact, TEMPLATE_PAGES, TITLE_MAX } from "./editGate.mjs";
import { checkPage } from "./evidenceGate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const CLI = path.join(HERE, "checkChangedPages.mjs");

const { phone: PHONE_DIGITS, roc: ROC } = parseConfirmedContact();
const [AREA, EXCH, LINE] = [PHONE_DIGITS.slice(0, 3), PHONE_DIGITS.slice(3, 6), PHONE_DIGITS.slice(6)];
const RIGHT_PHONE = `(${AREA}) ${EXCH}-${LINE}`;

const REAL_GUIDE = "/guides/a-real-guide.html";
const validPaths = new Set([...TEMPLATE_PAGES, REAL_GUIDE]);

const page = (over = {}) => ({
  slug: "a-good-page",
  path: "/guides/a-good-page.html",
  title: "A Good Page | Gold Water Fire Phoenix, AZ",
  description: "A short, honest description of the page, comfortably under the meta length limit.",
  h1: "A good page",
  breadcrumbLabel: "A good page",
  intro: "An intro paragraph that reads like a person wrote it.",
  sections: [{ heading: "A heading", body: "A paragraph of body copy." }],
  faqs: [{ q: "A question?", a: "An answer." }, { q: "Another question?", a: "Another answer." }],
  cta: { heading: "Call us", body: `Reach us at ${RIGHT_PHONE}. AZ ROC #${ROC}.` },
  internalLinks: [{ href: "/contact.html", label: "Contact Gold Water Fire" }],
  photo: { src: "/assets/img/a-good-page.jpg", alt: "A photo of the thing." },
  evidence: "An internal note the template never renders.",
  type: "educational",
  datePublished: "2026-08-31",
  dateModified: "2026-08-31",
  ...over,
});

const verdict = (p) => checkEditedPage(p, { validPaths });

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (err) { failures += 1; console.log(`FAIL  ${name}: ${err.message}`); }
}
function refused(name, over, pattern) {
  check(`refuses: ${name}`, () => {
    const result = verdict(page(over));
    assert.equal(result.ok, false, "gate accepted it");
    assert.match(result.problems.join(" | "), pattern);
  });
}
function accepted(name, over) {
  check(`accepts: ${name}`, () => {
    const result = verdict(page(over));
    assert.equal(result.ok, true, result.problems.join(" | "));
  });
}

// --- a clean edit ---------------------------------------------------------

accepted("a clean edit", {});
accepted("the title and meta wording from the first edit-path PR", {
  title: "Water-Damaged Door Frame: Repair or Replace? | Gold Water Fire Phoenix, AZ",
  description: "Door sticking, frame soft, paint bubbling near the base? See the signs of water damage and how to tell if the frame can be repaired or needs replacing.",
});

// --- wrong phone ----------------------------------------------------------

const WRONG = "602-555-0199";
refused("wrong phone in the title", { title: `Call ${WRONG} | Gold Water Fire` }, /Wrong phone number/);
refused("wrong phone in the meta", { description: `Door frame damage? Call ${WRONG} today.` }, /Wrong phone number/);
refused("wrong phone in the body", { intro: `Call ${WRONG} today.` }, /Wrong phone number/);
refused("wrong phone in the CTA", { cta: { heading: "Call", body: `Call ${WRONG}.` } }, /Wrong phone number/);
refused("wrong phone with parentheses", { description: "Call (602) 555-0199 today." }, /Wrong phone number/);
refused("wrong phone with dots", { description: "Call 602.555.0199 today." }, /Wrong phone number/);
refused("wrong phone with spaces", { description: "Call 602 555 0199 today." }, /Wrong phone number/);
refused("wrong phone with no separators", { description: "Call 6025550199 today." }, /Wrong phone number/);
refused("wrong phone with a country code", { description: "Call +1 602 555 0199 today." }, /Wrong phone number/);
refused("wrong phone with an en dash", { description: "Call 602–555–0199 today." }, /Wrong phone number/);
refused("wrong phone in a tel link", { intro: 'Call <a href="tel:+16025550199">us</a> today.' }, /Wrong phone number in a link/);
refused("wrong phone with the right last four", { description: `Call 602-555-${LINE} today.` }, /Wrong phone number/);

for (const form of [RIGHT_PHONE, `${AREA}-${EXCH}-${LINE}`, `${AREA}.${EXCH}.${LINE}`, `${AREA} ${EXCH} ${LINE}`, PHONE_DIGITS, `+1 ${AREA} ${EXCH} ${LINE}`, `1-${AREA}-${EXCH}-${LINE}`]) {
  accepted(`the right phone written as ${form}`, { description: `Call ${form} today.` });
}
accepted("the right phone in a tel link", { intro: `Call <a href="tel:+1${PHONE_DIGITS}">us</a> today.` });
accepted("the right phone in a tel link with an extension", { intro: `Call <a href="tel:+1${PHONE_DIGITS};ext=1">us</a> today.` });
accepted("a date and a dollar range are not phone numbers", { intro: "Updated 2026-09-01. Most jobs run $1,200-$4,500 and take 3-5 days." });
accepted("digits inside a link are not a phone number", { intro: 'See <a href="https://example.com/6025550199">this</a> and https://example.com/602-555-0199 too.' });

// --- wrong ROC ------------------------------------------------------------

refused("wrong ROC in the title", { title: "Door Frames | AZ ROC #999999 | Gold Water Fire" }, /Wrong ROC or license number/);
refused("wrong ROC in the meta", { description: "Licensed in Arizona, ROC #999999." }, /Wrong ROC or license number/);
refused("wrong ROC in the body", { intro: "Our license is ROC 999999." }, /Wrong ROC or license number/);
refused("a short ROC number after a #", { description: "AZ ROC #12." }, /Wrong ROC or license number/);
refused("wrong license number with no ROC", { description: "Arizona license No. 999999." }, /Wrong ROC or license number/);
refused("wrong number after Lic.", { description: "Lic. 999999 in Arizona." }, /Wrong ROC or license number/);
refused("wrong number after the agency's full name", { description: "Registrar of Contractors license 999999." }, /Wrong ROC or license number/);

accepted("the right ROC number", { description: `Licensed in Arizona, AZ ROC #${ROC}.` });
accepted("the right ROC number with no #", { description: `ROC ${ROC}, KB-2.` });
accepted("a year after the word license is not a license number", { intro: "We renewed this license in 2019." });
accepted("a price after the word license is not a license number", { intro: "A license bond can cost $150000 on a large job." });
accepted("the ROC named with no number", { intro: "You can look up any contractor on the ROC website." });

// --- HTML in the title and description --------------------------------------

refused("script tag in the title", { title: "<script>alert(1)</script> Door Frame | Gold Water Fire" }, /`title` must be plain text/);
refused("script tag in the description", { description: "<script>alert(1)</script> Door frame damage." }, /`description` must be plain text/);
refused("any other tag in the title", { title: "<b>Door Frame</b> | Gold Water Fire" }, /`title` must be plain text/);
refused("a link in the description", { description: 'See <a href="/contact.html">us</a>.' }, /`description` must be plain text/);
refused("an event handler in the title", { title: "x onerror=alert(1) | Gold Water Fire" }, /`title` must be plain text/);
refused("an entity in the title", { title: "Fire &amp; Water | Gold Water Fire" }, /`title` must be plain text/);
accepted("a literal ampersand in the title", { title: "Fire & Water | Gold Water Fire Phoenix, AZ" });

// --- title length ---------------------------------------------------------

refused("over-long title", { title: "x".repeat(TITLE_MAX + 1) }, /Title too long/);
accepted("a title exactly at the limit", { title: "x".repeat(TITLE_MAX) });

// --- what checkPage already refuses, still refused on this path -------------

refused("em dash in the title", { title: "Door Frame — Repair or Replace? | Gold Water Fire" }, /Em dash/);
refused("em dash in the description", { description: "Door frame damage — repair or replace." }, /Em dash/);
refused("meta over 165 characters", { description: "x ".repeat(90) }, /Meta description too long/);
refused("firm certification claim in the title", { title: "An IICRC Certified Firm | Gold Water Fire" }, /IICRC firm-certification/);
refused("job count in the meta", { description: "Over 5,000 homes restored." }, /job\/project count/);
refused("founding year in the meta", { description: "Founded in 2011." }, /founding-year/);

// --- internal links -------------------------------------------------------

accepted("a real guide in internalLinks", { internalLinks: [{ href: REAL_GUIDE, label: "A real guide" }] });
accepted("a real guide in the body", { intro: `See <a href="${REAL_GUIDE}">this guide</a>.` });
accepted("a real guide with a fragment", { intro: `See <a href="${REAL_GUIDE}#drying">this guide</a>.` });
accepted("a real page with a query string", { intro: 'See <a href="/contact.html?from=guide">us</a>.' });
accepted("the guides hub", { internalLinks: [{ href: "/guides/", label: "Guides" }] });
accepted("the site's own domain, real page", { intro: `See <a href="https://www.goldwaterfire.com${REAL_GUIDE}">this guide</a>.` });
accepted("an external link", { intro: 'See <a href="https://www.epa.gov/mold">the EPA</a>.' });
accepted("an email link", { intro: 'Write to <a href="mailto:Help@goldwaterfire.com">us</a>.' });
accepted("a same-page fragment", { intro: 'Jump to <a href="#drying">drying</a>.' });

const DEAD = "/guides/no-such-page.html";
refused("dead link in internalLinks", { internalLinks: [{ href: DEAD, label: "Dead" }] }, /Broken internal link.*no-such-page/);
refused("dead link in the body", { intro: `See <a href="${DEAD}">this</a>.` }, /Broken internal link.*no-such-page/);
refused("dead link in a card", { sections: [{ heading: "H", cards: [{ heading: "C", body: `See <a href="${DEAD}">this</a>.` }] }] }, /Broken internal link.*no-such-page/);
refused("dead link in an FAQ answer", { faqs: [{ q: "Q?", a: `See <a href="${DEAD}">this</a>.` }, { q: "Q2?", a: "A2." }] }, /Broken internal link.*no-such-page/);
refused("dead link with a fragment", { intro: `See <a href="${DEAD}#x">this</a>.` }, /Broken internal link.*no-such-page/);
refused("dead link in single quotes", { intro: `See <a href='${DEAD}'>this</a>.` }, /Broken internal link.*no-such-page/);
refused("dead link with no quotes", { intro: `See <a href=${DEAD}>this</a>.` }, /Broken internal link.*no-such-page/);
refused("dead link on the site's own domain", { intro: `See <a href="https://www.goldwaterfire.com${DEAD}">this</a>.` }, /Broken internal link.*no-such-page/);
refused("dead link on the bare domain", { intro: `See <a href="https://goldwaterfire.com${DEAD}">this</a>.` }, /Broken internal link.*no-such-page/);
refused("a relative link", { intro: 'See <a href="guides/a-real-guide.html">this</a>.' }, /Relative link/);
refused("a real page with no .html", { intro: 'See <a href="/guides/a-real-guide">this</a>.' }, /Broken internal link/);
refused("the 404 page", { internalLinks: [{ href: "/404.html", label: "x" }] }, /Broken internal link/);
refused("a protocol-relative link", { intro: 'See <a href="//www.goldwaterfire.com/x.html">this</a>.' }, /Broken internal link/);
refused("a javascript link in an internalLinks entry", { internalLinks: [{ href: "javascript:alert(1)", label: "x" }] }, /Link scheme not allowed/);

check("one dead link is reported once, not by both gates", () => {
  const result = verdict(page({ intro: `See <a href="${DEAD}">this</a>.` }));
  assert.equal(result.problems.filter((p) => p.includes("no-such-page")).length, 1, result.problems.join(" | "));
});

// --- service-template pages --------------------------------------------------

// The shape templates/service.mjs reads: no slug, an empty sections array, and
// fields the content-page contract calls unknown. Without its own path, every
// PR touching one of these pages would go red whatever it changed.
const servicePage = (over = {}) => ({
  template: "service",
  type: "service",
  path: "/a-service.html",
  title: "A Service | Gold Water Fire Phoenix, AZ",
  description: "A short, honest description of the service.",
  h1: "A service",
  eyebrow: "Service",
  sections: [],
  faqs: [{ q: "A question?", a: "An answer." }],
  causes: [{ heading: "A cause", body: "How it happens." }],
  steps: [{ heading: "A step", body: "What we do." }],
  insuranceBody: "How the claim works.",
  ...over,
});
function serviceRefused(name, over, pattern) {
  check(`service page refuses: ${name}`, () => {
    const result = verdict(servicePage(over));
    assert.equal(result.ok, false, "gate accepted it");
    assert.match(result.problems.join(" | "), pattern);
    assert.ok(!result.problems.some((p) => p.includes("Unknown top-level field")), "held to the content-page contract");
  });
}

check("service page: a clean edit passes", () => {
  const result = verdict(servicePage());
  assert.equal(result.ok, true, result.problems.join(" | "));
});
serviceRefused("forbidden claim in a service-only field", { causes: [{ heading: "A cause", body: "Over 5,000 homes restored." }] }, /job\/project count/);
serviceRefused("em dash in a service-only field", { steps: [{ heading: "A step", body: "We dry it — fast." }] }, /Em dash/);
serviceRefused("tool-call markup in a service-only field", { insuranceBody: `<${"parameter"} name="x">` }, /Tool-call markup/);
serviceRefused("meta over 165 characters", { description: "x ".repeat(90) }, /Meta description too long/);
serviceRefused("wrong phone in a service-only field", { insuranceBody: "Call 602-555-0199." }, /Wrong phone number/);
serviceRefused("wrong ROC in a service-only field", { insuranceBody: "AZ ROC #999999." }, /Wrong ROC or license number/);
serviceRefused("script tag in the title", { title: "<script>alert(1)</script> A Service" }, /`title` must be plain text/);
serviceRefused("over-long title", { title: "x".repeat(TITLE_MAX + 1) }, /Title too long/);
serviceRefused("dead internal link", { insuranceBody: `See <a href="${DEAD}">this</a>.` }, /Broken internal link.*no-such-page/);

check("a normal page is still held to the shape contract", () => {
  const result = verdict(page({ sections: [] }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" | "), /Shape violation at `sections`/);
});

check("a page with some other template value is still held to the shape contract", () => {
  const result = verdict(page({ template: "Service", sections: [] }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" | "), /Shape violation at `sections`/);
});

// --- the numbers come from facts.mjs ---------------------------------------

check("the right numbers follow the facts source, not the code", () => {
  const facts = "- Phone: (212) 555-0100\n- AZ ROC license: #111111 · KB-2";
  const p = page({ description: "Call (212) 555-0100. ROC #111111.", cta: { heading: "Call", body: "Call us." } });
  assert.equal(checkEditFields(p, { validPaths, factsText: facts }).ok, true, "the facts' own numbers were refused");
  assert.equal(checkEditFields(p, { validPaths }).ok, false, "another set of numbers passed against the real facts");
});

check("no confirmed number is typed in the gate's source", () => {
  const source = readFileSync(path.join(HERE, "editGate.mjs"), "utf8");
  assert.ok(!source.includes(ROC), "ROC number typed in editGate.mjs");
  assert.ok(!source.includes(LINE), "phone number typed in editGate.mjs");
});

for (const [name, facts] of [["no phone line", "- AZ ROC license: #111111"], ["no ROC line", "- Phone: (212) 555-0100"], ["a short phone", "- Phone: 555-0100\n- AZ ROC license: #111111"]]) {
  check(`unreadable facts fail closed: ${name}`, () => {
    assert.throws(() => checkEditedPage(page(), { validPaths, factsText: facts }), /cannot check contact details/);
  });
}

// --- valid paths come from the repo -----------------------------------------

check("valid paths include every real content page and the worker's old six", () => {
  const paths = loadValidPaths(ROOT);
  for (const p of ["/", "/water-damage-restoration.html", "/fire-damage-restoration.html", "/reconstruction.html", "/about.html", "/contact.html"]) {
    assert.ok(paths.has(p), `missing ${p}`);
  }
  assert.ok(paths.has("/guides/door-and-frame-water-damage-repair.html"), "a real guide is missing");
  assert.ok(!paths.has(DEAD), "a made-up page is valid");
  assert.ok(paths.size > 300, `only ${paths.size} paths`);
});

check("TEMPLATE_PAGES matches the routes scripts/build.mjs writes", () => {
  const build = readFileSync(path.join(ROOT, "scripts", "build.mjs"), "utf8");
  const routes = new Set();
  for (const m of build.matchAll(/writeHtml\("([^"]+)"/g)) routes.add(m[1]);
  for (const m of build.matchAll(/written\.push\("([^"]+)"\)/g)) routes.add(m[1]);
  // Hubs are written as index.html but linked and listed by their slash URL.
  const linkable = [...routes].filter((r) => !r.endsWith("/index.html") && r !== "/thanks.html" && r !== "/404.html");
  assert.deepEqual(linkable.sort(), [...TEMPLATE_PAGES].sort());
});

// --- the worker's create path is untouched ----------------------------------

check("worker path: checkPage(page) still holds a new draft to the old six links", () => {
  const result = checkPage(page({ internalLinks: [{ href: REAL_GUIDE, label: "A real guide" }] }));
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" | "), /Broken internal link/);
});

check("worker path: checkPage(page) gained none of the new refusals", () => {
  for (const over of [{ title: "x".repeat(TITLE_MAX + 50) }, { description: "Call 602-555-0199 today." }, { title: "Door Frames | AZ ROC #999999" }, { title: "<script>alert(1)</script> Door Frame" }]) {
    const result = checkPage(page(over));
    assert.equal(result.ok, true, `${JSON.stringify(over)}: ${result.problems.join(" | ")}`);
  }
});

// --- the CI entry point, on real git history --------------------------------

function git(cwd, ...args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const scratch = [];
function repo(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "edit-gate-"));
  scratch.push(dir);
  git(dir, "init", "-q", "-b", "main");
  commit(dir, files, "base");
  return dir;
}
function commit(dir, files, message = "change") {
  for (const [p, body] of Object.entries(files)) {
    const abs = path.join(dir, p);
    if (body === null) rmSync(abs);
    else {
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
}
const run = (dir, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: "utf8" });
const pageFile = (slug, over = {}) => JSON.stringify(page({ slug, path: `/guides/${slug}.html`, ...over }), null, 2);
const BASE = {
  "content/pages/one.json": pageFile("one"),
  "content/pages/two.json": pageFile("two"),
  "README.md": "readme\n",
};
const BAD_TITLE = { title: "Call 602-555-0199 | Gold Water Fire" };

function cli(name, fn) {
  check(`cli: ${name}`, () => fn());
}

cli("a change that touches no page passes", () => {
  const dir = repo(BASE);
  commit(dir, { "README.md": "changed\n", "worker/x.mjs": "// code\n" });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /0 page file\(s\) changed/);
  assert.match(r.stdout, /nothing to check/);
});

cli("no change at all passes", () => {
  const dir = repo(BASE);
  const r = run(dir, "HEAD");
  assert.equal(r.status, 0, r.stdout);
});

cli("a clean edit passes and names the file it read", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/one.json": pageFile("one", { title: "A Better Title | Gold Water Fire Phoenix, AZ" }) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /PASS {4}content\/pages\/one\.json/);
  assert.match(r.stdout, /1 passed, 0 refused/);
});

cli("an edit to a service-template page passes", () => {
  const dir = repo({ ...BASE, "content/pages/a-service.json": JSON.stringify(servicePage(), null, 2) });
  commit(dir, { "content/pages/a-service.json": JSON.stringify(servicePage({ title: "A Better Service | Gold Water Fire" }), null, 2) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /PASS {4}content\/pages\/a-service\.json/);
});

cli("a bad edit fails the job, names the file and the reason", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/one.json": pageFile("one", BAD_TITLE) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /REFUSED content\/pages\/one\.json/);
  assert.match(r.stdout, /Wrong phone number/);
});

cli("an uncommitted bad edit is caught against HEAD", () => {
  const dir = repo(BASE);
  writeFileSync(path.join(dir, "content/pages/one.json"), pageFile("one", BAD_TITLE));
  const r = run(dir, "HEAD");
  assert.equal(r.status, 1, r.stdout);
});

cli("never site-wide: a bad page nobody changed is not read", () => {
  const dir = repo({ ...BASE, "content/pages/old-bad.json": pageFile("old-bad", BAD_TITLE) });
  commit(dir, { "content/pages/one.json": pageFile("one", { title: "A Better Title | Gold Water Fire Phoenix, AZ" }) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!r.stdout.includes("old-bad"), r.stdout);
});

cli("a link to another real page in the same repo passes", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/one.json": pageFile("one", { internalLinks: [{ href: "/guides/two.html", label: "Two" }] }) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
});

cli("a link to a page deleted in the same change is refused", () => {
  const dir = repo(BASE);
  commit(dir, {
    "content/pages/one.json": pageFile("one", { internalLinks: [{ href: "/guides/two.html", label: "Two" }] }),
    "content/pages/two.json": null,
  });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /Broken internal link.*two\.html/);
});

cli("a deleted page has nothing to read and passes", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/two.json": null });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /0 page file\(s\) changed/);
});

cli("a renamed page is checked at its new path", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/two.json": null, "content/pages/renamed.json": pageFile("two", BAD_TITLE) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /REFUSED content\/pages\/renamed\.json/);
});

cli("files beside the pages are not treated as pages", () => {
  const dir = repo(BASE);
  commit(dir, { "content/backlog.json": "not page json", "content/pages/sub/x.json": "not page json", "content/pages/notes.txt": "x" });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /0 page file\(s\) changed/);
});

// The exact shape CI sees: a pull request checks out as a merge commit, and
// HEAD^1 has to mean the base branch, not the PR's own last commit.
cli("on a merge commit, HEAD^1 reads every PR commit and only the PR's commits", () => {
  const dir = repo(BASE);
  git(dir, "checkout", "-q", "-b", "pr");
  commit(dir, { "content/pages/one.json": pageFile("one", BAD_TITLE) }, "the bad edit");
  commit(dir, { "README.md": "a later commit on the PR\n" }, "later");
  git(dir, "checkout", "-q", "main");
  commit(dir, { "content/pages/two.json": pageFile("two", BAD_TITLE), "other.md": "x\n" }, "a bad page that landed on main after the PR branched");
  git(dir, "merge", "-q", "--no-ff", "-m", "merge", "pr");
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /REFUSED content\/pages\/one\.json/);
  assert.ok(!r.stdout.includes("two.json"), r.stdout);
});

cli("a base that does not exist exits 2, not 0", () => {
  const dir = repo(BASE);
  const r = run(dir, "no-such-ref");
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout, /could not run/);
});

cli("no base at all exits 2", () => {
  const dir = repo(BASE);
  const r = run(dir);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout, /usage/);
});

cli("a changed page that is not valid JSON exits non-zero and names it", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/one.json": "{ not json" });
  const r = run(dir, "HEAD^1");
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /one\.json/);
});

cli("page text cannot start a log line", () => {
  const dir = repo(BASE);
  commit(dir, { "content/pages/one.json": pageFile("one", { title: "<b>x</b>\n::error::injected" }) });
  const r = run(dir, "HEAD^1");
  assert.equal(r.status, 1, r.stdout);
  assert.ok(!r.stdout.split("\n").some((line) => line.startsWith("::")), r.stdout);
});

for (const dir of scratch) rmSync(dir, { recursive: true, force: true });

if (failures) {
  console.log(`\n${failures} edit gate test(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\nAll edit gate tests passed.");
}
