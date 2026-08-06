#!/usr/bin/env node
// ORIENT -> WORK -> RECORD, mirroring bytomorrow-platform's agent-runtime
// shape (src/runtime/run.ts) at Tier-1 scale. Dry by default; RUNTIME_MODE=live
// (or --live) is the only way to write anything, and even then the only
// write is a pull request — merging is Jake's, always.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { draftPage } from "./draft.mjs";
import { checkPage } from "./evidenceGate.mjs";
import { findOpenBatchPr, openContentBatchPr } from "./recorder.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  const cfg = loadConfig();
  const dateStr = todayStr();
  console.log(`[orient] mode=${cfg.mode} model=${cfg.model} date=${dateStr}`);

  if (cfg.isLive) {
    const existing = await findOpenBatchPr({ token: cfg.githubToken, repo: cfg.repo, dateStr });
    if (existing) {
      console.log(`[orient] Open batch PR already exists for today: ${existing.html_url}. Exiting without drafting again.`);
      process.exit(0);
    }
  }

  const backlog = await loadBacklog();
  const pending = backlog.items.filter((i) => i.status === "pending").slice(0, cfg.maxPagesPerRun);
  if (!pending.length) {
    console.log("[work] No pending backlog items. Nothing to do.");
    process.exit(0);
  }
  console.log(`[work] Drafting ${pending.length} page(s): ${pending.map((i) => i.slug).join(", ")}`);

  const drafted = [];
  const failed = [];
  let totalCostEstimate = 0;

  for (const item of pending) {
    try {
      const { page, usage } = await draftPage({ item, apiKey: cfg.anthropicApiKey, model: cfg.model });
      page.type = item.type;
      const check = checkPage(page);
      // Opus 5 approx $15/$75 per MTok in/out — rough budget guard, not billing-accurate.
      totalCostEstimate += ((usage.input_tokens || 0) * 15 + (usage.output_tokens || 0) * 75) / 1_000_000;

      if (!check.ok) {
        console.log(`[work] REJECTED ${item.slug}: ${check.problems.join(" | ")}`);
        failed.push({ slug: item.slug, problems: check.problems });
        continue;
      }
      console.log(`[work] OK ${item.slug} -> ${page.path}`);
      drafted.push({ item, page });
    } catch (err) {
      console.log(`[work] ERROR drafting ${item.slug}: ${err.message}`);
      failed.push({ slug: item.slug, problems: [err.message] });
    }

    if (totalCostEstimate > cfg.maxBudgetUsd) {
      console.log(`[work] Budget cap reached ($${totalCostEstimate.toFixed(2)} > $${cfg.maxBudgetUsd}), stopping this run.`);
      break;
    }
  }

  console.log(`[work] Estimated cost this run: $${totalCostEstimate.toFixed(2)}`);

  if (!drafted.length) {
    console.log("[record] Nothing passed the evidence gate — no PR opened.");
    process.exit(failed.length ? 1 : 0);
  }

  if (!cfg.isLive) {
    console.log(`[record] DRY RUN — would open a PR with ${drafted.length} page(s). No GitHub write performed.`);
    for (const d of drafted) console.log(`  - ${d.page.path}: ${d.page.title}`);
    process.exit(failed.length ? 1 : 0);
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
    backlogUpdate,
    summaryLines,
  });

  console.log(`[record] Opened PR #${result.prNumber}: ${result.prUrl}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
