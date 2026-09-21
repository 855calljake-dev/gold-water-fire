import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { measurementTag } from "../templates/measurement.mjs";

const settings = { tenant: "gwf", origin: "https://www.goldwaterfire.com", measurementId: "G-TEST000001", enabled: true, enhancedMeasurementDisabled: true };
const code = readFileSync(new URL("../assets/js/measurement.js", import.meta.url), "utf8");
function browser(options = {}) {
  const listeners = new Map();
  const loaded = [];
  const window = { location: { origin: settings.origin, pathname: options.path || "/", search: "", hash: "" } };
  const document = {
    currentScript: { dataset: { measurementId: settings.measurementId, pagePath: options.canonical || "/" } },
    referrer: "https://www.google.com/search?q=private@example.com#private",
    createElement: () => ({}),
    head: { appendChild: script => loaded.push(script) },
    addEventListener: (name, fn) => listeners.set(name, fn)
  };
  const context = vm.createContext({ window, document, navigator: {}, localStorage: { getItem: () => null }, URL });
  options.configure?.(context);
  const run = () => vm.runInContext(code, context);
  run();
  return { context, run, loaded, listeners, commands: () => Array.from(window.dataLayer || [], args => Array.from(args)) };
}

test("unconfigured build stays dark; enabled configuration refuses tenant mistakes", () => {
  assert.equal(measurementTag("/"), "");
  assert.equal(measurementTag("/", null), "");
  for (const patch of [{ tenant: "jthl" }, { origin: "https://www.jaketaylor.com" }, { measurementId: "G-Z8RSYV9HRM" }, { measurementId: "" }, { measurementId: 'G-X\"><script>' }, { enhancedMeasurementDisabled: false }]) {
    assert.throws(() => measurementTag("/", { ...settings, ...patch }));
  }
  for (const path of ["/contact.html", "/thanks.html", "/404.html", "/?email=private", "/person@example.com/"]) {
    assert.equal(measurementTag(path, settings), "");
  }
});

test("one page view and safe metadata; duplicate bootstrap is ignored", () => {
  const b = browser(); b.run();
  const events = b.commands().filter(c => c[0] === "event");
  assert.equal(events.length, 1);
  assert.equal(events[0][1], "page_view");
  assert.equal(events[0][2].page_location, settings.origin + "/");
  assert.equal(events[0][2].page_referrer, "https://www.google.com/");
  assert.equal(events[0][2].send_to, settings.measurementId);
  assert.equal(b.loaded.length, 1);
  assert.equal(b.loaded[0].referrerPolicy, "no-referrer");
  assert.equal(b.commands().find(c => c[0] === "config")[2].send_page_view, false);
  assert.equal(b.commands().find(c => c[0] === "set")[1].allow_google_signals, false);
  assert.doesNotMatch(JSON.stringify(b.commands()), /private|@|\?|#|form_/);
});

test("opt-outs, preview hosts, mismatched URLs and sensitive paths load nothing", () => {
  const cases = [
    c => { c.navigator.globalPrivacyControl = true; },
    c => { c.navigator.doNotTrack = "1"; },
    c => { c.localStorage.getItem = () => "true"; },
    c => { c.localStorage.getItem = () => { throw Error("blocked"); }; },
    c => { c.window["ga-disable-" + settings.measurementId] = true; },
    c => { c.window.location.origin = "https://preview.netlify.app"; },
    c => { c.window.location.search = "?email=private@example.com"; },
    c => { c.window.location.hash = "#private@example.com"; },
    c => { c.window.location.pathname = "/contact"; },
    c => { c.document.currentScript.dataset.measurementId = "G-Z8RSYV9HRM"; },
    c => { c.document.currentScript = null; }
  ];
  for (const configure of cases) {
    const b = browser({ configure }); assert.equal(b.loaded.length, 0); assert.equal(b.commands().length, 0);
  }
  for (const path of ["/contact", "/contact.html", "/contact/", "/thanks.html", "/404.html", "/private@example.com/"]) {
    const b = browser({ path, canonical: path }); assert.equal(b.loaded.length, 0);
  }
});

test("aliases use the build canonical and untrusted referrers are empty", () => {
  const b = browser({ path: "/about", canonical: "/about.html", configure: c => { c.document.referrer = "https://private:password@example.com/private"; } });
  const event = b.commands().find(c => c[0] === "event");
  assert.equal(event[2].page_location, settings.origin + "/about.html");
  assert.equal(event[2].page_referrer, "");
});

test("private and unknown referrer origins are omitted", () => {
  for (const referrer of ["https://private.customer.example.com/path", "https://www.jaketaylor.com/", "https://www.google.com.evil.test/", "invalid"]) {
    const b = browser({ configure: c => { c.document.referrer = referrer; } });
    assert.equal(b.commands().find(c => c[0] === "event")[2].page_referrer, "");
  }
});

test("only a trusted business telephone click is an interaction, never a lead", () => {
  const b = browser();
  const click = b.listeners.get("click");
  const event = (href, extra = {}) => ({ isTrusted: true, defaultPrevented: false, target: { closest: () => ({ getAttribute: () => href }) }, ...extra });
  click(event("tel:+14809993339", { isTrusted: false }));
  click(event("tel:+14809993339", { defaultPrevented: true }));
  click(event("mailto:private@example.com"));
  click(event("tel:+16025550123"));
  assert.equal(b.commands().filter(c => c[0] === "event").length, 1);
  click(event("tel:+1 (480) 999-3339"));
  assert.deepEqual(b.commands().filter(c => c[0] === "event").map(c => c[1]), ["page_view", "phone_click"]);
  assert.equal(b.listeners.has("submit"), false);
  b.context.navigator.globalPrivacyControl = true;
  click(event("tel:+14809993339"));
  assert.equal(b.commands().filter(c => c[0] === "event").length, 2);
  assert.equal(b.context.window["ga-disable-" + settings.measurementId], true);
});

test("actual build covers every page class and future content, excluding form/thanks/404", () => {
  const fixture = mkdtempSync(join(tmpdir(), "gwf-measurement-test-"));
  try {
    for (const directory of ["content", "templates"]) cpSync(new URL(`../${directory}`, import.meta.url), join(fixture, directory), { recursive: true });
    // The builder resolves its root one level up from scripts/.
    cpSync(new URL("./build.mjs", import.meta.url), join(fixture, "scripts/build.mjs"), { recursive: true });
    writeFileSync(join(fixture, "content/measurement.json"), JSON.stringify(settings));
    const output = execFileSync(process.execPath, [join(fixture, "scripts/build.mjs")], { env: { ...process.env, CONTEXT: "deploy-preview" }, encoding: "utf8" });
    assert.match(output, /Built \d+ pages/);
    const pages = readdirSync(fixture, { recursive: true }).filter(p => p.endsWith(".html"));
    assert.ok(pages.length > 300);
    for (const page of pages) {
      const html = readFileSync(join(fixture, page), "utf8");
      const count = (html.match(/src="\/assets\/js\/measurement.js"/g) || []).length;
      assert.equal(count, ["contact.html", "thanks.html", "404.html"].includes(page) ? 0 : 1, page);
    }
    writeFileSync(join(fixture, "content/measurement.json"), JSON.stringify({ ...settings, enabled: false }));
    execFileSync(process.execPath, [join(fixture, "scripts/build.mjs")], { env: { ...process.env, CONTEXT: "deploy-preview" } });
    for (const page of pages) assert.doesNotMatch(readFileSync(join(fixture, page), "utf8"), /src="\/assets\/js\/measurement.js"/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
