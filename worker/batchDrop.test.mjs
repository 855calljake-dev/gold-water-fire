// WHAT A SINGLE FAILING PAGE COSTS. Jake's ruling, 2026-08-31: "if there is a
// stop, only stop on the page that is flagged and publish the rest of the
// batch."
//
// Run: npm run test:batchdrop
//
// WHY THESE ARE END TO END. The behaviour being changed is not a function, it
// is what a whole run does with a mixed batch, so these execute worker/run.mjs
// as a child process against a stubbed fetch (worker/test-fixtures/fakeRun.mjs)
// and read the outcome out of the writes that stub captured. Nothing under
// worker/ is mocked: the structural evidence gate that refused the 2026-08-31
// page is the real one, and so are imagemagick, tesseract and exiftool.
//
// NO NETWORK and NO CREDENTIAL. The API keys in the env below are the string
// "fake", and the four AIRTABLE_OPS_ variables telemetry.mjs looks for are
// explicitly cleared, so a run here records nothing anywhere.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(WORKER);
const execFileAsync = promisify(execFile);

const BASE_ENV = {
  ...process.env,
  RUNTIME_DATE_OVERRIDE: "2026-08-31",
  RUNTIME_MODE: "live",
  // Well clear of anything these batches spend, so a budget stop can never be
  // the reason a page is missing and be mistaken for the behaviour under test.
  RUNTIME_MAX_BUDGET_USD: "50",
  ANTHROPIC_API_KEY: "fake",
  GITHUB_PUSH_TOKEN: "fake",
  HIGGSFIELD_CONTENT_API_KEY_ID: "fake",
  HIGGSFIELD_CONTENT_API_KEY_SECRET: "fake",
  FAKE_DUMP_WRITES: "1",
  AIRTABLE_OPS_PAT: "",
  AIRTABLE_OPS_BASE_ID: "",
  AIRTABLE_OPS_RUNS_TABLE: "",
  AIRTABLE_OPS_ARTIFACTS_TABLE: "",
};

async function runWorker(env) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", path.join(WORKER, "test-fixtures", "fakeRun.mjs"), path.join(WORKER, "run.mjs")],
      { cwd: ROOT, env: { ...BASE_ENV, ...env }, maxBuffer: 32 * 1024 * 1024 },
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    // A non-zero exit is a normal outcome here: run.mjs exits 1 whenever any
    // page failed to ship, which is every scenario in this file.
    return { stdout: err.stdout || "", stderr: err.stderr || "", code: err.code };
  }
}

function writesFrom(stdout) {
  const at = stdout.indexOf("__WRITES__");
  assert.notEqual(at, -1, `the stub never dumped its writes. stdout was:\n${stdout.slice(-4000)}`);
  return JSON.parse(stdout.slice(at + "__WRITES__".length).trim().split("\n")[0]);
}

const good = { page: "good", image: "clean", outputTokens: 10000 };
const noFaqs = { page: "nofaqs", image: "clean", outputTokens: 10000 };

// ---------------------------------------------------------------------------
// THE RULING ITSELF
// ---------------------------------------------------------------------------

test("one page fails the gate, the rest of the batch still publishes and the failed slug stays pending", async () => {
  // The 2026-08-31 run in miniature: one page short of its second FAQ, the
  // rest fine. Before this change that single refusal withheld all of them.
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([good, noFaqs, good, good]),
    RUNTIME_MAX_PAGES: "4",
  });
  const writes = writesFrom(stdout);

  const pages = writes.filter((w) => w.kind === "file" && w.path.startsWith("content/pages/"));
  assert.equal(pages.length, 3, `expected the 3 passing pages to be written. stdout:\n${stdout.slice(-4000)}`);
  assert.ok(writes.some((w) => w.kind === "pr"), "a PR carries the batch");
  assert.ok(writes.some((w) => w.kind === "merge"), "and it is merged, which is what publishes it");

  // The failed slug never reaches the batch, so the backlog advance leaves it
  // pending. That IS the retry: the next run picks it up again.
  const backlog = writes.find((w) => w.kind === "backlog");
  assert.ok(backlog, "the backlog advance rode along in the PR");
  // Asserted as a delta on this run's own slugs, not as a total. The real
  // content/backlog.json already carries a hundred-odd slugs marked drafted by
  // earlier batches, and a test that counted the whole file would be measuring
  // history rather than this run.
  const shippedSlugs = [...stdout.matchAll(/\[work\] OK ([a-z0-9-]+) ->/g)].map((m) => m[1]);
  assert.equal(shippedSlugs.length, 3, "three pages passed every gate");
  for (const slug of shippedSlugs) {
    assert.ok(backlog.drafted.includes(slug), `${slug} shipped, so the backlog advanced it`);
  }
  const refusedSlug = stdout.match(/REJECTED ([a-z0-9-]+) \(attempt 2\)/)?.[1];
  assert.ok(refusedSlug, "the run named the page it refused");
  assert.ok(backlog.pending.includes(refusedSlug), `${refusedSlug} stays pending for a later run`);
  assert.ok(!backlog.drafted.includes(refusedSlug), "and it was not advanced past pending");

  assert.ok(!writes.some((w) => w.kind === "graduation"), "and the tenant is NOT de-graduated over one page");
});

