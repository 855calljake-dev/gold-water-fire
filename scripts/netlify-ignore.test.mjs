// Tests for scripts/netlify-ignore.sh, the Netlify [build] ignore command.
//
// Exit 0 = Netlify cancels the build (no production deploy, no credits).
// Exit 1 = build. A wrong 0 is the dangerous direction: this site publishes
// autonomously, so a visitor-facing change that is skipped goes unnoticed.
// Every case below that ends in 1 is a fail-safe the script must keep.
//
// Run: node --test scripts/netlify-ignore.test.mjs
// To see which cases an older copy of the script fails:
//   NETLIFY_IGNORE_SCRIPT=/path/to/old.sh node --test scripts/netlify-ignore.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = process.env.NETLIFY_IGNORE_SCRIPT || path.join(ROOT, "scripts", "netlify-ignore.sh");

// Netlify's own variables must not leak in from whatever runs the tests.
const cleanEnv = { ...process.env };
for (const k of ["CONTEXT", "CACHED_COMMIT_REF", "COMMIT_REF"]) delete cleanEnv[k];

function git(cwd, ...args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...cleanEnv,
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// A throwaway repository. diff.renames=true is git's default since 2.9 and is
// the trap the rename cases exist for, so it is set explicitly.
const scratch = [];
after(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "netlify-ignore-"));
  scratch.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "diff.renames", "true");
  return dir;
}

// Write the given files (null deletes) and commit. Returns the commit SHA.
function commit(dir, files, message = "change") {
  for (const [p, body] of Object.entries(files)) {
    const abs = path.join(dir, p);
    if (body === null) rmSync(abs);
    else {
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

const GUIDE = "<p>guide one, long enough for git to recognise it as a rename when moved</p>\n";

// The "last deployed" tree every case starts from: a page, a build input, worker code.
function base(dir) {
  return commit(dir, {
    "index.html": "<h1>home</h1>\n",
    "guides/one.html": GUIDE,
    "content/pages/one.json": '{"path":"/guides/one.html"}\n',
    "worker/run.mjs": "export const x = 1;\n",
  }, "base");
}

// Run the script the way Netlify does: bash, from the repo root, env vars set.
// overrides: a value of null unsets that variable.
function run(dir, overrides = {}, extraPath) {
  const env = { ...cleanEnv, CONTEXT: "production" };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete env[k]; else env[k] = v;
  }
  if (extraPath) env.PATH = `${extraPath}:${env.PATH}`;
  const r = spawnSync("bash", [SCRIPT], { cwd: dir, encoding: "utf8", env });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function internalOnly(dir) {
  return commit(dir, {
    "worker/run.mjs": "export const x = 2;\n",
    "worker/README.md": "# worker\n",
    "content/backlog.json": "[]\n",
    "content/graduation.json": "{}\n",
    ".github/workflows/ci.yml": "name: ci\n",
    ".railway/railway.ts": "export {};\n",
    ".gitignore": "node_modules/\n",
    "README.md": "# readme\n",
    "CLAUDE.md": "# claude\n",
    "AGENTS.md": "# agents\n",
    "CLAIMS-TO-VERIFY.md": "# claims\n",
    "IMAGERY-REFERENCES.md": "# imagery\n",
    "netlify/README.md": "# netlify\n",
    "netlify/lib/thing.test.mjs": "// test\n",
    "scripts/thing.test.mjs": "// test\n",
    "nixpacks.toml": "[phases.setup]\n",
  }, "internal only");
}

test("a commit touching only internal files is skipped", () => {
  const d = repo(); const a = base(d); const b = internalOnly(d);
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^netlify-ignore: skipping, only internal files changed:/m);
});

test("a content batch (pages, images, backlog) builds", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, {
    "content/pages/two.json": '{"path":"/guides/two.html"}\n',
    "assets/img/two-phoenix-az.jpg": "not really a jpg\n",
    "content/backlog.json": "[]\n",
  });
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, visitor-facing changes:.*assets\/img\/two-phoenix-az\.jpg/);
});

test("internal files plus one visible file builds", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "worker/run.mjs": "export const x = 3;\n", "index.html": "<h1>changed</h1>\n" });
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /index\.html/);
});

