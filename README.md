# Gold Water Fire — Website

Static site, no build step. Fire and water damage restoration and reconstruction contractor,
Phoenix, AZ metro area. A ByTomorrow Tier-1 client site — see `bytomorrow-bos` (`CLAUDE.md` §6,
`doctrine/SESSION-LEDGER.md`) for tenant record and onboarding history.

**LIVE 2026-08-06** at `https://www.goldwaterfire.com/` (Netlify, DNS at GoDaddy). Marked by Jake
as a demo for his team for now — real client-facing launch (public marketing, ad spend, etc.) is a
separate decision. Email is **not** connected yet — `Help@goldwaterfire.com` is printed on the site
but nothing receives it; Jake has said this gets wired up later, don't let it drift unaddressed.

## Structure

- `index.html`, `water-damage-restoration.html`, `fire-damage-restoration.html`,
  `reconstruction.html`, `about.html`, `contact.html`, `404.html`, `thanks.html` — plain HTML,
  no framework.
- `assets/css/style.css` — all site styles. Color system: Gold = gold/amber, Water = navy blue,
  Fire = red-orange, matching the approved phoenix mark and typography sheet.
- `assets/brand/gold-water-fire-phoenix-mark.png` — full-resolution source mark (background
  keyed to transparent from `GWF - Phoenix.jpg`). Don't redraw this freehand — it's the approved
  mark.
- `assets/img/` — web-sized photography and the mark. Filenames follow
  subject-service-geography-purpose SEO convention.
- `data/team.json` — team roster, editable via `/admin` (Decap CMS) without touching code.
- `CLAIMS-TO-VERIFY.md` (repo root, blocked from public serving by `netlify.toml`) — gate on
  unverified claims. Read before adding certifications, testimonials, photos, or hour/response
  claims to any page.

## Imagery

Homepage and service-page photography is Higgsfield-generated illustrative imagery (no real
recognizable people, not captioned as an actual completed job) — Gold Water Fire has no completed
jobs yet to photograph. Every such image carries an on-page "Illustrative imagery" note and a
watermark (phoenix mark + wordmark) burned in via `assets/brand/gold-water-fire-phoenix-mark.png`.
Replace with real job photography as real jobs are completed and rights-cleared; drop the
illustrative-note and swap the file in place once real.

## Before this goes live (Tier-1 launch checklist)

Full checklist: `bytomorrow-bos/doctrine/BYTOMORROW-TECH-STACK.md` → "Tier-1 launch checklist."
Items that need action once a Netlify site exists (none of these are set by `netlify.toml` alone):

1. **Netlify Forms:** new sites default `processing_settings.ignore_html_forms: true`. Set it
   `false` via the Netlify API or dashboard, then redeploy to trigger form detection. Submit a
   real test on `/contact.html` and confirm it arrives.
2. **GitHub OAuth for Decap:** enable Netlify's GitHub OAuth provider on the site so `/admin`
   can authenticate and commit. Confirm `sso_login` stays **off** for the public site itself —
   installing the OAuth provider can silently turn on `sso_login`, which 401s every public URL.
3. Log into `/admin` and edit every field type once live — Decap 3.x removed the plain `date`
   widget; this site doesn't use one, but verify the `team` list widget renders and saves.
4. Confirm `og:image` resolves as an absolute URL (`https://www.goldwaterfire.com/assets/img/og-image.jpg`).
5. Request `/README.md` and `/CLAIMS-TO-VERIFY.md` directly over HTTP and confirm both 404 —
   `netlify.toml` blocks them, but verify post-deploy.
6. **Still open, 2026-08-06:** `Help@goldwaterfire.com` is published on the live site (footer,
   schema, contact page) but no mailbox exists behind it yet — Jake has explicitly deferred this,
   don't let it slide unaddressed once real (non-demo) traffic is expected.
7. This is a static multi-page site (not an SPA) — direct-link/refresh/crawl of every route should
   already work without a rewrite rule, but request each route directly once deployed to confirm.
