// Deterministic GitHub writes — the model never touches git. Mirrors
// agent-runtime's recorder.ts: a path allowlist and our own code do the
// writing and pushing, never the agent. Uses the Contents API directly
// (no local clone needed for a handful of small JSON files) so the worker
// stays a plain Node script with zero dependencies.

const API = "https://api.github.com";

async function gh(token, path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${opts.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

function b64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

// One batch per day. This used to query `?head=owner:content-batch-<date>`,
// an EXACT branch match -- but openContentBatchPr appends `-${Date.now()}` to
// the branch name, so that query could never match its own branches and the
// daily gate never actually fired. Found 2026-08-12; it went unnoticed because
// the cron runs once a day anyway, so the gate was never exercised.
//
// Now: list recent PRs in EVERY state and prefix-match the head ref. State
// matters more since graduation -- an auto-published batch is merged within
// seconds, so "is there an open PR" stopped being the question. "Did today
// already publish" is.
export async function findBatchPrForDate({ token, repo, dateStr }) {
  const prs = await gh(token, `/repos/${repo}/pulls?state=all&per_page=30&sort=created&direction=desc`);
  const pr = prs.find((p) => (p.head?.ref || "").startsWith(`content-batch-${dateStr}`));
  if (!pr) return null;
  // The list API reports a merged PR as "closed", so state alone would log a
  // published batch as if it had been thrown away.
  return { ...pr, batchState: pr.merged_at ? "published" : pr.state };
}

export async function openContentBatchPr({ token, repo, baseBranch, dateStr, pages, images, backlogUpdate, summaryLines, autoPublish, drops, deGraduationReason }) {
  const branchName = `content-batch-${dateStr}-${Date.now()}`;

  const baseRef = await gh(token, `/repos/${repo}/git/ref/heads/${baseBranch}`);
  const baseSha = baseRef.object.sha;

  await gh(token, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });

  for (const page of pages) {
    const filePath = `content/pages/${page.slug}.json`;
    await gh(token, `/repos/${repo}/contents/${filePath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Draft: ${page.title}`,
        content: b64(JSON.stringify(page, null, 2) + "\n"),
        branch: branchName,
      }),
    });
  }

  // SOP-AGENTIC-SEO-WEBSITES.md §8.5: the image lands in the SAME PR as its
  // page, opened by this same call -- no separate image-approval flow.
  // Contents API PUT wants base64 for binary files too, same endpoint as
  // the JSON writes above, just raw bytes instead of a UTF-8 string.
  for (const image of images || []) {
    const filePath = `assets/img/${image.filename}`;
    await gh(token, `/repos/${repo}/contents/${filePath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Image: ${image.filename}`,
        content: image.buffer.toString("base64"),
        branch: branchName,
      }),
    });
  }

  if (backlogUpdate) {
    const existing = await gh(token, `/repos/${repo}/contents/content/backlog.json?ref=${branchName}`);
    await gh(token, `/repos/${repo}/contents/content/backlog.json`, {
      method: "PUT",
      body: JSON.stringify({
        message: "Mark batch items as drafted",
        content: b64(JSON.stringify(backlogUpdate, null, 2) + "\n"),
        branch: branchName,
        sha: existing.sha,
      }),
    });
  }

  // The PR survives graduation even though nothing waits in it. It is the
  // per-batch audit record: what shipped, on what evidence, in one revertable
  // squash commit. Direct-to-main writes would have neither.
  //
  // `git revert <sha>`, with no `-m 1`. Corrected 2026-08-31 from the older
  // line this block carried. A squash merge lands as a single-parent commit,
  // and `-m` is a mainline selector that only means anything on a merge commit
  // with two parents. Modern git tolerates the extra flag; older git errors on
  // it, so the plain form is the one that works everywhere.
  const header = autoPublish
    ? [
        "**Published automatically. This tenant is graduated (SOP-AGENTIC-SEO-WEBSITES.md §5.3).**",
        "",
        "No standing human gate. This PR is the audit record of the batch, not a request to review it.",
        "To pull a page back off the live site, revert this merge commit: `git revert <sha>`.",
      ]
    : deGraduationReason
      ? [
          "**DE-GRADUATED ON THIS RUN. Nothing here is live, and the next run will not publish either.**",
          "",
          `Why: ${deGraduationReason}`,
          "",
          "The structural gate refused enough of this batch to read as a broken drafter rather than a bad",
          "page (worker/run.mjs, DEGRADUATION_MIN_FAILURES and DEGRADUATION_FAILURE_RATE). At that rate the",
          "pages below are not trustworthy either just because they got past the same gate in the same run,",
          "so the whole batch is held here for a person instead of published.",
          "",
          "`content/graduation.json` on the default branch now reads `manual-review`. Putting this tenant",
          "back is Jake's call, not this worker's, and the bytomorrow-bos tenant register has to be updated",
          "with it or the two disagree.",
        ]
      : [
          "**Awaiting Jake's review. Nothing here is live until this merges.**",
          "",
          "Opened with `RUNTIME_AUTO_PUBLISH=false`, which re-gates a graduated tenant for one run.",
        ];

  // WHAT THIS RUN LEFT BEHIND. Added 2026-08-31 with Jake's ruling that a
  // flagged page stops on its own and the rest of the batch publishes.
  //
  // A batch that no longer halts on a refusal comes out short, and a short
  // batch with no explanation reads as a complete one. This repo has no
  // run-record file the way JTHL does (content/run-records.jsonl), so this
  // table is the entire durable account of a dropped page: nothing else
  // outlives the process. Every dropped slug is named, with the reason it was
  // dropped, verbatim.
  const dropLabels = {
    "evidence-gate": "dropped, structural evidence gate",
    "claim-verifier": "dropped, claim verifier",
    "claim-verifier-unavailable": "dropped, claim verifier unavailable (fail closed)",
    "image-failed": "dropped, image generation failed",
    "image-account-failure": "dropped, image account failure",
    "draft-error": "dropped, drafting error",
    "not-attempted": "not attempted, run stopped early",
    unknown: "dropped, reason not classified",
  };
  // Cells are prose a person reads on a published PR, so Hard Rule 7
  // (bytomorrow-bos CLAUDE.md, no em dashes, standing and cross-tenant)
  // applies to them even when the sentence came from a provider's error
  // message rather than from us.
  const cell = (v) =>
    String(v || "")
      .replace(/\|/g, "\\|")
      .replace(/\n+/g, " ")
      .replace(/\s*\u2014\s*/g, ", ");
  const dropSection = (drops || []).length
    ? [
        "",
        "### Pages this run dropped",
        "",
        `${drops.length} backlog item(s) did not make it into this batch. Each one stays \`pending\` in`,
        "`content/backlog.json` and the next scheduled run picks it up again. That is the whole retry",
        "mechanism, and it is the same one an image failure has always used.",
        "",
        "| Item | Outcome | Why |",
        "| --- | --- | --- |",
        ...drops.map((d) => `| \`${cell(d.slug)}\` | ${dropLabels[d.kind] || cell(d.kind)} | ${cell(d.reason) || "-"} |`),
      ]
    : [];

  const pr = await gh(token, `/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: autoPublish
        ? `Content batch ${dateStr}: ${pages.length} page(s) published`
        : `Content batch ${dateStr}: ${pages.length} page(s) awaiting review`,
      head: branchName,
      base: baseBranch,
      body: [
        ...header,
        "",
        "Generated by the agentic drafting worker (SOP-AGENTIC-SEO-WEBSITES.md). Each page passed the",
        "structural evidence gate (no unconfirmed claims, no unsafe HTML) before this PR was opened.",
        "",
        "Run `npm run build` locally or check the Netlify deploy to see the rendered pages.",
        "",
        "### Pages in this batch",
        ...summaryLines,
        ...dropSection,
      ].join("\n"),
    }),
  });

  return { branchName, prUrl: pr.html_url, prNumber: pr.number };
}

// De-graduation, per BYTOMORROW-OPERATING-SYSTEM.md 2026-08-09 ("what happens
// on a failed gate after graduation — resolved: the tenant de-graduates"): a
// STRUCTURAL gate failure on an autonomous batch drops this tenant back to
// manual review until two clean batches are approved again. Not skip-and-
// retry-tomorrow.
//
// State lives in the tenant's own repo rather than the BOS register the same
// ruling names as canonical, for one reason: the worker has to read it on
// every run, and the register is prose in another repo. `content/graduation.json`
// is the machine-readable mirror; the register stays the human record, and the
// two are reconciled by whoever re-graduates. An absent file means graduated,
// which is the register's current state for GWF.
const GRADUATION_PATH = "content/graduation.json";

export async function readGraduationState({ token, repo, branch }) {
  try {
    const file = await gh(token, `/repos/${repo}/contents/${GRADUATION_PATH}?ref=${branch}`);
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch (err) {
    if (String(err.message).includes("-> 404")) return { state: "graduated", note: "no graduation.json — defaults to the register's state" };
    throw err;
  }
}

export async function deGraduate({ token, repo, branch, dateStr, reason }) {
  let sha;
  try {
    const existing = await gh(token, `/repos/${repo}/contents/${GRADUATION_PATH}?ref=${branch}`);
    sha = existing.sha;
  } catch (err) {
    if (!String(err.message).includes("-> 404")) throw err;
  }

  const body = {
    state: "manual-review",
    since: dateStr,
    reason,
    howToReGraduate:
      "Two clean approved batches again (SOP-AGENTIC-SEO-WEBSITES.md §5.3 / BYTOMORROW-OPERATING-SYSTEM.md 2026-08-09). " +
      "Then set state back to \"graduated\" here AND in the bytomorrow-bos tenant register (CLAUDE.md §6) — both, or they disagree.",
  };

  // Written straight to the default branch, not into the batch PR: the batch
  // PR is exactly the thing that isn't being merged, so a marker inside it
  // would never land and the next run would auto-publish as if nothing had
  // happened.
  await gh(token, `/repos/${repo}/contents/${GRADUATION_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `De-graduate: ${reason}`,
      content: b64(JSON.stringify(body, null, 2) + "\n"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  return body;
}

// Graduation's actual write. Squash, so one batch is one commit on main and
// `git revert` of it takes the whole batch back off the live site in one step.
//
// GitHub computes mergeability asynchronously: a PR opened a second ago
// reports `mergeable: null` and a merge attempt against it 405s. That is a
// timing artefact, not a conflict, so poll briefly before believing it --
// without this the first run after graduation fails for a reason that would
// look like a permissions problem in the logs.
export async function mergeBatchPr({ token, repo, prNumber, title }) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const pr = await gh(token, `/repos/${repo}/pulls/${prNumber}`);
    if (pr.mergeable === true) break;
    if (pr.mergeable === false) {
      throw new Error(`PR #${prNumber} is not mergeable (state: ${pr.mergeable_state}) — left open, nothing published`);
    }
    if (attempt === 6) throw new Error(`PR #${prNumber} mergeability still unknown after 6 checks — left open, nothing published`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const merged = await gh(token, `/repos/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash", commit_title: title }),
  });

  return { sha: merged.sha };
}
