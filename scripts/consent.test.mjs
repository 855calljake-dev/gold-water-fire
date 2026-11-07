// Tests for the Privacy and Terms pages and the text-message consent box, the
// things a carrier reviewer checks before approving a texting campaign (A2P 10DLC).
//
// The real build runs in a throwaway copy of the build inputs, so these see what
// Netlify will publish and leave the repo's tracked HTML alone.
//
// Run: node --test scripts/consent.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, smsConsentField } from "../templates/lib.mjs";
import { CONFIRMED_FACTS, findForbiddenClaims } from "../worker/facts.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// A literal copy on purpose. This is what the campaign filing says, so changing
// the box's wording has to be a deliberate edit in two places, and in the filing.
const FILED_WORDING = "I agree to receive text messages from Gold Water Fire about this request (appointment confirmations, reminders and estimate updates) at the number above. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Agreeing is not a condition of purchase.";
const NOT_TEXTED = "Customers who do neither are not texted.";
const NOT_BY_ITSELF = "Calling us does not by itself sign you up for texts.";
const NO_SHARING = "Mobile phone numbers and text-message consent are never shared with or sold to third parties or affiliates for marketing or promotional purposes.";
const LEGAL_LINE = "ADL Solutions Inc, doing business as Gold Water Fire";

// The hosts /privacy/ names, plus the site itself. A page loading anything else
// makes the policy false.
const NAMED_HOSTS = new Set(["news.google.com", "fonts.googleapis.com", "fonts.gstatic.com", new URL(BRAND.siteUrl).hostname]);
const TRACKER = /gtag\(|googletagmanager|google-analytics|doubleclick|fbq\(|connect\.facebook\.net|ttq\.|snap\.licdn|clarity\.ms|hotjar|leadconnector|msgsndr/i;
const REMOTE_URL = /^(?:https?:)?\/\/([^/"'\s]+)/i;

let out;
const pages = new Map();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs);
    else if (name.endsWith(".html")) pages.set(`/${path.relative(out, abs)}`, readFileSync(abs, "utf8"));
  }
}

before(() => {
  out = mkdtempSync(path.join(tmpdir(), "gwf-consent-"));
  for (const p of ["content", "data", "templates", "scripts/build.mjs"]) cpSync(path.join(ROOT, p), path.join(out, p), { recursive: true });
  const env = { ...process.env };
  delete env.CONTEXT; // never ping IndexNow from a test
  const r = spawnSync(process.execPath, [path.join(out, "scripts", "build.mjs")], { encoding: "utf8", env });
  assert.equal(r.status, 0, `build failed: ${r.stderr}`);
  walk(out);
});

after(() => { if (out) rmSync(out, { recursive: true, force: true }); });

const page = (p) => {
  assert.ok(pages.has(p), `${p} was not built`);
  return pages.get(p);
};

const attrsOf = (tag) => Object.fromEntries(
  [...tag.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? ""]),
);

const formsOn = (html) => [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);

const phoneForms = () => {
  const found = [];
  for (const [p, html] of pages) {
    for (const form of formsOn(html)) {
      if (/type="tel"|name="phone"/.test(form)) found.push({ path: p, form });
    }
  }
  return found;
};

const consentBlock = (form) => {
  const m = form.match(/<div class="sms-consent">[\s\S]*?<\/p>\s*<\/div>\s*<\/div>/);
  assert.ok(m, "no sms-consent block in this form");
  return m[0];
};

const checkbox = (form) => {
  const tags = [...form.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tags.length, 1, "exactly one checkbox per form");
  return tags[0];
};

// What a browser sends: every named control, except an unticked checkbox.
function submission(form, { ticked }) {
  const data = {};
  for (const m of form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = attrsOf(`<${m[1]} ${m[2]}`);
    if (!attrs.name) continue;
    if (attrs.type === "checkbox") {
      if (ticked) data[attrs.name] = attrs.value;
    } else data[attrs.name] = attrs.value ?? "";
  }
  return data;
}

