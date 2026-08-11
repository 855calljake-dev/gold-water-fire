# Gold Water Fire content-drafting worker

Scheduled worker that drafts new pages from `content/backlog.json` and opens a
GitHub pull request. **It never merges anything and never touches `main`
directly.** Spec: `bytomorrow-bos/doctrine/SOP-AGENTIC-SEO-WEBSITES.md`.

Deployed on Railway (project `gold-water-fire`, service `gwf-content-worker`).
**`.railway/railway.ts` is the authoritative deploy config** — infrastructure
as code, applied with `railway config apply`. It defines the source repo,
build/deploy settings, and non-secret env vars; secrets are set directly in
Railway's dashboard, never in this file (see its own header comment). This
superseded the dashboard-only "config as code path" pattern agent-runtime
uses (`bytomorrow-platform/railway.runtime.toml`) — Railway shipped a real
IaC SDK (`railway` on npm, IaC support) after that pattern was written;
`doctrine/BYTOMORROW-TECH-STACK.md`'s account-status notes should get a
follow-up correction for this.

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
| `image.mjs` | One Higgsfield REST call per page, per `bytomorrow-bos SOP-AGENTIC-SEO-WEBSITES.md` §8. Plain `fetch()`, no SDK — same style as `draft.mjs`. Then embeds IPTC/XMP/EXIF SEO metadata into the file (§8.3.1) via the `exiftool` CLI. |

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

**No page ships without an approved image.** SOP §8.5, strengthened
2026-08-08: an image isn't optional polish, it's a release requirement. If
`image.mjs` fails for a page, that page is dropped from this run entirely —
not shipped text-only, not partially merged — and stays `pending` in the
backlog for the next run to try again. Missing/wrong Higgsfield credentials
therefore blocks the *entire* batch, by design, same as a missing
`ANTHROPIC_API_KEY` would.

**Every generated image carries its own embedded SEO metadata.** SOP §8.3.1,
Jake's ruling 2026-08-09, cross-tenant: the image *file* is indexable content
independent of the page around it, so `image.mjs` writes IPTC/XMP/EXIF
(Title, Description, Creator, Copyright, Credit, Keywords, and city/state on
location pages) into every file before it ships — all of it derived from the
page being illustrated, never a boilerplate string. Unlike the image itself,
this step **fails soft**: an untagged image still ships rather than costing
the page its release. That makes a missing binary invisible by design, so
`run.mjs` logs `[orient] exiftool ... present` / `NOT AVAILABLE` on every run
— check that line before trusting that a run's images were actually tagged.

## Known state, 2026-08-11 (read this before debugging a quiet run)

**STILL BLOCKED, but the cause is now known and only one of three parts is
left — and it isn't code.** The first run with working Higgsfield credentials
(09:01 UTC) failed all five pages with `404 {"detail":"model_not_found"}`.
Troubleshot the same day against the live API with the real credential:

1. ~~`MODEL_ID = "nano_banana_pro"`~~ **FIXED.** `GET /models` returns this
   account's real catalog, and **no `nano_banana_pro` exists in it at any
   spelling**. Now `higgsfield-ai/soul/standard`.
2. ~~`resolution: "1k"`~~ **FIXED.** A closed set: `422 Input should be '720p'
   or '1080p'`. Even with the right slug, every request would still have
   failed validation. Now `1080p`.
3. **`403 {"detail":"not_enough_credits"}` — OPEN, and not fixable in this
   repo.** Every text2image model on the account returns it, including the
   ones the catalog prices at 0 credits. **The Higgsfield account is out of
   credits and someone has to top it up at cloud.higgsfield.ai.**

The corrected request is confirmed valid up to exactly that point: it now
returns 403 (credits) rather than 404 (no such model) or 422 (bad body).

Until credits exist, §8.5 still means no images → **no pages at all**. The run
spends the Opus money *before* it discovers the image is unavailable, so this
used to cost ~$2/night in discarded drafts; **`image.mjs` now fails fast** —
the first account-level image error (401/403/404) aborts the whole run instead
of drafting the remaining four pages, cutting that to roughly one draft. Rate
limiting (429) is deliberately excluded, being transient.

**Why the account is out of credits when the Higgsfield app shows thousands:**
the API on `cloud.higgsfield.ai`/`platform.higgsfield.ai` is billed separately
from the consumer subscription on `higgsfield.ai`. App-plan credits do not fund
API calls — they're two wallets. Topping up the app plan will not fix this; the
API side has to be funded on its own.

**CLOSED: the `exiftool` deploy gap.** `SOP-AGENTIC-SEO-WEBSITES.md` §8.3.1
flagged that the Railway image had no `exiftool`, so §8.3.1's metadata step
would fail soft on every real run. `nixpacks.toml` fixes it, and this is
confirmed on the service itself, not inferred from the config — the build log
shows `Setting up libimage-exiftool-perl (12.76+dfsg-1)`, and the 09:01 UTC run
opened with:

```
[orient] exiftool 12.76 present -- generated images will carry embedded SEO metadata (§8.3.1)
```

Note what that does **not** yet prove: because of the 404 above, no image has
ever been generated on Railway, so the metadata step has not run end to end in
production. It is verified against a real JPEG locally, and the binary it needs
is verified present on the service. Those are two separate facts.

## System dependency: `exiftool`

The metadata step above shells out to the `exiftool` CLI rather than adding an
npm dependency — a system binary, matching this worker's "plain script, no
SDK" ethos. It is **not** in the base Nixpacks Node image, so `nixpacks.toml`
at the repo root installs it (`libimage-exiftool-perl`) for the Railway build.
That file exists solely for this service; Netlify ignores it.

Locally: `brew install exiftool` (macOS), `apt-get install libimage-exiftool-perl` (Debian).

## Environment

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Freshly scoped for this service. Never a reused personal/dev key. |
| `GITHUB_PUSH_TOKEN` | yes | Fine-grained PAT scoped to **only** `855calljake-dev/gold-water-fire`, contents + pull-requests write. Same reasoning as `DOCTRINE_PUSH_TOKEN` in agent-runtime. |
| `HIGGSFIELD_CONTENT_API_KEY_ID` | yes | Required in every mode, not just live — SOP §8.5 makes an image a release requirement, so even a dry run needs to exercise real generation. Half of Higgsfield's ID/Secret pair — cloud.higgsfield.ai issues both from one "Create API Key" action. |
| `HIGGSFIELD_CONTENT_API_KEY_SECRET` | yes | The other half of the pair above. `config.mjs` combines both into the `id:secret` string Higgsfield's API expects — never store them pre-combined. |
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
