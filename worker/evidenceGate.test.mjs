#!/usr/bin/env node
// Regression test for the evidence gate's shape and tool-call-markup checks.
// Run it:
//
//   node worker/evidenceGate.test.mjs
//
// Same reasoning as imageTextGate.test.mjs and verify.test.mjs: reading a gate
// tells you what its author meant, running it tells you what it does. This one
// exists because reading evidenceGate.mjs on 2026-08-30 would have told you it
// checked sections, and it did not, it checked an empty document and said the
// page was clean.
//
// The fixtures in test-fixtures/pr25/ are the eight real pages from batch PR
// #25 (2026-08-31), unedited. Two carry a truncated tool-call response in
// `sections` and `cta`; six are the clean output of the same run. Both halves
// matter: the corrupted ones prove the gate now rejects, and the six clean
// ones prove it did not start rejecting real output.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPage, checkShape, findToolCallMarkup } from "./evidenceGate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "test-fixtures", "pr25");

const CORRUPTED = [
  "how-arizona-humidity-affects-drying",
  "thermal-imaging-for-water-detection",
];
const CLEAN = [
  "containment-barriers-during-restoration",
  "daily-monitoring-logs-during-drying",
  "negative-air-machines-explained",
  "what-moisture-meters-measure",
  "when-drywall-can-be-dried-vs-replaced",
  "why-drying-takes-days-not-hours",
];

const load = (slug) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${slug}.json`), "utf8"));

// A page that is correct in every respect, used as the base for the synthetic
// one-field-wrong cases below. Kept minimal on purpose: if a change to the
// gate makes this fail, the gate has grown a requirement nobody recorded.
const good = () => ({
  slug: "a-good-page",
  path: "/guides/a-good-page.html",
  title: "A Good Page | Gold Water Fire",
  description: "A short, honest description of the page, comfortably under the meta length limit.",
  h1: "A good page",
  breadcrumbLabel: "A good page",
  intro: "An intro paragraph that reads like a person wrote it.",
  sections: [
    { eyebrow: "Why this matters", heading: "A heading", body: "A paragraph of body copy." },
    { heading: "A card section", cards: [{ heading: "Card one", body: "Card copy." }] },
  ],
  faqs: [{ q: "A question?", a: "An answer." }, { q: "Another question?", a: "Another answer." }],
  cta: { heading: "Call us", body: "Reach out and we will walk you through it." },
  internalLinks: [{ href: "/contact.html", label: "Contact Gold Water Fire" }],
  photo: { src: "/assets/img/a-good-page.jpg", alt: "A photo of the thing." },
  evidence: "An internal note the template never renders.",
  type: "educational",
  datePublished: "2026-08-31",
  dateModified: "2026-08-31",
});

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (err) { failures += 1; console.log(`FAIL  ${name}: ${err.message}`); }
}

// --- the real corrupted pages ---------------------------------------------

for (const slug of CORRUPTED) {
  check(`PR #25 corrupted page is REJECTED: ${slug}`, () => {
    const result = checkPage(load(slug));
    assert.equal(result.ok, false, "gate passed a page that broke the build");
    const joined = result.problems.join(" | ");
    assert.match(joined, /Tool-call markup leaked into content/, "leak not named as its own failure");
    assert.match(joined, /sections/, "did not name the sections field");
    assert.match(joined, /Shape violation at `sections`/, "did not report sections as a shape violation");
    assert.match(joined, /Shape violation at `cta`/, "did not report cta as a shape violation");
    assert.match(joined, /Unknown top-level field `body`/, "did not report the torn-off cta half");
  });
}

check("the rejection names the type found and the type expected", () => {
  const problems = checkShape(load("how-arizona-humidity-affects-drying")).problems;
  const sections = problems.find((p) => p.includes("`sections`"));
  assert.ok(sections, "no sections problem at all");
  assert.match(sections, /found a string \(3239 chars\)/);
  assert.match(sections, /expected an array of section objects/);
});

// --- the six clean pages from the same run ---------------------------------

for (const slug of CLEAN) {
  check(`PR #25 clean page still PASSES: ${slug}`, () => {
    const result = checkPage(load(slug));
    assert.equal(result.ok, true, `false positive: ${result.problems.join(" | ")}`);
  });
}

// --- one field wrong at a time ---------------------------------------------