test("a visible file moved under an internal path builds (rename detection must not hide the deletion)", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "guides/one.html": null, "worker/archive/one.html": GUIDE });
  assert.equal(git(d, "diff", "--name-only", a, b), "worker/archive/one.html", "precondition: git reports this as a rename");
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /guides\/one\.html/);
});

test("an internal file moved to a visible path builds", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "worker/run.mjs": null, "run.mjs": "export const x = 1;\n" });
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
});

test("deleting a visible file builds", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "guides/one.html": null });
  assert.equal(run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b }).code, 1);
});

test("a new directory nobody listed builds", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "docs/notes.md": "internal-looking but unlisted\n" });
  assert.equal(run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b }).code, 1);
});

test("the ignore script and netlify.toml themselves build", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "scripts/netlify-ignore.sh": "# changed\n", "netlify.toml": "[build]\n" });
  assert.equal(run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b }).code, 1);
});

test("a non-production context builds even when only internal files changed", () => {
  const d = repo(); const a = base(d); const b = internalOnly(d);
  for (const ctx of ["deploy-preview", "branch-deploy", "dev", "", null]) {
    const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b, CONTEXT: ctx });
    assert.equal(r.code, 1, `CONTEXT=${String(ctx)}: ${r.out}`);
    assert.match(r.out, /building, context is not production/);
  }
});

test("a missing ref builds", () => {
  const d = repo(); const a = base(d); const b = internalOnly(d);
  for (const env of [{ CACHED_COMMIT_REF: null, COMMIT_REF: b }, { CACHED_COMMIT_REF: a, COMMIT_REF: null }, { CACHED_COMMIT_REF: "", COMMIT_REF: b }]) {
    const r = run(d, env);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /building, a commit ref is missing/);
  }
});

test("equal refs (no cache) build", () => {
  const d = repo(); const a = base(d);
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: a });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, refs are equal/);
});

test("an unknown cached ref builds", () => {
  const d = repo(); base(d); const b = internalOnly(d);
  const r = run(d, { CACHED_COMMIT_REF: "0000000000000000000000000000000000000000", COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, cached ref is not in this clone/);
});

test("an unknown commit ref builds", () => {
  const d = repo(); const a = base(d); internalOnly(d);
  for (const bad of ["0000000000000000000000000000000000000000", "worker", "--cached"]) {
    const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: bad });
    assert.equal(r.code, 1, `COMMIT_REF=${bad}: ${r.out}`);
    assert.match(r.out, /building, commit ref is not in this clone/);
  }
});

// Netlify sets CACHED_COMMIT_REF from the restored build cache. If that cache
// ever came from another branch's build (a deploy preview) or main was
// force-pushed, the diff would run against the wrong history: here the PR's
// visible change is invisible in P..M and only main's internal commit shows.
test("a cached ref from another line of history builds (squash merge)", () => {
  const d = repo(); const a = base(d);
  git(d, "checkout", "-q", "-b", "pr");
  const page = { "content/pages/two.json": '{"path":"/guides/two.html"}\n' };
  const p = commit(d, page, "pr: visible change");
  git(d, "checkout", "-q", "main");
  const k = commit(d, { "worker/run.mjs": "export const x = 9;\n" }, "main: internal only");
  const m = commit(d, page, "squash merge of pr");
  assert.equal(git(d, "diff", "--name-only", "--no-renames", p, m), "worker/run.mjs", "precondition: P..M looks internal-only");
  const r = run(d, { CACHED_COMMIT_REF: p, COMMIT_REF: m });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, cached ref is not on this commit's first-parent history/);
  assert.equal(run(d, { CACHED_COMMIT_REF: k, COMMIT_REF: m }).code, 1, "control: from main's own history the merge is a visible change");
  assert.equal(run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: k }).code, 0, "control: the internal-only commit itself still skips");
});

