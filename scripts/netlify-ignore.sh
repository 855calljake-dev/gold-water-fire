#!/usr/bin/env bash
# Netlify ignore command. Exit 0 = skip this build (no production deploy, no
# 15 credits). Exit 1 = build as normal.
#
# Fail-safe by construction: the build is skipped ONLY when every changed file
# matches INTERNAL below, i.e. files no visitor, form, function or build step
# reads. Any other path, any git error, a missing ref, or a non-production
# context builds. A new directory nobody listed therefore always deploys.
# Netlify never lets this cancel a build-hook build, whatever it returns.
#
# Replay test: CACHED_COMMIT_REF=<old> COMMIT_REF=<new> ./scripts/netlify-ignore.sh; echo $?
set -u

# Per-repo list. Extended regex, matched against each changed path.
INTERNAL='^(worker/|\.github/|content/(backlog|graduation)\.json$|content/run-records|(README|CLAUDE|AGENTS|CLAIMS-TO-VERIFY|IMAGERY-REFERENCES)\.md$|netlify/README\.md$|nixpacks\.toml$|.*\.test\.mjs$)'

[ "${CONTEXT:-production}" = "production" ] || exit 1   # previews are free anyway
old="${CACHED_COMMIT_REF:-}"; new="${COMMIT_REF:-}"
[ -n "$old" ] && [ -n "$new" ] || exit 1
[ "$old" = "$new" ] && exit 1                          # manual or clear-cache rebuild
git cat-file -e "$old^{commit}" 2>/dev/null || exit 1  # shallow clone or rewritten history
changed=$(git diff --name-only "$old" "$new" 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1

visible=$(printf '%s\n' "$changed" | grep -Ev "$INTERNAL")
if [ -n "$visible" ]; then
  echo "netlify-ignore: building, visitor-facing changes: $(printf '%s' "$visible" | head -5 | tr '\n' ' ')"
  exit 1
fi
echo "netlify-ignore: skipping, only internal files changed: $(printf '%s' "$changed" | head -5 | tr '\n' ' ')"
exit 0
