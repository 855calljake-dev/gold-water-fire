#!/usr/bin/env node
// ORIENT -> WORK -> RECORD, mirroring bytomorrow-platform's agent-runtime
// shape (src/runtime/run.ts) at Tier-1 scale. Dry by default; RUNTIME_MODE=live
// (or --live) is the only way to write anything.
//
// GRADUATED 2026-08-12: ~~the only write is a pull request — merging is Jake's,
// always~~. Per SOP-AGENTIC-SEO-WEBSITES.md §5.3, two clean approved batches
// graduate a tenant to autonomous drafting AND publishing; GWF cleared three,
// and Jake released the gate on 2026-08-12. A live run now opens the batch PR
// and merges it, which deploys. The PR is kept as the per-batch audit record
// and the revert handle. RUNTIME_AUTO_PUBLISH=false restores the old gate.
//
// WHAT A SINGLE FAILING PAGE COSTS, changed 2026-08-31 by Jake's ruling:
// "if there is a stop, only stop on the page that is flagged and publish the
// rest of the batch." Before this, one page refused by the structural gate
// withheld the whole batch AND de-graduated the tenant. On 2026-08-31 that
// cost eight good pages and GWF's graduation over one page missing its FAQs.
// A dropped page now leaves the batch alone: it stays `pending` in the backlog
// and the next run picks it up, which is already how an image failure behaves.
// De-graduation is kept, but it fires on a RATE. See DEGRADUATION_ constants.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { draftPage } from "./draft.mjs";
import { checkPage } from "./evidenceGate.mjs";
import { generateImage, IMAGE_COST_USD_ESTIMATE } from "./image.mjs";
import { deGraduate, findBatchPrForDate, mergeBatchPr, openContentBatchPr, readGraduationState } from "./recorder.mjs";
import { verifyClaims, VERIFIER_MODEL } from "./verify.mjs";
import { recordRun, recordArtifacts, buildMenuUrl } from "./telemetry.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

// ===========================================================================
// WHEN A BATCH DE-GRADUATES THE TENANT.
//
// The 2026-08-09 ruling that created de-graduation is kept, and so is the
// reason for it: a structural gate refusal can mean the drafting model has
// gone wrong in a way that will repeat, and a self-limiting failure is better
// than a compounding one. What changed on 2026-08-31 is the trigger. It used
// to be ANY single refusal, which cannot tell a formatting miss from a broken
// model, and treated both as the second.
//
// One page failing is a formatting miss. Most of a batch failing is a broken
// model. So both of these have to be true before the tenant drops:
//
//   at least DEGRADUATION_MIN_FAILURES pages refused, AND
//   they are at least DEGRADUATION_FAILURE_RATE of everything this run gated.
//
// The minimum is what protects a good batch from one bad page. Two separate
// pages tripping the same structural gate in one run is a pattern; one is not.
// Checked against the two runs that actually happened: 2026-08-31 refused 1 of
// 9 and would now publish the other 8 and stay graduated, and 2026-08-23's
// two false-positive refusals inside a five page batch come to 40 percent,
// under the rate, so that de-graduation would not have happened either.
//
// The rate is what still catches the case the ruling was written for. Half a
// batch refused is not a formatting miss.
const DEGRADUATION_MIN_FAILURES = 2;
const DEGRADUATION_FAILURE_RATE = 0.5;

// THE THIRD TRIGGER, and the one closest to the old behaviour: a run that
// gated pages, refused at least one of them structurally, and published
// nothing at all. That outcome is indistinguishable from the whole-batch stop
// this change removes, and it is exactly the case the 2026-08-09 ruling was
// written for, so it de-graduates regardless of the rate arithmetic.
//
// Deliberately requires a structural refusal. A batch emptied by a dead image
// provider or an exhausted wallet publishes nothing too, and that says the
// provider broke, not that the model wrote something it should not have.
// Demoting the tenant for an outage would be the same false positive in a new
// costume.
function shouldDeGraduate({ gateRejections, gatedCount, publishedCount }) {
  if (!gateRejections.length) return null;
  if (!publishedCount) {
    return `every page in this batch was dropped and nothing published; ${gateRejections.length} of ${gatedCount} were refused by the structural gate`;
  }
  const rate = gateRejections.length / Math.max(gatedCount, 1);
  if (gateRejections.length >= DEGRADUATION_MIN_FAILURES && rate >= DEGRADUATION_FAILURE_RATE) {
    return `${gateRejections.length} of ${gatedCount} pages (${Math.round(rate * 100)} percent) were refused by the structural gate, at or over the ${Math.round(DEGRADUATION_FAILURE_RATE * 100)} percent rate that reads as a broken drafter rather than a bad page`;
  }
  return null;
}