const cases = [
  ["sections as a string", (p) => { p.sections = "[{\"heading\":\"x\"}]"; }, /Shape violation at `sections`.*expected an array/s],
  ["sections empty", (p) => { p.sections = []; }, /Shape violation at `sections`.*at least one section object/s],
  ["a section that is a string", (p) => { p.sections[0] = "not an object"; }, /Shape violation at `sections\[0\]`/],
  ["a section with no heading", (p) => { delete p.sections[0].heading; }, /Shape violation at `sections\[0\].heading`.*found missing/s],
  ["a section with no body and no cards", (p) => { delete p.sections[0].body; }, /Shape violation at `sections\[0\].body`/],
  ["cards as a string", (p) => { p.sections[1].cards = "nope"; }, /Shape violation at `sections\[1\].cards`/],
  ["a card missing body", (p) => { delete p.sections[1].cards[0].body; }, /Shape violation at `sections\[1\].cards\[0\].body`/],
  ["faqs as a string", (p) => { p.faqs = "[]"; }, /Shape violation at `faqs`/],
  ["an faq missing its answer", (p) => { delete p.faqs[0].a; }, /Shape violation at `faqs\[0\].a`/],
  ["cta as a string", (p) => { p.cta = "Call us"; }, /Shape violation at `cta`.*expected an object/s],
  ["cta missing body", (p) => { delete p.cta.body; }, /Shape violation at `cta.body`/],
  ["internalLinks as a string", (p) => { p.internalLinks = "/contact.html"; }, /Shape violation at `internalLinks`/],
  ["a link missing href", (p) => { delete p.internalLinks[0].href; }, /Shape violation at `internalLinks\[0\].href`/],
  ["photo as a string", (p) => { p.photo = "/assets/img/x.jpg"; }, /Shape violation at `photo`/],
  ["photo missing alt", (p) => { delete p.photo.alt; }, /Shape violation at `photo.alt`/],
  ["h1 missing", (p) => { delete p.h1; }, /Shape violation at `h1`.*found missing/s],
  ["intro as a number", (p) => { p.intro = 42; }, /Shape violation at `intro`.*found a number/s],
  ["a stray top-level field", (p) => { p.body = "torn-off cta half"; }, /Unknown top-level field `body`/],
];

for (const [name, mutate, pattern] of cases) {
  check(`rejects: ${name}`, () => {
    const page = good();
    mutate(page);
    const result = checkPage(page);
    assert.equal(result.ok, false, "gate accepted it");
    assert.match(result.problems.join(" | "), pattern);
  });
}

// Five live pages store `photo: null` and render correctly, because the
// template guards it on truthiness. Rejecting that would be a false positive
// on real, shipped content.
check("photo: null is accepted as no photo", () => {
  const page = good();
  page.photo = null;
  const result = checkPage(page);
  assert.equal(result.ok, true, result.problems.join(" | "));
});

check("internalLinks: null is still rejected (a default does not fire on null)", () => {
  const page = good();
  page.internalLinks = null;
  const result = checkPage(page);
  assert.equal(result.ok, false);
  assert.match(result.problems.join(" | "), /Shape violation at `internalLinks`/);
});

check("the known-good synthetic page passes", () => {
  const result = checkPage(good());
  assert.equal(result.ok, true, result.problems.join(" | "));
});

// --- the tool-call markup check, on its own --------------------------------

check("tool-call markup is found at any depth", () => {
  const page = good();
  page.sections[1].cards[0].body = "\n<parameter name=\"items\">[{\"heading\":\"x\"}]";
  const found = findToolCallMarkup(page);
  assert.equal(found.length, 1);
  assert.equal(found[0].field, "page.sections[1].cards[0].body");
});

// Built by concatenation, never typed literally: a source file that contains
// the literal closing tag is a file that cannot be pasted through a tool call
// without truncating it, which is the exact accident this gate now catches.
const OPEN = "<";
const CLOSE = "</";

check("the closing form and the antml: prefix are both caught", () => {
  const markers = [
    CLOSE + "parameter>",
    OPEN + "invoke name=\"x\">",
    OPEN + "function_calls>",
    CLOSE + "antml:parameter>",
    OPEN + "antml:invoke name=\"x\">",
  ];
  for (const marker of markers) {
    const page = good();
    page.intro = `Some prose. ${marker} more prose.`;
    const result = checkPage(page);
    assert.equal(result.ok, false, `not caught: ${marker}`);
    assert.match(result.problems.join(" | "), /Tool-call markup leaked into content at `page.intro`/);
  }
});

check("ordinary prose about parameters is NOT flagged", () => {
  const page = good();
  page.sections[0].body =
    "A drying plan has one parameter that matters most, the vapour pressure gap. " +
    "We invoke the same process on every job, and the function of a dehumidifier " +
    "is to widen that gap. Parameters like temperature matter less than people think.";
  page.faqs[0].a = "The parameter your technician watches is relative humidity, not the thermostat.";
  const result = checkPage(page);
  assert.equal(result.ok, true, result.problems.join(" | "));
});

check("a page that is both corrupted and otherwise fine reports the leak, not silence", () => {
  const page = good();
  page.sections = OPEN + 'parameter name="sections">[{"heading":"x","body":"y"}]';
  const result = checkPage(page);
  assert.equal(result.ok, false);
  const joined = result.problems.join(" | ");
  assert.match(joined, /Tool-call markup leaked into content at `page.sections`/);
  assert.match(joined, /Shape violation at `sections`/);
});

// The shape checks run before, and instead of, the claim and em dash scans.
// Reporting a shape failure alone is deliberate: the scans below it walk these
// same structures and report clean when the shape is wrong, so mixing their
// verdicts into the same list would put "no forbidden claims" next to "we did
// not read the document."
check("shape failure short-circuits the scans that assume the shape", () => {
  const page = good();
  page.sections = "not an array";
  page.cta.heading = "A heading with an em dash \u2014 like this";
  const result = checkPage(page);
  assert.equal(result.ok, false);
  assert.ok(!result.problems.some((p) => p.includes("Em dash")), "reported a downstream scan on an unread document");
});

if (failures) {
  console.log(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll evidence gate shape tests passed.");
