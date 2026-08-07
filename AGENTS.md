# START HERE — the ByTomorrow gateway

**Before any work in this repo, read the ByTomorrow BOS. Nothing passes without going through it
first.**

- Repo: `855calljake-dev/bytomorrow-bos`
- On this Mac: `~/Projects/bytomorrow-bos/`
- Read: `CLAUDE.md` (or `AGENTS.md` if your harness prefers it) — Gold Water Fire's tenant record is
  in §6 — then `doctrine/SESSION-LEDGER.md` top rows, then `doctrine/SOP-AGENTIC-SEO-WEBSITES.md` for
  this repo's content pipeline specifically.

That register holds the decisions, the canonical tech stack, the tenant isolation model, and what is
actually deployed. **Where it and this repo's code disagree, flag the disagreement rather than
guessing.** Referenced by repo name deliberately — never hardcode a filesystem path to it.

## This repo, specifically

Gold Water Fire is a **Tier-1** tenant: static HTML, no framework, no server, no database. Content
lives as JSON under `content/pages/` rendered through `templates/` (see `README.md` and
`worker/README.md`). Netlify Forms handles the contact form — there is no Next.js, no API route, no
Airtable wiring in this repo. If a task references a different architecture for this site (a
different framework, a server-side lead-capture route, etc.), it is describing a different, stale, or
unmerged workspace — confirm with Jake before building toward it rather than assuming it supersedes
what's actually deployed here.