// Same trap through a real merge commit: the PR head becomes an ancestor of
// main (its second parent), so an ancestry check would pass, but it was never
// a production build of main and P..M still hides the PR's own change.
test("a cached ref that a merge commit pulled in (ancestor, not first-parent) builds", () => {
  const d = repo(); const a = base(d);
  git(d, "checkout", "-q", "-b", "pr");
  const p = commit(d, { "content/pages/two.json": '{"path":"/guides/two.html"}\n' }, "pr: visible change");
  git(d, "checkout", "-q", "main");
  const k = commit(d, { "worker/run.mjs": "export const x = 9;\n" }, "main: internal only");
  git(d, "merge", "-q", "--no-ff", "-m", "merge pr", "pr");
  const m = git(d, "rev-parse", "HEAD");
  git(d, "merge-base", "--is-ancestor", p, m); // precondition: P is an ancestor of M (throws otherwise)
  assert.equal(git(d, "diff", "--name-only", "--no-renames", p, m), "worker/run.mjs", "precondition: P..M looks internal-only");
  const r = run(d, { CACHED_COMMIT_REF: p, COMMIT_REF: m });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, cached ref is not on this commit's first-parent history/);
  assert.equal(run(d, { CACHED_COMMIT_REF: k, COMMIT_REF: m }).code, 1, "control: from main's own history the merge is a visible change");
  assert.equal(run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: m }).code, 1, "control: from the last production build the merge is a visible change");
});

test("an empty diff between two different commits builds", () => {
  const d = repo(); const a = base(d); const b = commit(d, {}, "empty");
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, no files changed/);
});

test("a grep failure builds instead of skipping", () => {
  const d = repo(); const a = base(d);
  const b = commit(d, { "index.html": "<h1>changed</h1>\n" });
  const shim = mkdtempSync(path.join(tmpdir(), "grep-shim-"));
  scratch.push(shim);
  writeFileSync(path.join(shim, "grep"), "#!/bin/sh\necho 'grep: simulated failure' >&2\nexit 2\n");
  chmodSync(path.join(shim, "grep"), 0o755);
  const r = run(d, { CACHED_COMMIT_REF: a, COMMIT_REF: b }, shim);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /building, grep failed with exit 2/);
});

test("netlify.toml wires the script in as the ignore command", () => {
  const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /^\s*ignore = "bash \.\/scripts\/netlify-ignore\.sh"$/m);
});

// The list is only safe if every path it names is (a) not something the build
// reads and (b) not served to visitors, so a skipped commit cannot leave a stale
// public file. Checked against the real tracked tree and the real netlify.toml.
test("every tracked path INTERNAL matches is unserved and not a build input", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const m = src.match(/^INTERNAL='([^']+)'$/m);
  assert.ok(m, "INTERNAL='...' line not found in the script");
  const internal = new RegExp(m[1]);

  const tracked = git(ROOT, "ls-files").split("\n").filter(Boolean);
  const matched = tracked.filter((p) => internal.test(p));
  assert.ok(matched.length > 0, "INTERNAL matches nothing in the tracked tree");

  const buildInputs = [
    /^content\/pages\//, /^content\/craftsmanship\.json$/, /^templates\//, /^scripts\/build\.mjs$/,
    /^netlify\/functions\//, /^netlify\/lib\/(?!.*\.test\.mjs$)/, /^assets\//, /^data\//, /^admin\//,
    /^[^/]+\.html$/, /^(sitemap\.xml|robots\.txt|llms\.txt|netlify\.toml|package\.json|package-lock\.json|favicon\.ico)$/,
  ];
  for (const p of matched) {
    for (const re of buildInputs) assert.ok(!re.test(p), `${p} is on INTERNAL but is a build input or a published file (${re})`);
  }

  const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  const blocked = [];
  for (const block of toml.split("[[redirects]]").slice(1)) {
    const from = block.match(/from\s*=\s*"([^"]+)"/)?.[1];
    const status = block.match(/status\s*=\s*(\d+)/)?.[1];
    if (from && status === "404" && /force\s*=\s*true/.test(block)) blocked.push(from);
  }
  const isBlocked = (p) => blocked.some((f) => f === `/${p}` || (f.endsWith("/*") && p.startsWith(f.slice(1, -1))));
  const isDotPath = (p) => p.startsWith(".") || p.includes("/."); // Netlify does not serve these (observed 404 on the live site)
  for (const p of matched) {
    assert.ok(isDotPath(p) || isBlocked(p), `${p} is on INTERNAL but netlify.toml does not 404-block it, so a skipped commit would leave a stale public copy`);
  }
});
