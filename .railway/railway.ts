import { defineRailway, github, project, service } from "railway/iac";

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
      // Firing on schedule does NOT mean it publishes: RUNTIME_MODE defaults
      // to "dry" below, and only a human flips it to "live" deliberately.
      cronSchedule: "0 9 * * *",
      restartPolicyType: "NEVER",
    },
    variables: {
      RUNTIME_MODE: { value: "dry" },
      RUNTIME_MODEL: { value: "claude-opus-5" },
      RUNTIME_MAX_PAGES: { value: "3" },
      RUNTIME_MAX_BUDGET_USD: { value: "5" },
      GITHUB_REPO: { value: "855calljake-dev/gold-water-fire" },
      GITHUB_BRANCH: { value: "main" },
    },
  });

  return project("gold-water-fire", {
    resources: [gwfContentWorker],
  });
});
