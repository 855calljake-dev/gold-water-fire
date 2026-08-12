import { defineRailway, github, preserve, project, service } from "railway/iac";

// Gold Water Fire content-drafting worker. Spec: bytomorrow-bos
// doctrine/SOP-AGENTIC-SEO-WEBSITES.md. Deploys from this same repo
// (worker/) — the site itself stays on Netlify, only the drafting
// pipeline runs here. See worker/README.md for the full shape.
//
// Secrets (ANTHROPIC_API_KEY, GITHUB_PUSH_TOKEN) are deliberately NOT in
// this file — they're set directly in the Railway dashboard so they never
// pass through a chat transcript or land in this repo. See HARD RULE 1 in
// bytomorrow-bos/CLAUDE.md.
export default defineRailway(() => {
  const gwfContentWorker = service("gwf-content-worker", {
    source: github("855calljake-dev/gold-water-fire", {
      branch: "main",
    }),
    build: {
      builder: "NIXPACKS",
      // nixpacks auto-detects package.json's "build" script (the site's own
      // static-site generator) — irrelevant to this service, override it.
      buildCommand: "echo 'gwf-content-worker: no build step'",
    },
    deploy: {
      startCommand: "npm run worker",
      // UTC. 0 9 * * * = 2 AM Phoenix year-round (AZ doesn't observe DST) —
      // same reasoning as agent-runtime's cron in bytomorrow-platform.
      cronSchedule: "0 9 * * *",
      restartPolicyType: "NEVER",
    },
    // RUNTIME_MODE=live as of 2026-08-07 -- Jake's explicit direction ("new
    // pages daily") after batch 1 was reviewed and merged clean, matching
    // SOP-AGENTIC-SEO-WEBSITES.md §5's own stated cadence: first batch
    // manually triggered and reviewed, recurring schedule only after that.
    // Still never publishes anything by itself -- every run's only write is
    // a GitHub PR (recorder.mjs), merging is still Jake's, always. Live mode
    // is a decision about drafting cadence, not about the release gate.
    variables: {
      // DANGER, learned 2026-08-11: this variables block is DECLARATIVE and
      // Railway PRUNES anything not listed. `railway config plan` proposed
      // deleting eleven variables — every secret set by hand, including
      // ANTHROPIC_API_KEY, GITHUB_PUSH_TOKEN, both Higgsfield halves, the
      // Airtable PAT and the Resend key — simply because they were absent
      // here. Applying would have silently destroyed the whole service's
      // credentials. The header comment above says secrets live in the
      // dashboard and never in this file; that is still true, but it is only
      // SAFE because of the preserve() entries below.
      //
      // preserve() keeps the existing value without writing it to source.
      // ANY new secret added in the dashboard must get a preserve() line here
      // the same day, or the next `railway config apply` deletes it.
      ANTHROPIC_API_KEY: preserve(),
      GITHUB_PUSH_TOKEN: preserve(),
      HIGGSFIELD_CONTENT_API_KEY_ID: preserve(),
      HIGGSFIELD_CONTENT_API_KEY_SECRET: preserve(),
      AIRTABLE_OPS_PAT: preserve(),
      RESEND_API_KEY: preserve(),
      // Not secret, but set by hand and not worth hardcoding while the
      // sending domain is still being sorted out.
      EMAIL_FROM: preserve(),
      OPS_REPORT_TO: preserve(),
      // Stable infrastructure identifiers — declared, so this file is the
      // record of which Airtable base the telemetry goes to.
      AIRTABLE_OPS_BASE_ID: { value: "appAHLoykhxuB6twM" },
      AIRTABLE_OPS_RUNS_TABLE: { value: "tblqVPZrLK3mvLLRS" },
      AIRTABLE_OPS_ARTIFACTS_TABLE: { value: "tblIVErkGAIaPNud1" },
      RUNTIME_MODE: { value: "live" },
      RUNTIME_MODEL: { value: "claude-opus-5" },
      RUNTIME_MAX_PAGES: { value: "5" },
      RUNTIME_MAX_BUDGET_USD: { value: "5" },
      GITHUB_REPO: { value: "855calljake-dev/gold-water-fire" },
      GITHUB_BRANCH: { value: "main" },
    },
  });

  // The daily ops report (bytomorrow-bos doctrine/SOP-DAILY-OPS-REPORT.md).
  //
  // Platform-scoped code deployed from the bytomorrow-platform repo, but
  // hosted in THIS project on purpose: every credential it needs — the
  // Airtable ops PAT, the Resend key, the recipient — already lives on
  // gwf-content-worker, and Railway's `${{service.VAR}}` references work only
  // within a project. Putting it here means no secret is ever copied, pasted,
  // or duplicated to keep in sync. Cross-project references do not exist.
  //
  // Revisit when a second tenant starts emitting telemetry: at that point the
  // report is no longer "the GWF project's job" in any sense, and it should
  // move to bytomorrow-platform with its own credentials. Recorded so the next
  // session sees a deliberate trade rather than a misplaced service.
  const opsDailyReport = service("ops-daily-report", {
    source: github("855calljake-dev/bytomorrow-platform", { branch: "main" }),
    // Build and deploy settings live in the repo, not here — see the file
    // itself for why. A repo config file BEATS infrastructure-as-code, so the
    // first attempt at this service ignored the buildCommand set in this block
    // and inherited the web app's `npm run build` from the root railway.toml,
    // then died collecting page data for /dashboard. Pointing at a dedicated
    // config file is the only way to override a repo that already ships one.
    configFile: "railway.ops-report.toml",
    variables: {
      // References, not copies. The values stay wherever Jake set them.
      AIRTABLE_OPS_PAT: { value: "${{gwf-content-worker.AIRTABLE_OPS_PAT}}" },
      AIRTABLE_OPS_BASE_ID: { value: "${{gwf-content-worker.AIRTABLE_OPS_BASE_ID}}" },
      AIRTABLE_OPS_RUNS_TABLE: { value: "${{gwf-content-worker.AIRTABLE_OPS_RUNS_TABLE}}" },
      AIRTABLE_OPS_ARTIFACTS_TABLE: { value: "${{gwf-content-worker.AIRTABLE_OPS_ARTIFACTS_TABLE}}" },
      RESEND_API_KEY: { value: "${{gwf-content-worker.RESEND_API_KEY}}" },
      EMAIL_FROM: { value: "${{gwf-content-worker.EMAIL_FROM}}" },
      OPS_REPORT_TO: { value: "${{gwf-content-worker.OPS_REPORT_TO}}" },
      // Read-only GitHub access for the "waiting on you" and "published"
      // counts, which come from real PRs rather than from telemetry.
      GITHUB_PUSH_TOKEN: { value: "${{gwf-content-worker.GITHUB_PUSH_TOKEN}}" },
      // NOT set to live: the digest's own self-record passes skipDryGuard
      // explicitly (bytomorrow-platform 175c506), so it records when it truly
      // sends. Leaving this unset keeps every OTHER telemetry write on this
      // service safely inert.
    },
  });

  return project("gold-water-fire", {
    resources: [gwfContentWorker, opsDailyReport],
  });
});