// SOP-AGENTIC-SEO-WEBSITES.md §8.3.1 closes with an explicit instruction:
// "Don't treat this as shipped for a given tenant until the binary is
// confirmed present on that tenant's actual worker service." Because the
// metadata step fails soft by design, a host without exiftool produces
// perfectly successful-looking runs that quietly ship untagged images. This
// probe is what makes that difference legible -- every run states in its
// first lines which of the two happened, so the answer to "is it actually
// installed on Railway" is a log line, not an assumption. Runs BEFORE
// loadConfig() deliberately: a missing env var must not hide this.
async function reportExiftool() {
  try {
    const { stdout } = await execFileAsync("exiftool", ["-ver"]);
    console.log(`[orient] exiftool ${stdout.trim()} present -- generated images will carry embedded SEO metadata (§8.3.1)`);
  } catch (err) {
    console.log(`[orient] exiftool NOT AVAILABLE (${err.message}) -- images will ship WITHOUT embedded SEO metadata (§8.3.1 fails soft, run continues)`);
  }
}

// The same probe for tesseract, and it matters more, because §8.3.2 fails HARD
// in the opposite direction to exiftool above. A host missing tesseract does
// not ship a slightly worse image, it ships nothing: every generated image is
// rejected unchecked, §8.5 then drops every page, and the run ends with an
// empty batch. From a distance that is indistinguishable from "the worker had
// nothing to do tonight", which is why this states the answer in the log
// rather than leaving it to be inferred from a quiet morning.
//
// The English trained data is checked SEPARATELY and by name, not assumed to
// arrive with the binary. `tesseract-ocr` installs and runs perfectly well
// without `tesseract-ocr-eng`, and then errors on every single image. JTHL hit
// exactly that on 2026-08-26, which is why both packages are named in
// nixpacks.toml and why both halves are reported here.
//
// Runs BEFORE loadConfig() on purpose: a missing env var must not hide it.
async function reportTesseract() {
  try {
    const { stdout } = await execFileAsync("tesseract", ["--version"]);
    const version = stdout.trim().split("\n")[0];
    const langs = await execFileAsync("tesseract", ["--list-langs"]).then((r) => r.stdout).catch(() => "");
    const hasEng = /^eng$/m.test(langs);
    if (hasEng) {
      console.log(`[orient] ${version} present, English data installed -- §8.3.2 image text gate ACTIVE`);
    } else {
      console.log(`[orient] ${version} present but English data MISSING -- §8.3.2 will reject EVERY image and no page will publish this run. Install tesseract-ocr-eng (nixpacks.toml aptPkgs).`);
    }
  } catch (err) {
    console.log(`[orient] tesseract NOT AVAILABLE (${err.message}). §8.3.2 does NOT fail soft: every generated image will be rejected unchecked and NO page will publish this run. Install tesseract-ocr + tesseract-ocr-eng (nixpacks.toml aptPkgs).`);
  }
}

function todayStr() {
  // Injected so a scheduled run and a manual run agree on "today," and so
  // this file has no bare Date.now()/new Date() call outside this one spot.
  return (process.env.RUNTIME_DATE_OVERRIDE || new Date().toISOString()).slice(0, 10);
}

async function loadBacklog() {
  const raw = await readFile(path.join(ROOT, "content", "backlog.json"), "utf8");
  return JSON.parse(raw);
}

