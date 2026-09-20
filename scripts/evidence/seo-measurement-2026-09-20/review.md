# Independent GWF measurement review

Verdict: **approve** for dormant implementation head `ca5450b8485cda6b148dcdd618db93fb617a78e5`, based on `7d575362168a1c4d98ce5f2ccc5259ddf84f1326`.

Reviewer is `codex-seo-reviewer`, OpenAI through Codex, September 20, 2026. This is an independent worker using the same provider as the author. The exact configured model identifier is not exposed to the reviewer. Review follows `bt-pstack@1.0.0` and `BT-TP-1.1` under the site's feature task record.

No actionable defects found in the assigned implementation scope. Approval does not authorize activation, release, deployment or any assertion of live Analytics delivery.

## Verification

- Read the site's gateways, task record, full implementation diff, measurement tests and release notes. Used ByTomorrow BOS at `8f69455d2c1151841a4d8087290cd506920f0a62`, including its measurement and release boundaries.
- Independently ran `npm run test:measurement`. All seven tests passed, including builds of every rendered page with enabled synthetic configuration and disabled configuration.
- Independently ran `npm test`. The complete command exited zero. Raw reviewer output is in `/tmp/gwf-review-tests.txt`; the committed author run is in `tests.txt` beside this review.
- Ran `git diff --check` across the reviewed base/head range. It passed. The worktree was clean before this review artifact was added.

The implementation keeps its committed ID empty and its enable flag false. Enabled builds reject wrong tenant/origin values, the known JTHL ID, invalid IDs and an unconfirmed enhanced-measurement prerequisite. The runtime independently rejects preview hosts, opt-outs, mismatched paths, query/fragment URLs and sensitive routes. A build assertion alone cannot prove the stream belongs to GWF; the release notes require an operator to verify that external fact.

Every generated and composed page inherits the shared shell. Contact, thanks and 404 pages omit the loader. The contact form uses native document navigation, so the excluded document does not inherit a running Analytics script from a client router. No submit listener or lead event is added. Only a trusted click on the business telephone link emits `phone_click`, and the documentation correctly defines that as an interaction, not a completed call or qualified lead.

Emitted metadata uses the build canonical, a fixed title and an allowlisted referrer origin. It does not include form values, URL queries/fragments, referrer paths, arbitrary referrer domains or link text. Advertising-related consent and configuration are disabled. Runtime opt-out after initialization disables subsequent events through the guarded send path and Google's per-ID flag.

## Limits retained for release

These tests execute the local loader with a simulated browser and inspect actual generated HTML. They do not execute Google's third-party library or prove network payloads, consent compliance or delivery to a real property. The release notes preserve those live checks, stream enhanced-measurement verification and the privacy-notice/consent decision as prerequisites.

Query and fragment landings intentionally receive no measurement and will undercount visits. CRM acknowledgment, deduplicated lead outcomes and call-to-customer attribution remain unimplemented and are described as such. No existing Preferred Source script is changed, and analytics exclusions do not claim to remove every third-party script.

This verdict covers only the implementation head above. A later task-record or review-evidence commit is not automatically covered by this exact-head review.
