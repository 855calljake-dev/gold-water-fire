// Regression test for the Seven Clarity Moves contract (worker/clarity.mjs).
//
//   node worker/clarity.test.mjs
//
// Each rule gets a page that breaks only that rule, so a failure names the
// rule. The base page is the smallest page that satisfies all of them: if a
// change to clarity.mjs makes it fail, the contract grew a requirement nobody
// recorded.

import assert from "node:assert/strict";
import { checkClarityMoves, CANONICAL_PHRASES, CLARITY_PROMPT } from "./clarity.mjs";
import { checkPage } from "./evidenceGate.mjs";
import { coldReadText } from "./landing.mjs";

const fortyFive = "A moisture meter reads how much water is held inside drywall, wood or carpet, not just on the surface. A dry-looking wall can still read wet inside, which is why the readings, not the look of the room, decide when drying is finished and repairs can start.";

const base = () => ({
  slug: "what-moisture-meters-measure",
  path: "/guides/what-moisture-meters-measure.html",
  title: "What Moisture Meters Measure | Gold Water Fire, Phoenix, AZ",
  description: "How moisture meters read water hidden inside walls and floors, and why those readings decide when drying is done.",
  h1: "What moisture meters measure",
  breadcrumbLabel: "Moisture meters",
  intro: "The wall looks dry, but nobody will tell you yet whether it is.",
  bottomLine: "A wall can look dry and still hold water. The meter readings decide when drying is done, not how the room looks.",
  plainEnglishHeading: "What is a moisture meter?",
  plainEnglishBody: fortyFive,
  whyItMattersHeading: "Why moisture readings matter for a Phoenix homeowner",
  whyItMattersBody: "Close up a wall that is still wet and the water stays trapped behind new paint. That is where mold and soft drywall start. Readings taken before anything is rebuilt are the only proof the structure is actually dry, and they are what an insurer will ask to see.",
  sections: [
    { heading: "How the readings work", body: "A paragraph of body copy." },
    { heading: "What the numbers mean", body: "Another paragraph." },
  ],
  faqs: [{ q: "How do I know my wall is really dry?", a: "The readings." }, { q: "Can I just use a fan?", a: "It depends." }],
  takeaway: "A dry-looking wall is not proof; the meter readings decide when drying is finished.",
  cta: { heading: "Call us", body: "We will walk you through it." },
  internalLinks: [{ href: "/water-damage-restoration.html", label: "Water damage restoration" }],
  evidence: "General mechanics only.",
});

const problemsFor = (mutate) => {
  const p = base();
  mutate(p);
  return checkClarityMoves(p).problems.join(" | ");
};

// The base page passes both gates.
assert.deepEqual(checkClarityMoves(base()).problems, [], "the base page satisfies the clarity contract");
assert.deepEqual(checkPage(base()).problems, [], "and the existing evidence gate accepts the new fields");

// Move 6, bottom line.
assert.match(problemsFor((p) => delete p.bottomLine), /Missing `bottomLine`/);
assert.match(problemsFor((p) => { p.bottomLine = "One. Two. Three. Four. Five."; }), /bottomLine` has 5 sentences/);

// Move 1, plain English.
assert.match(problemsFor((p) => delete p.plainEnglishBody), /Missing `plainEnglishHeading`/);
assert.match(problemsFor((p) => { p.plainEnglishHeading = "Moisture meters explained"; }), /must be a question that starts "What is"/);
assert.match(problemsFor((p) => { p.plainEnglishBody = "Too short."; }), /plainEnglishBody` is 2 words/);
assert.match(problemsFor((p) => { p.plainEnglishBody = `${fortyFive} ${fortyFive}`; }), /plainEnglishBody` is \d+ words/);
assert.match(problemsFor((p) => { p.plainEnglishBody = `<a href="/x">${fortyFive}</a>`; }), /must be plain text/);

// Move 4, why it matters.
assert.match(problemsFor((p) => delete p.whyItMattersHeading), /Missing `whyItMattersHeading`/);
assert.match(problemsFor((p) => { p.whyItMattersHeading = "Moisture and you"; }), /must read "Why \[topic\] matters/);

// Move 7, takeaway.
assert.match(problemsFor((p) => delete p.takeaway), /Missing `takeaway`/);
assert.match(problemsFor((p) => { p.takeaway = "word ".repeat(26).trim() + "."; }), /takeaway` is 26 words/);
assert.match(problemsFor((p) => { p.takeaway = "First sentence. Second sentence."; }), /must be one sentence/);
assert.equal(problemsFor((p) => { p.takeaway = "A floor that feels dry means nothing; the framing behind it decides."; }), "", "a grammatical semicolon is not refused (2026-10-03 false positive)");

// Each canonical phrase at most once. Curly apostrophes count as the same phrase.
assert.match(
  problemsFor((p) => { p.intro = "Here’s why this matters to you: it does."; p.sections[0].body = "Here's why this matters to you, again."; }),
  /"here's why this matters to you" appears 2 times/,
);
assert.equal(problemsFor((p) => { p.intro = "The bottom line is the readings."; }), "", "once is allowed");

// Barred for the Depletion cluster.
assert.match(problemsFor((p) => { p.cta.body = "So what would you do?"; }), /Barred for this reader: move 5/);
assert.match(problemsFor((p) => { p.cta.body = "Where do you land?"; }), /move 5/);
assert.match(problemsFor((p) => { p.cta.body = "Your move."; }), /move 5/);
assert.match(problemsFor((p) => { p.faqs[0].a = "What's your read on that?"; }), /move 2/);
assert.equal(problemsFor((p) => { p.sections[0].body = "Plan your move-out date with the crew."; }), "", "an ordinary 'your move-out' passes");

// No public credit.
assert.match(problemsFor((p) => { p.sections[1].body = "As Frank Luntz says, keep it simple."; }), /Luntz/);

// The evidence gate scans the clarity fields too: an em dash or a forbidden
// claim cannot hide in them.
{
  const p = base();
  p.takeaway = "Dry is a reading — not a look.";
  assert.match(checkPage(p).problems.join(" | "), /Em dash/);
  const q = base();
  q.bottomLine = "We are an IICRC certified firm. The readings decide.";
  assert.match(checkPage(q).problems.join(" | "), /IICRC/);
}

// The cold reader never sees the takeaway.
assert.ok(!coldReadText(base()).includes(base().takeaway), "the takeaway box is withheld from the cold read");
assert.ok(coldReadText(base()).includes(base().bottomLine), "but the rest of the page is there");

// The prompt and the code agree on the phrase list and the bars.
for (const phrase of ["Let me put that in plain English", "Here's why this matters to you", "The bottom line is", "Here's what I want you to remember", "Imagine this"]) {
  assert.ok(CLARITY_PROMPT.includes(phrase), `prompt names "${phrase}"`);
  assert.ok(CANONICAL_PHRASES.includes(phrase.toLowerCase()), `code checks "${phrase}"`);
}
assert.ok(!CLARITY_PROMPT.includes("—"), "no em dash in the prompt the drafter imitates");

console.log("clarity.test.mjs: all assertions passed");
