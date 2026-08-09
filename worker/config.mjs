// Env schema. Mirrors bytomorrow-platform's src/runtime/config.ts pattern:
// dry by default, live is the only way to write anything, values come from
// Railway env vars — never from this repo. See doctrine/KEY-INVENTORY.md.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadConfig() {
  const mode = (process.env.RUNTIME_MODE || "dry").toLowerCase();
  if (mode !== "dry" && mode !== "live") {
    throw new Error(`RUNTIME_MODE must be "dry" or "live", got "${mode}"`);
  }
  return {
    mode,
    isLive: mode === "live",
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    // SOP-AGENTIC-SEO-WEBSITES.md §8.5, strengthened 2026-08-08: an approved
    // image is a release requirement now, not optional -- required in every
    // mode (including dry) so dry runs actually exercise the full gate.
    higgsfieldApiKey: required("HIGGSFIELD_API_KEY"),
    // Read AND push credential — same reasoning as agent-runtime's
    // DOCTRINE_PUSH_TOKEN: required in every mode because GitHub's Contents
    // API needs auth to read the repo too, not only to write.
    githubToken: required("GITHUB_PUSH_TOKEN"),
    repo: process.env.GITHUB_REPO || "855calljake-dev/gold-water-fire",
    branch: process.env.GITHUB_BRANCH || "main",
    model: process.env.RUNTIME_MODEL || "claude-opus-5", // CONTENT-PIPELINE.md: drafting page copy = Opus 5
    maxPagesPerRun: Number(process.env.RUNTIME_MAX_PAGES || 3),
    maxBudgetUsd: Number(process.env.RUNTIME_MAX_BUDGET_USD || 5),
  };
}