test("both pages are built at clean URLs, indexable, and in the sitemap", () => {
  const sitemap = readFileSync(path.join(out, "sitemap.xml"), "utf8");
  for (const [file, url] of [["/privacy/index.html", "/privacy/"], ["/terms/index.html", "/terms/"]]) {
    const html = page(file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${BRAND.siteUrl}${url}">`));
    assert.doesNotMatch(html, /name="robots" content="noindex"/);
    assert.ok(sitemap.includes(`<loc>${BRAND.siteUrl}${url}</loc>`), `${url} missing from the sitemap`);
  }
});

test("the footer links both pages on every built page", () => {
  const samples = [
    "/index.html", "/about.html", "/contact.html", "/craftsmanship.html", "/guides/index.html",
    "/service-areas/index.html", "/roof/index.html", "/water-damage-restoration.html",
    "/fire-damage-restoration.html", "/reconstruction.html", "/thanks.html", "/404.html",
    "/privacy/index.html", "/terms/index.html",
  ];
  for (const s of samples) page(s);
  assert.ok([...pages.keys()].some((p) => /^\/guides\/.+\.html$/.test(p) && p !== "/guides/index.html"), "no guide page in the sample");
  assert.ok([...pages.keys()].some((p) => /^\/[a-z-]+\/water-damage-restoration\.html$/.test(p)), "no city page in the sample");
  for (const [p, html] of pages) {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer, `${p} has no footer`);
    assert.ok(footer.includes('href="/privacy/"'), `${p} footer has no Privacy link`);
    assert.ok(footer.includes('href="/terms/"'), `${p} footer has no Terms link`);
  }
});

test("the test really sees the forms: all four form templates are in the built set", () => {
  const paths = phoneForms().map((f) => f.path);
  for (const p of ["/index.html", "/contact.html", "/roof/index.html", "/water-damage-restoration.html", "/fire-damage-restoration.html"]) {
    assert.ok(paths.includes(p), `${p} should carry a phone form`);
  }
});

test("every form with a phone field has one unticked, optional box carrying the filed wording", () => {
  for (const { path: p, form } of phoneForms()) {
    const tag = checkbox(form);
    const a = attrsOf(tag);
    assert.equal(a.name, "sms_consent", p);
    assert.equal(a.value, "yes", p);
    assert.ok(!("checked" in a), `${p}: box must not be ticked by default`);
    assert.ok(!("required" in a), `${p}: box must not be required`);
    assert.ok(!("disabled" in a), `${p}: a disabled box never reaches the submission`);

    const block = consentBlock(form);
    const label = block.match(new RegExp(`<label[^>]*for="${a.id}"[^>]*>([\\s\\S]*?)</label>`));
    assert.ok(label, `${p}: label is not tied to the box by id`);
    assert.equal(label[1], FILED_WORDING, `${p}: wording differs from the campaign filing`);
    assert.ok(block.includes('href="/privacy/"'), `${p}: no Privacy link beside the box`);
    assert.ok(block.includes('href="/terms/"'), `${p}: no Terms link beside the box`);
    assert.ok(form.indexOf("sms_consent") < form.indexOf('type="submit"'), `${p}: box must come before the button`);
  }
});

