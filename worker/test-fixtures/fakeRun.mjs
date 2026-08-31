// A preload that replaces globalThis.fetch so worker/run.mjs can be driven end
// to end, through every way a page can fail to ship, without touching
// Anthropic, Higgsfield or GitHub.
//
// Ported from Jake Taylor Home Loans' worker/test-fixtures/fakeRun.mjs, which
// has driven that worker's run record tests since 2026-08-27, onto this
// worker's differences: a claim verifier that also calls Anthropic, a
// generateImage() that returns null rather than a skip object, and Airtable
// telemetry instead of a JSONL run record.
//
// THE POINT IS THAT NOTHING UNDER worker/ IS MOCKED. The evidence gate, the
// claim verifier's plumbing, imagemagick, tesseract and exiftool are all the
// real ones, so a test asserting "the batch published the pages that passed"
// is asserting it about the code that actually runs on Railway. The only thing
// faked is the world outside the process.
//
// Loaded with node's --import flag ahead of the real entry point, which is why
// it can install the stub before any worker module runs.
//
// THE PLAN. FAKE_PLAN is a JSON array, one entry per backlog item the run will
// reach, applied in the order slugs first appear rather than by slug name, so
// a change to content/backlog.json does not silently re-target the test.
//
//   { "page": "good" | "nofaqs" | "emdash", "image": "clean" | "garbled"
//     | "providerfail" | "accountfail", "outputTokens": 10000 }
//
// "nofaqs" returns a page carrying a single FAQ, which is the exact refusal
// that stopped the 2026-08-31 batch: "Fewer than 2 FAQs". "emdash" trips Hard
// Rule 7. "garbled" serves one of the real images that shipped machine
// invented lettering onto the live site, so the text gate rejection in a test
// is the same rejection that happened in production, with real OCR tokens and
// real confidences rather than a hand written string.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PLAN = JSON.parse(process.env.FAKE_PLAN || "[]");
const GRADUATION_JSON = process.env.FAKE_GRADUATION_JSON || '{"state": "graduated"}';

const GARBLED = path.join(HERE, "garbled", "water-heater-failure-water-damage-phoenix-az.jpg");
const CLEAN = path.join(HERE, "clean", "no-rendered-text.jpg");

// Order of first appearance decides which plan entry a slug gets.
const slugOrder = [];
function planFor(slug) {
  if (!slugOrder.includes(slug)) slugOrder.push(slug);
  return PLAN[slugOrder.indexOf(slug)] || { page: "good", image: "clean", outputTokens: 10000 };
}

// The slug the run is currently working on. generateImage's request body does
// not carry it, and the run is strictly sequential, so the last drafted slug is
// the one the image belongs to.
let currentSlug = null;

// Every write this run attempts, so a test can assert on the PR body and on the
// graduation file without a network.
const writes = [];
globalThis.__FAKE_WRITES = writes;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function contentsResponse(text) {
  return jsonResponse({ sha: "deadbeef", content: Buffer.from(text, "utf8").toString("base64"), encoding: "base64" });
}

// Distinct vocabulary per item so synthetic pages do not read as clones of one
// another. This worker has no near duplicate gate today, but the drafted pages
// end up in a PR body a person reads, and identical prose would make a failure
// harder to attribute to the right slug.
const VOCAB = [
  ["moisture", "reading", "wall", "cavity", "meter", "probe", "surface", "depth"],
  ["drying", "airflow", "equipment", "placement", "chamber", "humidity", "grain", "balance"],
  ["category", "sanitation", "cleaning", "removal", "material", "porous", "assembly", "subfloor"],
  ["scope", "estimate", "documentation", "photograph", "measurement", "sketch", "record", "file"],
  ["smoke", "residue", "soot", "surface", "cleaning", "sealing", "odour", "treatment"],
  ["rebuild", "framing", "drywall", "texture", "paint", "trim", "flooring", "finish"],
];

