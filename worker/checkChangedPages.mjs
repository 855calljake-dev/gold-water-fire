#!/usr/bin/env node
// Runs the edit gate (worker/editGate.mjs) on the page files that changed since
// a base commit, and on nothing else. Never site-wide: a page nobody touched is
// not this change's problem, and several live pages would fail a site-wide run
// for reasons that predate it.
//
//   node worker/checkChangedPages.mjs <base>
//
// CI passes HEAD^1 on a pull request, whose checkout is a merge commit, so
// HEAD^1 is the base branch and the diff is exactly what the PR changes. The
// diff is against the working tree, so the same command checks an uncommitted
// edit locally: node worker/checkChangedPages.mjs HEAD. A new page git does not
// track yet is not seen until it is added.
//
// Exit 0: nothing changed, or every changed page passed. Exit 1: a page was
// refused. Exit 2: the check could not run (bad base, git failure, unreadable
// facts). 2 fails the job too: a check that did not run is not a pass.
//
// Page text goes to the log with whitespace collapsed, so nothing in a page can
// start a line and be read by Actions as a workflow command.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkEditedPage, loadValidPaths } from "./editGate.mjs";

const PAGE_FILE = /^content\/pages\/[^/]+\.json$/;

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();

function main() {
  const base = process.argv[2];
  if (!base || process.argv.length > 3) throw new Error("usage: node worker/checkChangedPages.mjs <base>");

  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const baseSha = git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], root).trim();

  // --no-renames so a moved page shows up at its new path. --diff-filter=d
  // leaves deletions out: a deleted page has nothing to read.
  const changed = git(["diff", "--name-only", "--no-renames", "--diff-filter=d", "-z", baseSha, "--"], root)
    .split("\0")
    .filter((p) => PAGE_FILE.test(p));

  console.log(`edit gate: base ${baseSha.slice(0, 7)}, ${changed.length} page file(s) changed`);
  if (!changed.length) {
    console.log("edit gate: no page files changed, nothing to check");
    return 0;
  }

  const validPaths = loadValidPaths(root);
  let refused = 0;
  for (const file of changed) {
    const result = checkEditedPage(JSON.parse(readFileSync(path.join(root, file), "utf8")), { validPaths });
    if (result.ok) {
      console.log(`PASS    ${file}`);
    } else {
      refused += 1;
      console.log(`REFUSED ${file}`);
      for (const problem of result.problems) console.log(`  - ${oneLine(problem)}`);
    }
  }
  console.log(`edit gate: ${changed.length - refused} passed, ${refused} refused`);
  return refused ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.log(`edit gate could not run: ${oneLine(err.stderr || err.message)}`);
  process.exitCode = 2;
}