async function main() {
  await reportTesseract();
  await reportExiftool();
  const cfg = loadConfig();
  const dateStr = todayStr();
  // Graduation is a state this worker READS, never one it assumes. A tenant
  // that de-graduated on a previous run stays gated until a human puts it
  // back, and the run says which of the two it is in its first lines.
  let autoPublish = cfg.autoPublish;
  let gradeNote = cfg.autoPublish ? "auto" : "GATED (RUNTIME_AUTO_PUBLISH=false)";
  if (cfg.isLive && autoPublish) {
    const grad = await readGraduationState({ token: cfg.githubToken, repo: cfg.repo, branch: cfg.branch });
    if (grad.state !== "graduated") {
      autoPublish = false;
      gradeNote = `GATED — de-graduated ${grad.since || "(date unrecorded)"}: ${grad.reason || "reason unrecorded"}`;
    }
  }
  console.log(`[orient] mode=${cfg.mode} model=${cfg.model} date=${dateStr} publish=${gradeNote}`);

  if (cfg.isLive) {
    const existing = await findBatchPrForDate({ token: cfg.githubToken, repo: cfg.repo, dateStr });
    if (existing) {
      console.log(`[orient] Today's batch already ran (${existing.batchState}): ${existing.html_url}. Exiting without drafting again.`);
      // Recorded even though it produced nothing: the run DID fire, and an
      // unrecorded early exit is indistinguishable from a dead cron in the
      // daily report (SOP-DAILY-OPS-REPORT.md §2).
      await recordRun({ date: dateStr, surface: "agentic-seo", status: "ran", attempted: 0, published: 0,
        failures: [], spendUsd: {}, note: `Today's batch already ran (${existing.batchState}): ${existing.html_url}` });
      process.exit(0);
    }
  }

  const backlog = await loadBacklog();
  const pending = backlog.items.filter((i) => i.status === "pending").slice(0, cfg.maxPagesPerRun);
  if (!pending.length) {
    console.log("[work] No pending backlog items. Nothing to do.");
    // Same reasoning as above -- and an empty backlog is itself worth seeing
    // in the report, since it means the machine has run out of work.
    await recordRun({ date: dateStr, surface: "agentic-seo", status: "ran", attempted: 0, published: 0,
      failures: [], spendUsd: {}, note: "Backlog empty -- no pending items" });
    process.exit(0);
  }
  console.log(`[work] Drafting ${pending.length} page(s): ${pending.map((i) => i.slug).join(", ")}`);

  const drafted = [];
  const failed = [];
  // Structural gate refusals only — the de-graduation trigger. Kept separate
  // from `failed`, which also collects provider and network failures.
  const gateRejections = [];
  // EVERY PAGE THIS RUN DROPPED, and why, in the shape the PR body renders.
  // Added 2026-08-31 with Jake's drop-the-page ruling. The batch no longer
  // stops on a refusal, so a short batch has to explain its own page count on
  // the PR that carries it. GWF has no run-record file (JTHL's
  // content/run-records.jsonl), so this PR body IS the whole audit trail for a
  // dropped page and it has to name every one.
  //
  // `kind` is set at the point of failure rather than inferred afterwards from
  // the reason string. A refusal, a dead image provider and an item the run
  // never reached leave identical evidence in the backlog (all three stay
  // `pending`), and telling them apart is the entire point of writing this
  // down.
  const drops = [];
  // Claim-verifier verdicts, one per drafted attempt that reached the
  // verifier (§2.2). Surfaced in the PR body so shadow-phase spot-checks read
  // straight off the batch PR, and deliberately NOT a de-graduation input —
  // see the comment at the call site.
  const verifierResults = [];
  // Tracked per provider, not as one number, because they are separately
  // funded accounts that run dry independently -- Anthropic bills a card,
  // Higgsfield's API draws a prepaid balance that is NOT the same wallet as
  // the higgsfield.ai app subscription (confirmed 2026-08-11: both the v1
  // and v2 API surfaces returned "not enough credits" while the app showed
  // thousands). A single blended figure hides which account needs attention.
  // The budget cap still applies to the sum.
  const spend = { anthropicUsd: 0, higgsfieldUsd: 0, imagesGenerated: 0 };
  const totalSpend = () => spend.anthropicUsd + spend.higgsfieldUsd;
  // Anthropic list prices, USD per MTok, keyed by the model this run actually
  // drafts with -- read from platform.claude.com/docs/en/about-claude/pricing
  // on 2026-08-27 (Sonnet 5's $2/$10 launch price is now the standing price).
  // Replaces a hardcoded $15/$75 that overstated every recorded figure 3x
  // against a $5/$25 model. Per bytomorrow-bos SOP-COST-TIERING: a model
  // change and its rate change land in the same commit, and an unknown model
  // falls back to the highest current rate so the budget cap trips early
  // rather than never.
  const ANTHROPIC_USD_PER_MTOK = {
    "claude-opus-5": { input: 5, output: 25 },
    "claude-sonnet-5": { input: 2, output: 10 },
  };
  const anthropicRate = ANTHROPIC_USD_PER_MTOK[cfg.model] || { input: 10, output: 50 };
  if (!ANTHROPIC_USD_PER_MTOK[cfg.model]) {
    console.log(`[work] WARNING: no price entry for model ${cfg.model}; recording at fallback $10/$50 per MTok`);
  }
  // One row per thing this run produced or failed to produce, for the daily
  // ops report (bytomorrow-bos SOP-DAILY-OPS-REPORT.md). Collected as we go
  // rather than reconstructed at the end, so a rejection keeps the actual
  // reason it was rejected instead of a summary of it.
  const artifactRows = [];
  const startedAt = Date.now();

  // Every remaining exit path goes through here, so there is exactly one
  // place that decides what this run reported -- and no path that exits
  // without reporting at all.
  const finish = async ({ status, published, note, exitCode }) => {
    await recordRun({
      date: dateStr, surface: "agentic-seo", status,
      attempted: pending.length, published,
      failures: failed.flatMap((f) => f.problems),
      // Per account, never blended: they are separately funded and run dry
      // independently.
      spendUsd: { Anthropic: spend.anthropicUsd, Higgsfield: spend.higgsfieldUsd },
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      note,
    });
    await recordArtifacts(artifactRows);
    process.exit(exitCode);
  };
  // Set when image.mjs reports a failure that will recur for every remaining
  // page (dead credential, no credits, wrong model). See the fail-fast note
  // in image.mjs: text is drafted before its image is attempted, so without
  // this the run pays for a full Opus draft per page and §8.5 throws every
  // one away.
  let abortReason = null;

  for (const item of pending) {
    let lastProblems = null;
    // Which of the several ways a page can fail actually happened. See `drops`.
    let lastKind = null;
    let shipped = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { page, usage } = await draftPage({
          item, apiKey: cfg.anthropicApiKey, model: cfg.model,
          retryFeedback: attempt > 1 ? lastProblems : undefined,
        });
        page.type = item.type;
        // Tier-1 checklist item 13 (BYTOMORROW-TECH-STACK.md): every page needs
        // datePublished/dateModified. The content-page template contract has
        // supported these fields since 4b46664, but nothing in this pipeline
        // ever set them -- every worker-drafted page was silently missing this
        // metadata. Set once here so it can never be forgotten per-page again.
        page.datePublished = dateStr;
        page.dateModified = dateStr;
        const check = checkPage(page);
        spend.anthropicUsd += ((usage.input_tokens || 0) * anthropicRate.input + (usage.output_tokens || 0) * anthropicRate.output) / 1_000_000;

        if (!check.ok) {
          console.log(`[work] REJECTED ${item.slug} (attempt ${attempt}): ${check.problems.join(" | ")}`);
          if (process.env.RUNTIME_DEBUG) {
            console.log(`[debug] faqs=${JSON.stringify(page.faqs)}`);
            console.log(`[debug] sections=${(page.sections || []).length}, stopReason logged separately`);
          }
          lastProblems = check.problems;
          lastKind = "evidence-gate";
          if (attempt === 2) {
            artifactRows.push({ date: dateStr, surface: "agentic-seo", type: "page", name: page.title || item.slug,
              status: "rejected", menuUrl: buildMenuUrl(page), reason: check.problems.join(" | ") });
            // A page the structural gate refused, twice. This is the exact
            // trigger BYTOMORROW-OPERATING-SYSTEM.md's 2026-08-09 ruling names
            // for de-graduation -- schema, claims, links, slug. Image and API
            // failures are NOT this: they say the provider broke, not that the
            // model wrote something it shouldn't have.
            gateRejections.push(`${item.slug}: ${check.problems.join(" | ")}`);
          }
          continue;
        }

        // Claim verifier — SOP-AGENTIC-SEO-WEBSITES.md §2.2, after the
        // structural gate, before any image spend. Fresh context: it sees the
        // confirmed-facts spec and the page text, never the drafting prompt.
        // Priced at the VERIFIER's model rates, not cfg.model: drafting runs
        // Sonnet during the trial while verification stays on Opus per
        // SOP-COST-TIERING §3 (verify at or above the drafting tier).
        //
        // DELIBERATE: verifier failures do NOT feed gateRejections, so they
        // never trigger self-de-graduation. The structural gate earned that
        // power; a new judgment gate does not get tenant-demotion authority
        // before shadow calibration proves its false-positive rate (§2.2's
        // rollout rule, written after the 2026-08-23 false-positive
        // de-graduation). Revisiting that is a bytomorrow-bos ruling.
        if (cfg.verifyMode !== "off") {
          const v = await verifyClaims({ page, apiKey: cfg.anthropicApiKey });
          const vRate = ANTHROPIC_USD_PER_MTOK[VERIFIER_MODEL] || { input: 10, output: 50 };
          spend.anthropicUsd += ((v.usage.input_tokens || 0) * vRate.input + (v.usage.output_tokens || 0) * vRate.output) / 1_000_000;
          const claimNote = v.claims.map((c) => `[cat ${c.category}] "${c.quote}" (${c.why})`).join(" ;; ");
          verifierResults.push({ slug: item.slug, mode: cfg.verifyMode, verdict: v.verdict, detail: v.reason || claimNote || "clean" });

          if (cfg.verifyMode === "enforce") {
            if (v.verdict === "error") {
              // Fail closed (§2.2): no verdict, no ship. Not a text-quality
              // problem, so no re-draft — the page stays pending for the next
              // run, same shape as an image failure.
              console.log(`[work] REJECTED ${item.slug}: claim verifier unavailable (${v.reason}) -- fail closed, page not shipped this run`);
              lastProblems = [`claim verifier unavailable: ${v.reason}`];
              lastKind = "claim-verifier-unavailable";
              artifactRows.push({ date: dateStr, surface: "agentic-seo", type: "page", name: page.title || item.slug,
                status: "failed", reason: `claim verifier unavailable: ${v.reason}` });
              break;
            }
            if (v.verdict === "fail") {
              console.log(`[work] REJECTED ${item.slug} (attempt ${attempt}): claim verifier -- ${claimNote}`);
              lastProblems = v.claims.map((c) => `remove or ground this ungrounded claim: "${c.quote}" -- ${c.why}`);
              lastKind = "claim-verifier";
              if (attempt === 2) {
                artifactRows.push({ date: dateStr, surface: "agentic-seo", type: "page", name: page.title || item.slug,
                  status: "rejected", menuUrl: buildMenuUrl(page), reason: `claim verifier: ${claimNote}` });
              }
              continue;
            }
            console.log(`[work] claim verifier PASS ${item.slug}`);
          } else {
            // Shadow: observe and record, never block. An error here is a
            // logged non-event by design — shadow exists to measure, and a
            // broken verifier must not stop a healthy batch.
            console.log(`[work] claim verifier (shadow) ${v.verdict.toUpperCase()} ${item.slug}${v.verdict === "fail" ? ` -- ${claimNote}` : ""}${v.verdict === "error" ? ` -- ${v.reason}` : ""}`);
          }
        }

        // SOP-AGENTIC-SEO-WEBSITES.md §8.5, strengthened 2026-08-08: an
        // approved image is a release requirement now. Text passing the
        // evidence gate is not enough to ship this run -- if image
        // generation fails, this item does not go in `drafted[]` at all
        // (stays "pending" in the backlog, tried again next run) rather
        // than shipping a page whose image someone could accidentally merge
        // without noticing is missing. Not retried against the text-attempt
        // loop -- an image failure is not a text quality problem, so
        // re-drafting the text would waste tokens for no reason.
        const image = await generateImage({ item, page, apiKey: cfg.higgsfieldApiKey });
        if (image?.accountFailure) {
          abortReason = image.reason;
          lastProblems = [`image generation unavailable: ${image.reason}`];
          lastKind = "image-account-failure";
          break;
        }
        if (!image) {
          console.log(`[work] REJECTED ${item.slug}: image generation failed -- page not shipped this run`);
          lastProblems = ["image generation failed"];
          lastKind = "image-failed";
          artifactRows.push({ date: dateStr, surface: "images", type: "image", name: item.slug,
            status: "failed", reason: "image generation failed" });
          break;
        }
        // Counted only once an image actually came back. The old code added
        // the estimate unconditionally, which billed the run for images that
        // were never generated -- harmless when it was one blended number,
        // actively misleading now that this reports a per-account figure and
        // an image count.
        spend.higgsfieldUsd += IMAGE_COST_USD_ESTIMATE;
        spend.imagesGenerated += 1;
        page.photo = { src: `/assets/img/${image.filename}`, alt: image.alt };

        console.log(`[work] OK ${item.slug} -> ${page.path}${attempt > 1 ? " (after retry)" : ""}`);
        // "awaiting-review", never "published": this worker's only write is a
        // PR, and the release gate is Jake's merge (SOP §2 rule 4). Counting a
        // draft as published is the exact overstatement house rule 3 forbids.
        artifactRows.push({ date: dateStr, surface: "agentic-seo", type: "page", name: page.title,
          status: "awaiting-review", menuUrl: buildMenuUrl(page) });
        artifactRows.push({ date: dateStr, surface: "images", type: "image", name: image.filename,
          status: "awaiting-review", menuUrl: buildMenuUrl(page), costUsd: IMAGE_COST_USD_ESTIMATE });
        drafted.push({ item, page, image });
        shipped = true;
        break;
      } catch (err) {
        console.log(`[work] ERROR drafting ${item.slug} (attempt ${attempt}): ${err.message}`);
        lastProblems = [err.message];
        lastKind = "draft-error";
      }
    }

    if (!shipped) {
      const problems = lastProblems || ["unknown failure"];
      failed.push({ slug: item.slug, problems });
      // Dropped, not fatal to the batch. Since 2026-08-31 the run carries on
      // to the next item and publishes whatever passed; this item stays
      // `pending` in content/backlog.json (it never reaches `drafted`, and the
      // backlog update below only advances drafted slugs) so the next run
      // picks it up again. That is the whole retry mechanism. Do not add a
      // second one.
      drops.push({ slug: item.slug, kind: lastKind || "unknown", reason: problems.join(" | ") });
    }

    if (abortReason) {
      const notReached = pending.slice(pending.indexOf(item) + 1);
      console.log(`[work] ABORTING RUN -- ${abortReason}`);
      console.log(`[work] This fails identically for every page, so ${notReached.length} remaining page(s) were not drafted. Nothing to fix in the backlog; fix the image provider.`);
      // A row each, rather than left out. "Was it refused, or was it never
      // reached?" is a question the backlog cannot answer on its own, and both
      // answers leave the slug `pending`.
      for (const skippedItem of notReached) {
        drops.push({ slug: skippedItem.slug, kind: "not-attempted", reason: `run stopped at ${item.slug}: ${abortReason}` });
      }
      break;
    }

    if (totalSpend() > cfg.maxBudgetUsd) {
      const notReached = pending.slice(pending.indexOf(item) + 1);
      console.log(`[work] Budget cap reached ($${totalSpend().toFixed(2)} > $${cfg.maxBudgetUsd}), stopping this run.`);
      for (const skippedItem of notReached) {
        drops.push({ slug: skippedItem.slug, kind: "not-attempted", reason: `budget cap reached at ${item.slug}: $${totalSpend().toFixed(2)} of $${cfg.maxBudgetUsd}` });
      }
      break;
    }
  }

  // Per account, so a dry Higgsfield balance or a runaway drafting bill is
  // attributable at a glance instead of buried in one blended number.
  console.log(`[work] Estimated spend this run: $${totalSpend().toFixed(2)} total`);
  console.log(`[work]   Anthropic (drafting):  $${spend.anthropicUsd.toFixed(2)}`);
  console.log(`[work]   Higgsfield (images):   $${spend.higgsfieldUsd.toFixed(2)} across ${spend.imagesGenerated} image(s) @ ~$${IMAGE_COST_USD_ESTIMATE}`);

  // Every page that dropped, named in the run log before anything is written.
  // The PR body carries the same list, but a run that publishes nothing opens
  // no PR, and then this is the only place it is said at all.
  if (drops.length) {
    console.log(`[record] ${drops.length} page(s) dropped from this batch, each stays pending for a later run:`);
    for (const d of drops) console.log(`[record]   ${d.slug} (${d.kind}): ${d.reason}`);
  }

  // DE-GRADUATION, decided BEFORE anything is written and BEFORE the empty
  // batch exit below, which it used to sit after. That ordering was a real
  // hole: a batch where every single page was refused reached the early exit
  // and returned without ever consulting the de-graduation rule, so the one
  // outcome most obviously meaning "the drafter is broken" was the one outcome
  // that could not demote the tenant. Found and fixed 2026-08-31.
  //
  // What it no longer does is withhold a batch over one bad page. Under the
  // 2026-08-09 rule, any single refusal set autoPublish false and the pages
  // that passed were held back with it. Jake's 2026-08-31 ruling reverses that
  // default: the flagged page stops, the batch publishes. De-graduation is now
  // the exception for when the run looks like a broken drafter rather than a
  // bad page, per shouldDeGraduate() at the top of this file.
  //
  // When it DOES fire, the batch is still withheld. That is deliberate and it
  // is the surviving half of the old ruling: at that rate the pages that got
  // past the same gate in the same run are exactly the ones nobody should
  // assume are fine, so they go into a PR a person opens rather than onto the
  // live site.
  const gatedCount = drafted.length + failed.length;
  let deGraduationReason = null;
  if (autoPublish) {
    const why = shouldDeGraduate({ gateRejections, gatedCount, publishedCount: drafted.length });
    if (why) {
      autoPublish = false;
      deGraduationReason = `Structural gate failures on an autonomous batch (${dateStr}): ${why}. Refusals: ${gateRejections.join(" ;; ")}`;
      console.log(`[record] DE-GRADUATING — ${why}.`);
      console.log("[record] Per BYTOMORROW-OPERATING-SYSTEM.md 2026-08-09 as amended 2026-08-31, GWF drops back to manual review and this batch will NOT be published.");
      if (cfg.isLive) {
        await deGraduate({ token: cfg.githubToken, repo: cfg.repo, branch: cfg.branch, dateStr, reason: deGraduationReason });
        console.log(`[record] Wrote content/graduation.json on ${cfg.branch}. Re-graduating is Jake's, not this worker's — update the BOS tenant register too.`);
      } else {
        console.log("[record] DRY RUN, so content/graduation.json was NOT written.");
      }
    } else if (gateRejections.length) {
      console.log(`[record] ${gateRejections.length} of ${gatedCount} page(s) refused by the structural gate, under the de-graduation rate. The tenant stays graduated and the rest of the batch publishes (Jake's ruling, 2026-08-31).`);
    }
  }

  if (!drafted.length) {
    console.log("[record] Nothing passed the evidence gate — no PR opened.");
    await finish({ status: "failed", published: 0, exitCode: failed.length ? 1 : 0,
      note: abortReason ? `Aborted: ${abortReason}` : "Nothing passed the evidence gate" });
  }

  if (!cfg.isLive) {
    console.log(`[record] DRY RUN — would open a PR with ${drafted.length} page(s), each with an image${autoPublish ? ", and merge it to publish" : " and leave it open for review"}. No GitHub write performed.`);
    for (const d of drafted) console.log(`  - ${d.page.path}: ${d.page.title} (image: ${d.image.filename})`);
    await finish({ status: failed.length ? "partial" : "ran", published: 0, exitCode: failed.length ? 1 : 0,
      note: `DRY RUN — ${drafted.length} page(s) would have been proposed` });
  }

  const backlogUpdate = {
    ...backlog,
    items: backlog.items.map((i) => {
      const match = drafted.find((d) => d.item.slug === i.slug);
      return match ? { ...i, status: "drafted" } : i;
    }),
  };
  // Colon, not an em dash. These lines are prose a reader sees in the PR body,
  // so Hard Rule 7 (bytomorrow-bos CLAUDE.md, standing and cross-tenant)
  // applies to them. Corrected 2026-08-31: this line had put an em dash in
  // every PR body this worker has ever opened, and no test looked until the
  // drop table added one that does.
  const summaryLines = drafted.map((d) => `- \`${d.page.path}\`: ${d.page.title}\n  Evidence: ${d.page.evidence}`);
  if (verifierResults.length) {
    // The shadow-phase audit trail: two clean spot-checked batches here are
    // the §2.2 bar for flipping RUNTIME_VERIFY_MODE to enforce.
    summaryLines.push(`\n**Claim verifier (${cfg.verifyMode})**, SOP-AGENTIC-SEO-WEBSITES.md §2.2, model ${VERIFIER_MODEL}:`);
    for (const r of verifierResults) {
      summaryLines.push(`- ${r.verdict.toUpperCase()} \`${r.slug}\`${r.detail && r.detail !== "clean" ? `: ${r.detail}` : ""}`);
    }
  }

  const result = await openContentBatchPr({
    token: cfg.githubToken,
    repo: cfg.repo,
    baseBranch: cfg.branch,
    dateStr,
    pages: drafted.map((d) => d.page),
    images: drafted.map((d) => d.image),
    backlogUpdate,
    summaryLines,
    autoPublish,
    // Added 2026-08-31. A batch that no longer stops on a refusal has to say
    // what it left behind, or the PR reads as a complete run that happened to
    // be short. This repo has no run-record file, so the body is the only
    // durable account of a dropped page there is.
    drops,
    deGraduationReason,
  });

  console.log(`[record] Opened PR #${result.prNumber}: ${result.prUrl}`);
  for (const row of artifactRows) {
    if (row.status === "awaiting-review") row.directUrl = result.prUrl;
  }

  if (!autoPublish) {
    // Still not "published" -- the pages are in a PR awaiting Jake's merge. The
    // daily report counts published separately, from what actually merged.
    const why = deGraduationReason
      ? `DE-GRADUATED this run: ${deGraduationReason}`
      : "RUNTIME_AUTO_PUBLISH=false";
    console.log(`[record] Left open for review (${why}): ${result.prUrl}`);
    await finish({ status: deGraduationReason ? "partial" : (failed.length ? "partial" : "ran"), published: 0,
      exitCode: failed.length ? 1 : 0,
      note: `PR #${result.prNumber} opened, awaiting review (${why}): ${result.prUrl}` });
  }

  // House rule 3 / hard rule 5: a page counts as published only after the
  // merge call returns success. A failed merge leaves the PR open -- which is
  // the old gated behaviour, a safe state to be left in -- and the run reports
  // "failed" rather than quietly claiming a batch went live.
  let merge;
  try {
    merge = await mergeBatchPr({
      token: cfg.githubToken, repo: cfg.repo, prNumber: result.prNumber,
      title: `Content batch ${dateStr}: ${drafted.length} page(s) published (#${result.prNumber})`,
    });
  } catch (err) {
    console.log(`[record] MERGE FAILED — ${err.message}`);
    console.log(`[record] The batch is drafted and safe in PR #${result.prNumber}; it is NOT live. Merge it by hand or fix the cause and it publishes on the next run.`);
    await finish({ status: "failed", published: 0, exitCode: 1,
      note: `PR #${result.prNumber} opened but merge FAILED (${err.message}) — batch drafted, NOT published: ${result.prUrl}` });
  }

  console.log(`[record] Published — merged PR #${result.prNumber} as ${merge.sha.slice(0, 7)}. Netlify builds from main; IndexNow pings on that build.`);
  for (const row of artifactRows) {
    if (row.status === "awaiting-review") row.status = "published";
  }
  await finish({ status: failed.length ? "partial" : "ran", published: drafted.length, exitCode: failed.length ? 1 : 0,
    note: `PR #${result.prNumber} merged (${merge.sha.slice(0, 7)}): ${drafted.length} page(s) published, ${drops.length} dropped and left pending: ${result.prUrl}` });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