function paragraph(words, seed, sentences = 3) {
  const out = [];
  for (let i = 0; i < sentences; i++) {
    const picked = [];
    for (let j = 0; j < 9; j++) picked.push(words[(seed + i * 3 + j) % words.length]);
    out.push(`The ${picked.join(" ")} matters here.`);
  }
  return out.join(" ");
}

function fakePage(slug, index, flavor) {
  const words = VOCAB[index % VOCAB.length];
  const emDash = flavor === "emdash" ? " This sentence carries a forbidden — character." : "";
  const faqs = [
    { q: `Does the ${words[3]} change anything?`, a: paragraph(words, index + 7, 2) },
    { q: `What about the ${words[4]}?`, a: paragraph(words, index + 8, 2) },
  ];
  return {
    slug,
    path: `/guides/${slug}.html`,
    title: `Understanding ${slug.replace(/-/g, " ")} in the Phoenix metro`,
    description: `A plain explanation of ${slug.replace(/-/g, " ")} for a homeowner working it out.`.slice(0, 160),
    h1: `Understanding ${slug.replace(/-/g, " ")}`,
    // Required by evidenceGate.mjs's shape contract (added 2026-08-31 by the
    // concurrent PR #25 fix). The template reads it directly, so a page
    // without one is refused before any prose scan runs.
    breadcrumbLabel: slug.replace(/-/g, " "),
    intro: `You are trying to make sense of this before deciding anything. ${paragraph(words, index, 2)}${emDash}`,
    sections: [
      { heading: `What ${words[0]} means here`, body: `${paragraph(words, index + 1)}\n\n${paragraph(words, index + 4)}` },
      { heading: `How the ${words[1]} usually goes`, body: `${paragraph(words, index + 2)}\n\n${paragraph(words, index + 5)}` },
    ],
    // The 2026-08-31 refusal, reproduced: one FAQ where the gate requires two.
    faqs: flavor === "nofaqs" ? faqs.slice(0, 1) : faqs,
    cta: { heading: "Talk it through", body: paragraph(words, index + 9, 2) },
    internalLinks: [{ href: "/water-damage-restoration.html", label: "Water damage restoration" }],
    evidence: "General mechanics only. No company specific claim appears on this page.",
  };
}

