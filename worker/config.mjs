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
    //
    // §8.1's auth-shape question is resolved, not assumed: Higgsfield's
    // cloud.higgsfield.ai console issues an ID and a Secret as two separate
    // values from one "Create API Key" action, confirmed live 2026-08-08.
    // Combined here into the single "ID:SECRET" string Higgsfield's
    // documented "Authorization: Key {id}:{secret}" header expects --
    // image.mjs stays unaware this is two values, same as before.
    higgsfieldApiKey: `${required("HIGGSFIELD_CONTENT_API_KEY_ID")}:${required("HIGGSFIELD_CONTENT_API_KEY_SECRET")}`,
    // Read AND push credential — same reasoning as agent-runtime's
    // DOCTRINE_PUSH_TOKEN: required in every mode because GitHub's Contents
    // API needs auth to read the repo too, not only to write.
    githubToken: required("GITHUB_PUSH_TOKEN"),
    repo: process.env.GITHUB_REPO || "855calljake-dev/gold-water-fire",
    branch: process.env.GITHUB_BRANCH || "main",
    // GRADUATED 2026-08-12 (Jake's ruling). SOP-AGENTIC-SEO-WEBSITES.md §5.3:
    // two clean approved batches and the tenant graduates to autonomous daily
    // drafting AND publishing, no standing human gate. GWF cleared three
    // (PRs #1, #3, #4 merged), and §8.5's precondition -- an automated image
    // module -- is live and produced images in #4.
    //
    // Default true, not opt-in: this repo IS the graduated tenant, so a run
    // that forgets an env var must not silently fall back to a gate nobody is
    // watching any more. RUNTIME_AUTO_PUBLISH=false re-gates it (a batch that
    // needs eyes, a content-rule change under test) without a code change.
    autoPublish: (process.env.RUNTIME_AUTO_PUBLISH || "true").toLowerCase() !== "false",
    model: process.env.RUNTIME_MODEL || "claude-opus-5", // CONTENT-PIPELINE.md: drafting page copy = Opus 5
    maxPagesPerRun: Number(process.env.RUNTIME_MAX_PAGES || 3),
    maxBudgetUsd: Number(process.env.RUNTIME_MAX_BUDGET_USD || 5),
    // Claim verifier rollout mode, SOP-AGENTIC-SEO-WEBSITES.md §2.2 (deployed
    // 2026-08-27, HANDOFF-CLAIM-VERIFIER.md step 1). "shadow": run on every
    // page, log the verdict into the run output and the PR body, block
    // nothing. "enforce": a fail retries with the verifier's quotes as
    // feedback, then drops the page; a verifier error fails closed (page not
    // shipped). "off": escape hatch, skip entirely. Default shadow, NOT
    // enforce: §2.2's rollout rule — a new judgment gate does not hard-block
    // until two shadow batches have been human-spot-checked. Flip via env, no
    // code change.
    verifyMode: (process.env.RUNTIME_VERIFY_MODE || "shadow").toLowerCase(),
  };
}
