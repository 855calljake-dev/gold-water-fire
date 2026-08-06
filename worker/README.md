# Gold Water Fire content-drafting worker

Scheduled worker that drafts new pages from `content/backlog.json` and opens a
GitHub pull request. **It never merges anything and never touches `main`
directly.** Spec: `bytomorrow-bos/doctrine/SOP-AGENTIC-SEO-WEBSITES.md`.

## Run it

```bash
ANTHROPIC_API_KEY=... GITHUB_PUSH_TOKEN=... node worker/run.mjs
```

Defaults to `RUNTIME_MODE=dry` — drafts and evidence-checks pages, prints what
it would do, makes **zero** GitHub writes. `RUNTIME_MODE=live` is the only way
to open a PR, and even in live mode the only write is that PR.

## Shape

| File | Does |
|---|---|
| `run.mjs` | Entry point. ORIENT (backlog + existing-PR-today check) → WORK (draft + evidence-check) → RECORD (PR, live only). |
| `config.mjs` | Env schema, mode, model, budget cap. |
| `facts.mjs` | The only facts the model may state, and the forbidden-claim patterns checked in code after generation. |
| `draft.mjs` | One Anthropic API call per backlog item, forced tool-call for structured output. Model: Opus 5, per `CONTENT-PIPELINE.md`'s drafting-model routing. |
| `evidenceGate.mjs` | Structural check — not left to prompt compliance. Rejects unconfirmed claims and any HTML beyond a plain `<a>` link. |
| `recorder.mjs` | The only code that writes to GitHub. Uses the Contents API directly (branch, file writes, PR) — no local clone needed for a few JSON files. |

## Three things that are load-bearing (same shape as agent-runtime, sized down)

**Dry-run is structural.** In dry mode, `recorder.mjs` is never called — not
merely skipped by an if-branch deep in the logic, but structurally unreachable
from `run.mjs`'s dry path. Nothing can accidentally write.

**The evidence gate runs in code, after generation.** The system prompt tells
the model the rules, but `checkPage()` in `evidenceGate.mjs` re-verifies every
draft with regex/structural checks before it's allowed into a PR. A page that
fails is reported and dropped, never shipped anyway.

**One PR per day.** `findOpenBatchPr` checks for an existing open batch PR
before drafting again. There's no database backing this (Tier-1 sites don't
get one), so it's a GitHub API check, not a claimed row — good enough for a
service that isn't running concurrent schedules against itself, not a full
double-fire guard. Revisit if this worker ever runs on tighter-than-daily
cadence.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Freshly scoped for this service. Never a reused personal/dev key. |
| `GITHUB_PUSH_TOKEN` | yes | Fine-grained PAT scoped to **only** `855calljake-dev/gold-water-fire`, contents + pull-requests write. Same reasoning as `DOCTRINE_PUSH_TOKEN` in agent-runtime. |
| `RUNTIME_MODE` | no | `dry` (default) or `live`. |
| `RUNTIME_MODEL` | no | Defaults to `claude-opus-5`. |
| `RUNTIME_MAX_PAGES` | no | Default 3 — pages drafted per run. |
| `RUNTIME_MAX_BUDGET_USD` | no | Default 5 — rough cost guard, not billing-accurate, stops mid-run if exceeded. |
| `GITHUB_REPO` | no | Defaults to `855calljake-dev/gold-water-fire`. |
| `GITHUB_BRANCH` | no | Defaults to `main`. |

Values go in Railway. Never in this repo.

## Cadence (SOP §5)

The Railway cron fires daily, but **fires in dry mode by default** — the
schedule existing is not the same as it publishing anything. `RUNTIME_MODE`
only becomes `live` when a human sets it deliberately, after reviewing a batch
clean. First batch: educational pages, manually triggered, reviewed by Jake.
Location pages and a truly unattended schedule are a later, separate decision.
