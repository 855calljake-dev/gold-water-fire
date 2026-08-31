# Gold Water Fire content-drafting worker

Scheduled worker that drafts new pages from `content/backlog.json`, opens a
GitHub pull request, and — since **2026-08-12** — merges it, which publishes.
Spec: `bytomorrow-bos/doctrine/SOP-AGENTIC-SEO-WEBSITES.md`.

~~**It never merges anything and never touches `main` directly.**~~ **GWF
graduated 2026-08-12** (Jake's ruling). SOP §5.3: two clean approved batches
and a tenant moves to autonomous daily drafting *and* publishing, with no
standing human gate — this tenant only, never inherited by another. GWF cleared
three (PRs #1, #3, #4), and §8.5's precondition, an automated image module
(`image.mjs`), is live and shipped the images in #4.

**The PR still gets opened.** It is the per-batch audit record and the revert
handle — one squashed commit per batch, so `git revert -m 1 <sha>` takes a bad
batch back off the live site in one step. What changed is that nothing waits in
it. Set `RUNTIME_AUTO_PUBLISH=false` to re-gate a single run (a content-rule
change under test, a batch you want to eyeball) without a code change.

**What still stops a page:** the evidence gate (below) rejects it before the PR
exists, and a page whose image fails to generate is not shipped at all. What no
longer stops one is a human reading it. That is the deliberate trade — the gate
is now structural only.

**A stopped page stops alone.** Jake's ruling, 2026-08-31: "if there is a stop,
only stop on the page that is flagged and publish the rest of the batch." A
page refused by the evidence gate after its two attempts is dropped from the
batch; the run carries on and publishes what passed. The dropped slug never
reaches the batch, so the backlog advance leaves it `pending` and the next run
drafts it again. That is the entire retry mechanism, and it is the same one an
image failure has always used. Every dropped page is named on the PR body, in
its own table, with the reason verbatim. This repo has no run-record file, so
that table is the only durable account of a dropped page there is.

Before this, one refusal withheld the whole batch. On 2026-08-31 that cost
eight good pages and the tenant's graduation over one page missing its second
FAQ.

**De-graduation is kept, and now fires on a rate.** The 2026-08-09 ruling
exists because a gate refusal can mean the drafting model has gone wrong in a
way that will repeat, and a self-limiting failure beats a compounding one. What
changed is the trigger, because "any single refusal" cannot tell a formatting
miss from a broken drafter. `run.mjs` carries two named constants,
`DEGRADUATION_MIN_FAILURES` (2) and `DEGRADUATION_FAILURE_RATE` (0.5), and both
have to be met: at least two pages refused, and at least half of everything the
run gated. A third trigger stands on its own, a run that refused at least one
page structurally and published nothing at all, because that outcome is
indistinguishable from the whole-batch stop this replaced. It deliberately
requires a structural refusal, so a dead image provider emptying a batch does
not demote the tenant for an outage.

When de-graduation does fire, the batch is still withheld into an open PR
rather than published. At that rate the pages that got past the same gate in
the same run are not trustworthy either.

`npm run test:batchdrop` runs all of this end to end against a stubbed fetch.

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
| `image.mjs` | One Higgsfield REST call per page, per `bytomorrow-bos SOP-AGENTIC-SEO-WEBSITES.md` §8. Plain `fetch()`, no SDK, same style as `draft.mjs`. Then compress (§8.3), text-gate (§8.3.2), embed IPTC/XMP/EXIF SEO metadata (§8.3.1) via the `exiftool` CLI, in that order. |
| `imageTextGate.mjs` | §8.3.2. OCRs the compressed image and refuses it if the model drew words. The one step in the image path that does **not** fail soft. Allowlists this tenant's own `GOLD` / `WATER` / `FIRE` wordmark. |
| `imageTextGate.test.mjs` | `npm run test:imagegate`. Runs the gate over real production images, including the two pulled off the live site for carrying garbled text, and one it provably does not catch. |

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

**WORKING as of 2026-08-11.** A real image generates and ships with its
metadata embedded. Getting there took four separate fixes, all found by
running against the live API rather than reasoning about it — the history is
kept because each one was invisible until the one before it was fixed:

1. ~~`MODEL_ID = "nano_banana_pro"`~~ **FIXED.** `GET /models` returns this
   account's real catalog, and **no `nano_banana_pro` exists in it at any
   spelling**. Now `higgsfield-ai/soul/standard`.
2. ~~`resolution: "1k"`~~ **FIXED.** A closed set: `422 Input should be '720p'
   or '1080p'`. Even with the right slug, every request would still have
   failed validation. Now `1080p`.
3. ~~`403 {"detail":"not_enough_credits"}`~~ **RESOLVED — Jake funded the API
   balance.** Worth keeping straight: the API on `cloud.higgsfield.ai` /
   `platform.higgsfield.ai` is a **separate wallet** from the consumer
   subscription on `higgsfield.ai`, under the same login. App-plan credits do
   not fund API calls — confirmed by both the v1 and v2 API surfaces returning
   "not enough credits" while the app showed thousands. If images start
   failing with 403 again, top up the API side, not the app plan.
4. ~~`buildFilename()` hardcoded `.jpg`~~ **FIXED, and this one was the
   nastiest.** Higgsfield returns **PNG**. exiftool picks its parser from the
   file extension and hard-refuses a mismatch, so §8.3.1's fail-soft swallowed
   it and shipped the image untagged while logging *"exiftool may not be
   installed on this host"* — a present binary blamed for a naming bug. Only a
   real generated file could surface it. Filenames now follow the magic bytes.

First real image: 87s end to end, PNG, all 14 metadata fields verified reading
back off the file.

**Cost control:** the run spends Opus money *before* it attempts the image, so
a dead provider used to cost ~$2/night in discarded drafts. `image.mjs` now
fails fast — the first account-level error (401/403/404) aborts the run rather
than drafting the remaining four pages. 429 is excluded, being transient.

**Page weight — FIXED (§8.3), same day.** Generated PNGs arrive ~1.9MB at
2048×1152 against the site's own ~270KB JPEGs — ~7× heavier, a real Core Web
Vitals cost on a site built for search. `optimizeForWeb()` now converts through
ImageMagick before tagging: max 1600px, q82 progressive JPEG. Measured on real
output: **1,899,757 → 90,777 bytes, 95% smaller**, metadata intact, quality
holds. Checked first that it couldn't be avoided — Higgsfield's CDN ignores
every transform parameter and the catalog exposes no output-format option.

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

## System dependencies: `exiftool`, ImageMagick, `tesseract`

All three are CLIs shelled out to rather than npm dependencies, matching this
worker's "plain script, no SDK" ethos. None is in the base Nixpacks Node image,
so `nixpacks.toml` at the repo root installs all of them for the Railway build.
That file exists solely for this service; Netlify ignores it.

Locally: `brew install exiftool imagemagick tesseract` (macOS);
`apt-get install libimage-exiftool-perl imagemagick tesseract-ocr tesseract-ocr-eng` (Debian).

**They do not fail the same way, and that is the important part.**

| Binary | Missing means | Direction |
|---|---|---|
| `exiftool` | images ship untagged | fails soft |
| ImageMagick | images ship heavy | fails soft |
| `tesseract` | **no image ships, so no page ships** | **fails hard** |

The §8.3.2 text gate is deliberately the opposite of the two steps either side
of it. A missing weight check costs page speed and a missing metadata pass
costs some SEO; a missing text check ships gibberish onto a live page. So an
image that could not be checked is treated as an image that failed, and §8.5
then drops the page.

**Name `tesseract-ocr-eng` explicitly, and do not "simplify" `nixpacks.toml`
back to one package.** `tesseract-ocr` installs, reports a version and runs
perfectly well without the English trained data, and then errors on every
single image. Under a hard-fail gate that is a silent total stop, and it looks
exactly like a quiet night. `jaketaylor-home-loans` hit precisely that on
2026-08-26.

That is also why `run.mjs` probes for both halves in its first log line:

```
[orient] tesseract 5.5.3 present, English data installed -- §8.3.2 image text gate ACTIVE
```

and, when it is not there:

```
[orient] tesseract NOT AVAILABLE (...). §8.3.2 does NOT fail soft: every generated
         image will be rejected unchecked and NO page will publish this run.
```

**Deploy status: NOT yet confirmed on Railway.** The packages are in
`nixpacks.toml` as of 2026-08-26, and the next deploy's build log plus that
first `[orient]` line are what turns this into a fact. Same standard §8.3.1
set for `exiftool`, and the same reason: a config file saying a binary is
installed is not the binary being installed.

## What the text gate cannot do

`npm run test:imagegate` going green does **not** mean no garbled image can
reach the site, and the test says so out loud rather than leaving it implied.

Of the five defective images found on this tenant by the 2026-08-26 visual
audit of all 111, OCR ranked **one**. The washing-machine image is in the test
corpus as a permanent known false negative: tesseract reads zero tokens in it
at any confidence, so no threshold anywhere would have caught it, and only a
human eye did. It is asserted to PASS. If a future change starts catching it,
the test fails and tells you that you improved something.

**Pixel checking is not visual review.** The gate is a backstop against one
specific failure, a model that draws lettering legible enough to read. The
cheaper half of the fix is upstream in `buildPrompt()`: GWF asks for
photorealistic scenes and has a defect rate of 1 in 111 by OCR, while JTHL
asked for conceptual diagram-style illustrations and shipped 4 bad images in
10. A diagram's job is to explain, so the model reaches for labels and
headings. A photograph of two technicians in a fire-damaged room has nothing to
label. Keep the prompt scene-shaped.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Freshly scoped for this service. Never a reused personal/dev key. |
| `GITHUB_PUSH_TOKEN` | yes | Fine-grained PAT scoped to **only** `855calljake-dev/gold-water-fire`, contents + pull-requests write. Same reasoning as `DOCTRINE_PUSH_TOKEN` in agent-runtime. |
| `HIGGSFIELD_CONTENT_API_KEY_ID` | yes | Required in every mode, not just live — SOP §8.5 makes an image a release requirement, so even a dry run needs to exercise real generation. Half of Higgsfield's ID/Secret pair — cloud.higgsfield.ai issues both from one "Create API Key" action. |
| `HIGGSFIELD_CONTENT_API_KEY_SECRET` | yes | The other half of the pair above. `config.mjs` combines both into the `id:secret` string Higgsfield's API expects — never store them pre-combined. |
| `AIRTABLE_OPS_PAT` | no | Write-scoped Airtable PAT for the ops base. **Without it the worker still runs, but records nothing — and the daily report will show this tenant as `DID NOT FIRE`.** Deliberately separate from the read-only tenant `AIRTABLE_PAT` in `KEY-INVENTORY.md`. |
| `AIRTABLE_OPS_BASE_ID` | no | `appAHLoykhxuB6twM` (ByTomorrow Ops). Already set on the Railway service. |
| `AIRTABLE_OPS_RUNS_TABLE` / `_ARTIFACTS_TABLE` | no | Table ids, already set. Default to the names `Runs`/`Artifacts` if unset. |
| `RUNTIME_MODE` | no | `dry` (default) or `live`. |
| `RUNTIME_MODEL` | no | Defaults to `claude-opus-5`. |
| `RUNTIME_MAX_PAGES` | no | Default 3 — pages drafted per run. |
| `RUNTIME_MAX_BUDGET_USD` | no | Default 5 — rough cost guard, not billing-accurate, stops mid-run if exceeded. |
| `GITHUB_REPO` | no | Defaults to `855calljake-dev/gold-water-fire`. |
| `GITHUB_BRANCH` | no | Defaults to `main`. |

Values go in Railway. Never in this repo.

## Cadence (SOP §5)

The Railway cron fires daily at 09:00 UTC. `RUNTIME_MODE=live` has been the
standing value since 2026-08-07, and since **2026-08-12** a live run publishes
rather than queueing for review — the trial is over and the tenant is graduated
(SOP §5.3).

~~The schedule existing is not the same as it publishing anything. `RUNTIME_MODE`
only becomes `live` when a human sets it deliberately, after reviewing a batch
clean. First batch: educational pages, manually triggered, reviewed by Jake.
Location pages and a truly unattended schedule are a later, separate decision.~~

**One batch per day**, enforced by looking for a PR whose branch starts with
`content-batch-<today>` in *any* state — open, merged or closed. That check
used to query the exact branch name, which never matched because the worker
appends a timestamp to it; the daily gate had never actually fired. Fixed
2026-08-12, and it matters more now that a batch merges within seconds of being
opened, so "is there an open PR" no longer answers the question.