test("a form submits without the box, and the value reaches Netlify as a named field only when ticked", () => {
  for (const { path: p, form } of phoneForms()) {
    const open = attrsOf(form.match(/<form\b[^>]*>/)[0]);
    assert.equal(open["data-netlify"], "true", `${p}: Netlify detects forms from this attribute`);
    assert.equal(open.method, "POST", p);
    assert.ok(open.name, `${p}: form needs a name`);
    assert.match(form, new RegExp(`name="form-name" value="${open.name}"`), p);
    assert.match(form, /<button type="submit"/, p);

    const required = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\brequired\b[^>]*>/g)].map((m) => attrsOf(m[0]).name);
    assert.ok(!required.includes("sms_consent"), `${p}: sending the form must not depend on the box`);
    assert.deepEqual(required.sort(), ["name", "phone"], `${p}: only name and phone are required`);

    assert.ok(!("sms_consent" in submission(form, { ticked: false })), `${p}: unticked sends no sms_consent`);
    assert.equal(submission(form, { ticked: true }).sms_consent, "yes", p);
  }
  const js = readFileSync(path.join(ROOT, "assets", "js", "main.js"), "utf8");
  assert.doesNotMatch(js, /addEventListener\(\s*["']submit|preventDefault|\.checked\s*=|\.submit\(/, "no script may block a form or tick the box");
});

test("every template with a phone input uses the shared consent field", () => {
  const dir = path.join(ROOT, "templates");
  const withPhone = readdirSync(dir).filter((f) => /type="tel"/.test(readFileSync(path.join(dir, f), "utf8")));
  assert.deepEqual(withPhone.sort(), ["contact.mjs", "home.mjs", "roof.mjs", "service.mjs"], "a new phone form needs smsConsentField and a line here");
  for (const f of withPhone) assert.match(readFileSync(path.join(dir, f), "utf8"), /\$\{smsConsentField\("/, f);
});

test("the sentences the box and the phone path made false are gone from every page", () => {
  for (const [p, html] of pages) {
    for (const stale of ["We only use your number to call you back", "We text you only if you tick", "Customers who do not tick the box are not texted", "Calling us does not sign you up"]) {
      assert.ok(!html.includes(stale), `${p} still says: ${stale}`);
    }
  }
});

test("the note under a form speaks only for that form", () => {
  for (const p of ["/index.html", "/roof/index.html", "/water-damage-restoration.html", "/fire-damage-restoration.html"]) {
    assert.ok(page(p).includes("This form signs you up for texts only if you tick the box above."), p);
  }
});

test("the pages show the facts from worker/facts.mjs and the legal name", () => {
  const fact = (key) => {
    const v = CONFIRMED_FACTS.match(new RegExp(`^- ${key}:\\s*(.+)$`, "m"))?.[1];
    assert.ok(v, `facts.mjs has no "${key}" line`);
    return v.trim();
  };
  const phone = fact("Phone"), email = fact("Email"), address = fact("Address"), roc = fact("AZ ROC license");
  assert.equal(BRAND.phone, phone);
  assert.equal(BRAND.email, email);
  assert.equal(`${BRAND.addressLine1}, ${BRAND.addressLine2}`, address);
  assert.equal(BRAND.license, `AZ ROC ${roc}`);
  for (const file of ["/privacy/index.html", "/terms/index.html"]) {
    const main = page(file).match(/<main[\s\S]*<\/main>/)[0];
    for (const v of [phone, email, BRAND.addressLine1, BRAND.addressLine2, LEGAL_LINE]) {
      assert.ok(main.includes(v), `${file} is missing ${v}`);
    }
  }
  assert.ok(page("/terms/index.html").match(/<main[\s\S]*<\/main>/)[0].includes(`AZ ROC ${roc}`), "Terms is missing the ROC");
});

test("Privacy carries the no-sharing clause and says no agreement means no text", () => {
  const html = page("/privacy/index.html");
  assert.ok(html.includes(NO_SHARING));
  assert.ok(html.includes(NOT_TEXTED));
});

test("both pages describe both paths, and neither states the phone question as already live", () => {
  for (const file of ["/privacy/index.html", "/terms/index.html"]) {
    const main = page(file).match(/<main[\s\S]*<\/main>/)[0];
    assert.ok(main.includes("two ways to agree"), `${file} must name both paths`);
    assert.match(main, /tick the text-message box|ticking the text-message box/, file);
    assert.match(main, /[Ii]f our phone assistant asks, on a recorded call, whether you would like texts about your job/, `${file}: the phone path must stay conditional on being asked, so it is true before the agent is published`);
    assert.match(main, /answer(ing)? yes/, file);
    assert.ok(main.includes(NOT_TEXTED), file);
    assert.ok(main.includes(NOT_BY_ITSELF), file);
    assert.doesNotMatch(main, /(assistant|agent) (will|always) asks?|(assistant|agent) asks every|every call/i, `${file} states the question as live or universal`);
  }
});

test("Privacy says how long records are kept, and promises no automatic deletion", () => {
  const main = page("/privacy/index.html").match(/<main[\s\S]*<\/main>/)[0];
  assert.ok(main.includes("We keep call recordings and form submissions for up to 18 months."));
  assert.doesNotMatch(main, /automatic|auto-delet|purge|we delete .{0,40}after/i, "nothing deletes these automatically today");
});

test("Privacy says senior staff handle deletion, promises no time limit, and names nobody", () => {
  const main = page("/privacy/index.html").match(/<main[\s\S]*<\/main>/)[0];
  assert.ok(main.includes("Senior staff review and handle deletion requests."));
  assert.ok(main.includes("A person on our team reads that inbox."));
  const choices = main.match(/<h2>Your choices<\/h2>[\s\S]*?<h2>/)[0];
  assert.doesNotMatch(choices, /\bwithin\b|\bdays?\b|\bhours?\b|\bweeks?\b/i, "Jake gave no time limit");
  assert.doesNotMatch(main, /\b(Jake|Jim|Taylor|Bennett)\b/, "no person is named on the page");
});

test("Privacy describes the AI assistant exactly as the agent behaves: it says so when asked", () => {
  const main = page("/privacy/index.html").match(/<main[\s\S]*<\/main>/)[0];
  assert.ok(main.includes("A call may be answered by an AI assistant"));
  assert.ok(main.includes("If you ask whether you are talking to a real person, it tells you it is an AI assistant."));
});

test("Terms has the SMS section a carrier looks for", () => {
  const html = page("/terms/index.html");
  assert.match(html, /<h2>SMS terms/);
  for (const s of [NOT_TEXTED, "Message frequency varies", "Msg &amp; data rates may apply.", "Reply STOP", "Reply HELP", "appointment confirmations, reminders and estimate updates", "not a condition of purchase"]) {
    assert.ok(html.includes(s), `Terms is missing: ${s}`);
  }
  assert.match(html, /our own employees and on-call staff/, "Terms must say staff are texted too");
});

test("neither page offers a way into texts other than the box or a yes on a recorded call", () => {
  for (const file of ["/privacy/index.html", "/terms/index.html"]) {
    const html = page(file);
    assert.doesNotMatch(html, /texting us first|text us first|lead form in an ad|verbal(ly)?\b/i, `${file} contradicts the filing`);
  }
});

test("no em dash in the new copy, and no claim the content gate forbids", () => {
  const dash = /—|&mdash;|&#8212;|&#x2014;/i;
  assert.doesNotMatch(smsConsentField("x"), dash);
  for (const [p, html] of pages) {
    const note = html.match(/<p class="note">[\s\S]*?<\/p>/)?.[0] ?? "";
    assert.doesNotMatch(note, dash, p);
  }
  for (const file of ["/privacy/index.html", "/terms/index.html"]) {
    const html = page(file);
    assert.doesNotMatch(html, dash, file);
    const text = html.match(/<main[\s\S]*<\/main>/)[0].replace(/<[^>]+>/g, " ");
    assert.deepEqual(findForbiddenClaims(text), [], file);
  }
});

test("the privacy policy stays true: no page loads a tracker or a host it does not name", () => {
  let remoteLoads = 0;
  for (const [p, html] of pages) {
    const noData = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(noData, TRACKER, `${p} loads a tracker, so /privacy/ must change first`);
    assert.doesNotMatch(noData, /document\.cookie/, `${p} sets a cookie, and /privacy/ says it sets none`);
    assert.doesNotMatch(noData.replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, ""), /<script\b/, `${p} has an inline script, which this check cannot read`);
    for (const m of noData.matchAll(/<(script|iframe|img|source|video|audio|embed|object|link)\b[^>]*>/g)) {
      const a = attrsOf(m[0]);
      const host = (a.src ?? a.data ?? (m[1] === "link" ? a.href : ""))?.match(REMOTE_URL)?.[1];
      if (!host) continue;
      remoteLoads += 1;
      assert.ok(NAMED_HOSTS.has(host), `${p} loads ${host}, which /privacy/ does not name`);
    }
  }
  assert.ok(remoteLoads > 0, "the scan found no remote loads at all, so it is not reading the pages");
  for (const f of readdirSync(path.join(ROOT, "assets", "css"))) {
    const css = readFileSync(path.join(ROOT, "assets", "css", f), "utf8");
    for (const m of css.matchAll(/@import\s+(?:url\()?["']?([^"');\s]+)|url\(\s*["']?([^"')\s]+)/g)) {
      const host = (m[1] ?? m[2]).match(REMOTE_URL)?.[1];
      if (host) assert.ok(NAMED_HOSTS.has(host), `assets/css/${f} loads ${host}, which /privacy/ does not name`);
    }
  }
  assert.doesNotMatch(readFileSync(path.join(ROOT, "assets", "js", "main.js"), "utf8"), /document\.cookie/, "main.js sets a cookie, and /privacy/ says it sets none");
});