globalThis.fetch = async (input, opts = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = opts.method || "GET";

  if (url.includes("/contents/content/graduation.json")) {
    if (method === "PUT") {
      const body = JSON.parse(opts.body);
      writes.push({ kind: "graduation", message: body.message, content: Buffer.from(body.content, "base64").toString("utf8") });
      return jsonResponse({ content: { sha: "newsha" } });
    }
    return contentsResponse(GRADUATION_JSON);
  }

  if (url.includes("/contents/content/backlog.json")) {
    if (method === "PUT") {
      const body = JSON.parse(opts.body);
      // Summarised, not dumped whole. content/backlog.json carries over a
      // hundred items and the full file does not survive a pipe: writes are
      // handed back on an 'exit' listener after process.exit(), where stdout
      // truncates at the pipe buffer and the JSON arrives unterminated. What a
      // test needs from the backlog advance is which slugs moved and which did
      // not, so that is what crosses.
      const items = JSON.parse(Buffer.from(body.content, "base64").toString("utf8")).items || [];
      writes.push({
        kind: "backlog",
        drafted: items.filter((i) => i.status === "drafted").map((i) => i.slug),
        pending: items.filter((i) => i.status === "pending").map((i) => i.slug),
      });
      return jsonResponse({ content: { sha: "newsha" } });
    }
    return contentsResponse("{}");
  }

  if (url.includes("/contents/")) {
    if (method === "PUT") {
      const body = JSON.parse(opts.body);
      writes.push({ kind: "file", path: decodeURIComponent(url.split("/contents/")[1].split("?")[0]), message: body.message });
      return jsonResponse({ content: { sha: "newsha" } });
    }
    return jsonResponse({ message: "Not Found" }, 404);
  }

  if (url.includes("/git/ref/heads/")) return jsonResponse({ object: { sha: "basesha" } });
  if (url.includes("/git/refs")) return jsonResponse({ ref: "refs/heads/fake" });

  if (url.match(/\/pulls\/\d+\/merge$/)) {
    writes.push({ kind: "merge" });
    return jsonResponse({ sha: "mergedsha1234567" });
  }
  if (url.match(/\/pulls\/\d+$/)) return jsonResponse({ number: 99, mergeable: true, mergeable_state: "clean" });
  if (url.includes("/pulls")) {
    if (method === "POST") {
      const body = JSON.parse(opts.body);
      writes.push({ kind: "pr", title: body.title, body: body.body });
      return jsonResponse({ number: 99, html_url: "https://github.com/fake/pull/99" });
    }
    // findBatchPrForDate lists PRs before drafting. An empty list means no
    // batch has run today, which is what every test here wants.
    return jsonResponse([]);
  }

  // Anthropic, called by TWO modules with different tools. draft.mjs asks for
  // emit_page, verify.mjs asks for emit_verdict, and telling them apart by the
  // requested tool rather than by call order keeps the stub honest if either
  // one starts calling twice.
  if (url.includes("api.anthropic.com")) {
    const body = JSON.parse(opts.body);
    if (body.tool_choice?.name === "emit_verdict") {
      return jsonResponse({
        content: [{ type: "tool_use", name: "emit_verdict", input: { verdict: "pass", ungrounded_claims: [] } }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      });
    }
    const prompt = body.messages[0].content;
    const slug = (prompt.match(/Slug:\s*([a-z0-9-]+)/) || [])[1] || "unknown-slug";
    currentSlug = slug;
    const plan = planFor(slug);
    const index = slugOrder.indexOf(slug);
    return jsonResponse({
      content: [{ type: "tool_use", name: "emit_page", input: fakePage(slug, index, plan.page) }],
      usage: { input_tokens: 2000, output_tokens: plan.outputTokens ?? 10000 },
    });
  }

  // Higgsfield submit.
  if (url.includes("platform.higgsfield.ai") && method === "POST") {
    const plan = planFor(currentSlug);
    // 401, not 402. image.mjs treats 401/403/404 as account level and stops the
    // whole run; anything else falls through to a plain null, which is a
    // different outcome and a different row in the drop table.
    if (plan.image === "accountfail") return new Response("invalid credential for this account", { status: 401 });
    if (plan.image === "providerfail") return new Response("upstream model is unavailable", { status: 500 });
    return jsonResponse({ request_id: `req-${currentSlug}` });
  }

  // Higgsfield poll.
  if (url.includes("platform.higgsfield.ai") && url.includes("/status")) {
    return jsonResponse({ status: "completed", images: [{ url: `https://fake.invalid/image/${currentSlug}` }] });
  }

  // The generated image itself.
  if (url.startsWith("https://fake.invalid/image/")) {
    const plan = planFor(currentSlug);
    const file = plan.image === "garbled" ? GARBLED : CLEAN;
    return new Response(readFileSync(file), { status: 200, headers: { "content-type": "image/jpeg" } });
  }

  // Anything unrecognised fails loudly. A silent default would let a future
  // change reach a real endpoint from inside a test without anyone noticing.
  return jsonResponse({ message: `fakeRun.mjs has no stub for ${method} ${url}` }, 501);
};

// Hand the captured writes back to the test process. run.mjs exits through
// process.exit(), and an 'exit' listener still runs synchronously after that,
// so this is the one place the whole run's writes are known.
if (process.env.FAKE_DUMP_WRITES) {
  process.on("exit", () => {
    process.stdout.write(`__WRITES__${JSON.stringify(writes)}\n`);
  });
}
