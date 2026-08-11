#!/usr/bin/env node
// ORIENT -> WORK -> RECORD, mirroring bytomorrow-platform's agent-runtime
// shape (src/runtime/run.ts) at Tier-1 scale. Dry by default; RUNTIME_MODE=live
// (or --live) is the only way to write anything, and even then the only
// write is a pull request — merging is Jake's, always.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { draftPage } from "./draft.mjs";
import { checkPage } from "./evidenceGate.mjs";
import { generateImage, IMAGE_COST_USD_ESTIMATE } from "./image.mjs";
import { findOpenBatchPr, openContentBatchPr } from "./recorder.mjs";
import { recordRun, recordArtifacts, buildMenuUrl } from "./telemetry.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

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
  await reportExiftool();
  const cfg = loadConfig();
  const dateStr = todayStr();
  console.log(`[orient] mode=${cfg.mode} model=${cfg.model} date=${dateStr}`);

  if (cfg.isLive) {
    const existing = await findOpenBatchPr({ token: cfg.githubToken, repo: cfg.repo, dateStr });
    if (existing) {
      console.log(`[orient] Open batch PR already exists for today: ${existing.html_url}. Exiting without drafting again.`);
      // Recorded even though it produced nothing: the run DID fire, and an
      // unrecorded early exit is indistinguishable from a dead cron in the
      // daily report (SOP-DAILY-OPS-REPORT.md §2).
      await recordRun({ date: dateStr, surface: "agentic-seo", status: "ran", attempted: 0, published: 0,
        failures: [], spendUsd: {}, note: `Open batch PR already exists: ${existing.html_url}` });
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
  // Tracked per provider, not as one number, because they are separately
  // funded accounts that run dry independently -- Anthropic bills a card,
  // Higgsfield's API draws a prepaid balance that is NOT the same wallet as
  // the higgsfield.ai app subscription (confirmed 2026-08-11: both the v1
  // and v2 API surfaces returned "not enough credits" while the app showed
  // thousands). A single blended figure hides which account needs attention.
  // The budget cap still applies to the sum.
  const spend = { anthropicUsd: 0, higgsfieldUsd: 0, imagesGenerated: 0 };
  const totalSpend = () => spend.anthropicUsd + spend.higgsfieldUsd;
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
        // Opus 5 approx $15/$75 per MTok in/out — rough budget guard, not billing-accurate.
        spend.anthropicUsd += ((usage.input_tokens || 0) * 15 + (usage.output_tokens || 0) * 75) / 1_000_000;

        if (!check.ok) {
          console.log(`[work] REJECTED ${item.slug} (attempt ${attempt}): ${check.problems.join(" | ")}`);
          if (process.env.RUNTIME_DEBUG) {
            console.log(`[debug] faqs=${JSON.stringify(page.faqs)}`);
            console.log(`[debug] sections=${(page.sections || []).length}, stopReason logged separately`);
          }
          lastProblems = check.problems;
          if (attempt === 2) {
            artifactRows.push({ date: dateStr, surface: "agentic-seo", type: "page", name: page.title || item.slug,
              status: "rejected", menuUrl: buildMenuUrl(page), reason: check.problems.join(" | ") });
          }
          continue;
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
          break;
        }
        if (!image) {
          console.log(`[work] REJECTED ${item.slug}: image generation failed -- page not shipped this run`);
          lastProblems = ["image generation failed"];
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
      }
    }

    if (!shipped) {
      failed.push({ slug: item.slug, problems: lastProblems || ["unknown failure"] });
    }

    if (abortReason) {
      const skipped = pending.length - (pending.indexOf(item) + 1);
      console.log(`[work] ABORTING RUN -- ${abortReason}`);
      console.log(`[work] This fails identically for every page, so ${skipped} remaining page(s) were not drafted. Nothing to fix in the backlog; fix the image provider.`);
      break;
    }

    if (totalSpend() > cfg.maxBudgetUsd) {
      console.log(`[work] Budget cap reached ($${totalSpend().toFixed(2)} > $${cfg.maxBudgetUsd}), stopping this run.`);
      break;
    }
  }

  // Per account, so a dry Higgsfield balance or a runaway drafting bill is
  // attributable at a glance instead of buried in one blended number.
  console.log(`[work] Estimated spend this run: $${totalSpend().toFixed(2)} total`);
  console.log(`[work]   Anthropic (drafting):  $${spend.anthropicUsd.toFixed(2)}`);
  console.log(`[work]   Higgsfield (images):   $${spend.higgsfieldUsd.toFixed(2)} across ${spend.imagesGenerated} image(s) @ ~$${IMAGE_COST_USD_ESTIMATE}`);

  if (!drafted.length) {
    console.log("[record] Nothing passed the evidence gate — no PR opened.");
    await finish({ status: "failed", published: 0, exitCode: failed.length ? 1 : 0,
      note: abortReason ? `Aborted: ${abortReason}` : "Nothing passed the evidence gate" });
  }

  if (!cfg.isLive) {
    console.log(`[record] DRY RUN — would open a PR with ${drafted.length} page(s), each with an image. No GitHub write performed.`);
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
  const summaryLines = drafted.map((d) => `- \`${d.page.path}\` — ${d.page.title}\n  Evidence: ${d.page.evidence}`);

  const result = await openContentBatchPr({
    token: cfg.githubToken,
    repo: cfg.repo,
    baseBranch: cfg.branch,
    dateStr,
    pages: drafted.map((d) => d.page),
    images: drafted.map((d) => d.image),
    backlogUpdate,
    summaryLines,
  });

  console.log(`[record] Opened PR #${result.prNumber}: ${result.prUrl}`);
  // Still not "published" -- the pages are in a PR awaiting Jake's merge. The
  // daily report counts published separately, from what actually merged.
  for (const row of artifactRows) {
    if (row.status === "awaiting-review") row.directUrl = result.prUrl;
  }
  await finish({ status: failed.length ? "partial" : "ran", published: 0, exitCode: failed.length ? 1 : 0,
    note: `PR #${result.prNumber} opened, awaiting review: ${result.prUrl}` });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
