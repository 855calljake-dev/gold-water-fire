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

## ORIENT — before touching anything

**Step 0, every session, before reading or writing a single file:**

```bash
git fetch --all --prune && git status -sb && git branch --show-current
```

**What the branch is tells you what kind of session this is** — know which before you commit:

- **`main`** — where doctrine, config, templates, worker code, and this file itself land. This repo
  has no PR gate for that kind of work; a commit to `main` is what makes the change visible to the
  next session, same reasoning as `bytomorrow-bos` Hard Rule 7.
- **`content-batch-YYYY-MM-DD-<timestamp>`** — the worker's own dated branch for one batch of
  drafted pages, per `SOP-AGENTIC-SEO-WEBSITES.md` §2.4/§5. GWF graduated 2026-08-12: the worker
  opens the PR and merges it itself, but the PR stays the audit record for that batch (one squashed
  commit per batch — `git revert -m 1 <sha>` pulls the whole batch off the live site). If you're
  doing content-batch work, you opened this branch yourself, for this batch, and you know why
  you're on it.
- **A Claude Code worktree branch (`claude/...`)** is the deliberate per-task workspace this
  session opened — expected, not drift. It doesn't change the question: doctrine/config work still
  lands on `main` (push it there directly, same as any other doctrine commit); a content batch still
  belongs on its own `content-batch-YYYY-MM-DD-<timestamp>` branch, never folded into the worktree
  branch.

**Any other branch — one you did not open yourself, for a reason you can name — is a
stop-and-report condition, never a commit-anyway condition.** Say what branch was found and why
it's unexplained, before writing anything.

This is this repo's local copy of the fix recorded in `bytomorrow-bos`
`doctrine/GOVERNANCE.md` §7: on 2026-08-12/13, five sessions sharing one local clone of that repo
silently inherited whatever branch the last session had left checked out, and committed real
doctrine to it for about five hours before anyone checked which branch they were on. Nothing in
this repo has happened yet — this section exists so it doesn't.

## This repo, specifically

Gold Water Fire is a **Tier-1** tenant: static HTML, no framework, no server, no database. Content
lives as JSON under `content/pages/` rendered through `templates/` (see `README.md` and
`worker/README.md`). Netlify Forms handles the contact form — there is no Next.js, no API route, no
Airtable wiring in this repo. If a task references a different architecture for this site (a
different framework, a server-side lead-capture route, etc.), it is describing a different, stale, or
unmerged workspace — confirm with Jake before building toward it rather than assuming it supersedes
what's actually deployed here.