test("the dropped page and its reason are on the PR body", async () => {
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([good, noFaqs, good, good]),
    RUNTIME_MAX_PAGES: "4",
  });
  const pr = writesFrom(stdout).find((w) => w.kind === "pr");
  assert.ok(pr, "a PR was opened");

  assert.ok(pr.body.includes("### Pages this run dropped"), "the body has a section for what it left behind");
  assert.ok(pr.body.includes("dropped, structural evidence gate"), "classified, not just listed");
  assert.ok(
    pr.body.includes("Fewer than 2 FAQs"),
    `the actual gate reason is quoted, not summarised. body:\n${pr.body}`,
  );
  const refusedSlug = stdout.match(/REJECTED ([a-z0-9-]+) \(attempt 2\)/)?.[1];
  assert.ok(pr.body.includes(refusedSlug), "and the slug is named");
  assert.ok(pr.body.includes("stays `pending`"), "the body says what happens to it next");

  // Hard Rule 7 (bytomorrow-bos CLAUDE.md) applies to a PR body a person reads.
  assert.ok(!pr.body.includes("—"), "no em dash reaches the rendered PR body");
});

// ---------------------------------------------------------------------------
// DE-GRADUATION IS KEPT, ON A RATE
// ---------------------------------------------------------------------------

test("failures under the rate do not de-graduate, even when there is more than one", async () => {
  // Two refusals in a batch of six is 33 percent. This is the shape of the
  // 2026-08-23 de-graduation, which turned out to be two false positives and
  // cost the tenant its graduation for four days.
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([good, noFaqs, good, noFaqs, good, good]),
    RUNTIME_MAX_PAGES: "6",
  });
  const writes = writesFrom(stdout);

  assert.equal(writes.filter((w) => w.kind === "file" && w.path.startsWith("content/pages/")).length, 4);
  assert.ok(writes.some((w) => w.kind === "merge"), "the four good pages published");
  assert.ok(!writes.some((w) => w.kind === "graduation"), "and graduation.json was not touched");
  assert.ok(stdout.includes("under the de-graduation rate"), "the run says so out loud");
});

test("enough failures to cross the rate does de-graduate, and the batch is withheld", async () => {
  // Three of five refused is 60 percent, over the 50 percent rate and over the
  // two failure minimum. At that rate the two that passed are not trustworthy
  // either just because they got past the same gate in the same run, so the
  // batch goes into an open PR instead of onto the live site.
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([noFaqs, good, noFaqs, noFaqs, good]),
    RUNTIME_MAX_PAGES: "5",
  });
  const writes = writesFrom(stdout);

  const grad = writes.find((w) => w.kind === "graduation");
  assert.ok(grad, `the tenant de-graduated. stdout:\n${stdout.slice(-4000)}`);
  const state = JSON.parse(grad.content);
  assert.equal(state.state, "manual-review");
  assert.ok(state.reason.includes("3 of 5"), `the reason carries the arithmetic: ${state.reason}`);
  assert.ok(state.since === "2026-08-31");

  assert.ok(writes.some((w) => w.kind === "pr"), "the batch is still opened as a PR, which is the audit record");
  assert.ok(!writes.some((w) => w.kind === "merge"), "but it is NOT merged, so nothing went live");

  const pr = writes.find((w) => w.kind === "pr");
  assert.ok(pr.body.includes("DE-GRADUATED ON THIS RUN"), "and the PR says so at the top");
  assert.ok(!pr.body.includes("—"), "no em dash reaches the rendered PR body");
});

test("a batch where every page fails publishes nothing and de-graduates", async () => {
  // The case the 2026-08-09 ruling was actually written for, and the one this
  // worker could not act on until today: the de-graduation check used to sit
  // AFTER the empty batch exit, so a total wipeout returned without ever
  // consulting it.
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([noFaqs, noFaqs, noFaqs]),
    RUNTIME_MAX_PAGES: "3",
  });
  const writes = writesFrom(stdout);

  assert.ok(!writes.some((w) => w.kind === "pr"), "no PR, because nothing passed");
  assert.ok(!writes.some((w) => w.kind === "merge"), "and nothing published");
  const grad = writes.find((w) => w.kind === "graduation");
  assert.ok(grad, `a total wipeout de-graduates. stdout:\n${stdout.slice(-4000)}`);
  const state = JSON.parse(grad.content);
  assert.equal(state.state, "manual-review");
  assert.ok(
    state.reason.includes("nothing published"),
    `the reason names the zero publish trigger, not the rate: ${state.reason}`,
  );

  // Every dropped page is still named somewhere, and with no PR the run log is
  // the only place left.
  assert.ok(stdout.includes("3 page(s) dropped from this batch"));
  assert.ok(stdout.includes("Fewer than 2 FAQs"));
});

test("a batch emptied by the image provider does NOT de-graduate", async () => {
  // A dead credential empties a batch too. That says the provider broke, not
  // that the model wrote something it should not have, and demoting the tenant
  // for an outage would be the same false positive in a new costume.
  const { stdout } = await runWorker({
    FAKE_PLAN: JSON.stringify([
      { page: "good", image: "accountfail", outputTokens: 10000 },
      good,
      good,
    ]),
    RUNTIME_MAX_PAGES: "3",
  });
  const writes = writesFrom(stdout);

  assert.ok(!writes.some((w) => w.kind === "pr"), "nothing shipped, so no PR");
  assert.ok(!writes.some((w) => w.kind === "graduation"), "and the tenant keeps its graduation");
  assert.ok(stdout.includes("ABORTING RUN"), "the run stopped rather than paying to draft pages it would discard");
  assert.ok(stdout.includes("not-attempted"), "the pages it never reached are recorded as never reached");
});
