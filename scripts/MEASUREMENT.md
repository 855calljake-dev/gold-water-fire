# GWF measurement pilot

Prepared September 20, 2026. This change is local and dormant. It does not establish an Analytics property, connect GHL, deploy the site or start a monitoring schedule.

## Configuration and scope

`content/measurement.json` is the sole configuration. It is committed with an empty measurement ID and `enabled: false`. The universal `templates/shell.mjs` renders the tag for both composed and generated pages when configuration is verified. There is no dashboard injection or page-by-page installation.

Activation requires all of these values, followed by an approved release:

- `tenant` is `gwf` and `origin` is `https://www.goldwaterfire.com`.
- `measurementId` is the actual GWF stream's ID, verified against its owner and website URL. Format checks cannot prove ownership. The known JTHL ID is explicitly refused.
- `enhancedMeasurementDisabled` is `true` only after an operator verifies the stream's enhanced measurement is off. This flag records an external prerequisite; code cannot turn the remote setting off.
- `enabled` is `true` only after the above checks and release approval.

The loader refuses preview/local hosts, wrong path/canonical pairs, contact, thanks and 404 paths, invalid IDs, duplicate initialization, Global Privacy Control, Do Not Track, Google's per-ID disable flag, and `localStorage['gwf-analytics-opt-out'] === 'true'`. Storage errors also refuse loading. Every page uses a full document navigation, so form routes cannot inherit a tag from a single-page router.

URLs containing any query string or fragment are excluded before Google code loads. This deliberately undercounts campaign and anchor-link landings. It avoids allowing third-party code to inspect arbitrary URL values despite our explicit metadata overrides. Campaign attribution needs a separate reviewed collection policy; this pilot does not claim it.

## Event meaning and privacy

| Event | Trigger | Fields | Meaning |
|---|---|---|---|
| `page_view` | One allowed document initialization | GWF tenant, fixed stream, build canonical URL, fixed page title, allowlisted referrer origin | An observed allowed page visit |
| `phone_click` | Trusted click on GWF's telephone link | Same fields | A telephone-link interaction, not a completed call or lead |

The code does not read inputs, listen to form submissions, capture link text or send names, email addresses, phone numbers or form contents. Referrers are restricted to the site's own origin and a small list of public search origins. Other referrers become empty. Paths, queries, fragments and credentials from referrers never enter the payload. Google signals, ad personalization, ad storage and ad user data are disabled. No raw browser page title is sent. Google's script request uses `no-referrer`.

`contact.html` is the only form page found in the template and content-source scan. Its native Netlify Forms POST uses `name="service-request"`, `action="/thanks.html"`. A thanks-page visit can be direct or refreshed and is not proof that GHL accepted a lead. No `generate_lead` event is implemented. The remaining conversion work needs a trusted Netlify submission event, a GWF GHL write acknowledgment and durable deduplication by submission/event ID. Retell's existing call webhook remains unchanged; browser clicks are not matched to call outcomes.

Google's implementation references, read September 20, 2026: [configuration fields](https://developers.google.com/analytics/devguides/collection/ga4/reference/config) and [enhanced measurement controls](https://support.google.com/analytics/answer/9216061?hl=en). Disabling automatic page views in code does not replace turning off enhanced measurement at the stream.

## Verification and release

`npm run test:measurement` executes the browser loader with captured commands and builds every page in a temporary fixture with synthetic configuration. It tests enabled and disabled builds, privacy refusal, canonical aliases, opt-outs, duplicate initialization and telephone event semantics. It makes no Analytics requests. `npm test` also runs the existing regression suite. These local tests prove the site's intended loader behavior; they do not prove Google's runtime behavior or delivery to a live property.

Before release, resolve GWF ownership and record the actual property/stream verification. Keep the configuration disabled if ownership is unresolved. Verify enhanced measurement is disabled and the existing public privacy notice/consent decision covers this collection before activation. Obtain the retained live-template release approval.

After an authorized deployment, test the homepage, about page, service page, generated guide and location page in browser network tools. Confirm a single event reaches the verified GWF property. Confirm zero Analytics requests on contact/thanks/404, preview hosts, opted-out browsers and URLs with a query or fragment. Inspect actual request payloads for unexpected parameters. If any check fails, disable the config and redeploy through the approved release path. Only then record live adoption in the tenant ledger and Oracle TRACE.

Sweep completed for `gtag`, `analytics`, `measurement`, `form`, `submit` and `thanks` in templates, scripts, assets, content and Netlify code. The universal shell covers all generated output. Existing Google Preferred Source scripts are unchanged; the analytics exclusion is not a claim that those pages have no other third-party scripts. Historical doctrine descriptions of GWF ownership and pipeline graduation disagree across GWF/ByTomorrow records. This implementation makes no decision that depends on those descriptions.
