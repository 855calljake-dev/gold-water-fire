#!/usr/bin/env bash
# Netlify ignore command. Exit 0 = skip this build (no production deploy, no
# 15 credits). Exit 1 = build as normal.
#
# Fail-safe by construction: the build is skipped ONLY when every changed file
# matches INTERNAL below, i.e. files no visitor, form, function or build step
# reads. Any other path, a missing or unknown ref, a git or grep failure, or a
# non-production context builds, and the deploy log says why. A new directory
# nobody listed therefore always deploys.
#
# Two limits. Netlify never lets this cancel a build-hook build, whatever it
# returns. And after a skipped commit, the dashboard's plain "Deploy site" is
# skipped again (same diff, same answer); to redeploy without a visitor-facing
# commit use "Clear cache and deploy site" (the refs are then equal, which
# builds) or a build hook.
#
# Replay: CONTEXT=production CACHED_COMMIT_REF=<old> COMMIT_REF=<new> bash ./scripts/netlify-ignore.sh; echo $?
# Tests:  node --test scripts/netlify-ignore.test.mjs
set -u

# Per-repo list. Extended regex, matched against each changed path. Every
# entry is 404-blocked in netlify.toml or a dot-path Netlify does not serve,
# and none is read by scripts/build.mjs, templates/ or netlify/functions. The
# test file checks both properties against the tracked tree.
INTERNAL='^(worker/|\.github/|\.railway/|\.gitignore$|content/(backlog|graduation)\.json$|(README|CLAUDE|AGENTS|CLAIMS-TO-VERIFY|IMAGERY-REFERENCES)\.md$|netlify/README\.md$|(netlify/lib|scripts)/[^/]*\.test\.mjs$|nixpacks\.toml$)'

old="${CACHED_COMMIT_REF:-}"; new="${COMMIT_REF:-}"; ctx="${CONTEXT:-}"
build() {
  echo "netlify-ignore: building, $1 (cached=${old:-unset} commit=${new:-unset} context=${ctx:-unset})"
  exit 1
}

[ "$ctx" = "production" ] || build "context is not production (previews are free anyway)"
[ -n "$old" ] && [ -n "$new" ] || build "a commit ref is missing"
[ "$old" = "$new" ] && build "refs are equal (no cache: first build or clear-cache rebuild)"
git cat-file -e "$old^{commit}" 2>/dev/null || build "cached ref is not in this clone (shallow clone or rewritten history)"
git cat-file -e "$new^{commit}" 2>/dev/null || build "commit ref is not in this clone"
# The cached ref must be an ancestor of this commit, or the diff would run
# against some other line of history (a force-push, or a cache restored from
# another branch's build) and could hide visitor-facing changes.
git merge-base --is-ancestor "$old" "$new" 2>/dev/null || build "cached ref is not an ancestor of this commit"
# --no-renames: a moved file must appear as a deletion plus an addition, or a
# visitor-facing file moved under an internal path would look internal-only.
changed=$(git diff --name-only --no-renames "$old" "$new" --) || build "git diff failed"
[ -n "$changed" ] || build "no files changed between the refs"

visible=$(printf '%s\n' "$changed" | grep -Ev "$INTERNAL"); grep_rc=$?
# grep: 0 = some path is visitor-facing, 1 = none is, anything else = grep
# itself failed (bad pattern, missing binary) and must never read as "none".
[ "$grep_rc" -le 1 ] || build "grep failed with exit $grep_rc"
[ "$grep_rc" -eq 1 ] || build "visitor-facing changes: $(printf '%s' "$visible" | head -5 | tr '\n' ' ')"
echo "netlify-ignore: skipping, only internal files changed: $(printf '%s' "$changed" | head -5 | tr '\n' ' ') (cached=$old commit=$new)"
exit 0
