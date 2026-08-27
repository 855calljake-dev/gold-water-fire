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
recognizable people), Gold Water Fire has no completed jobs yet to photograph. Replace with real job
photography as real jobs are completed and rights-cleared; swap the file in place once real.

**Watermarking, corrected 2026-08-26.** ~~Every such image carries a watermark (phoenix mark +
wordmark) burned in via `assets/brand/gold-water-fire-phoenix-mark.png`.~~ That was never true of
worker output and has not been true of the site since the worker started drafting. **Exactly four
images carry the navy "GOLD WATER FIRE" band**, all four hand-made and all four added in the initial
build (`12f0990`): `fire-smoke-damage-restoration-cleanup`, `reconstruction-rebuild-restoration`,
`restoration-contractor-phoenix-az-metro-home-exterior`, and
`water-damage-restoration-drying-equipment`. The fifth hand-made image, the night hero, deliberately
carries none because HTML text sits over it. **`worker/image.mjs` has never composited a mark**, and
`composite` appears nowhere in `worker/`, at any commit. So the remaining ~106 images, every one the
worker has ever produced, are unmarked.

Measured, not eyeballed: all 111 live images were run through `worker/imageTextGate.mjs`, and those
four are the only ones whose brand tokens OCR reads at all (confidence 96 and 97).

**This is recorded, not resolved.** Whether the site should mark all of its images, or none, or keep
the four as they are, is Jake's call. `bytomorrow-bos` `SOP-AGENTIC-SEO-WEBSITES.md` §8.3 is explicit
that a tenant's existing mark convention is not stripped on a session's own initiative, and §8.3's
own text currently describes this tenant as carrying no mark at all, which is the other half of the
same error. The text gate allowlists `GOLD`, `WATER` and `FIRE` so the four keep passing either way.

**Captions (`bytomorrow-bos` `SOP-AGENTIC-SEO-WEBSITES.md` §8.3, Jake's ruling 2026-08-09,
cross-tenant):** an image caption is the page's own H1, bare — nothing appended, no disclaimer or
hedge clause about the image not being a real job. ~~A fixed "Illustrative imagery — not a photo of
an actual Gold Water Fire job or staff member." sentence, identical on every image sitewide~~ is
superseded: it was real crawlable page text that said nothing about the page it sat on. Rendered by
the template (`templates/content-page.mjs`, `templates/home.mjs`), never burned into the image file
— the layout layer stays accurate and editable, a burned-in caption doesn't.

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

## Viewing the site locally

```bash
npm run serve
```

Then open **http://localhost:8080** — not the file itself.

Opening `index.html` from Finder will look broken: every asset path in this
site is root-absolute (`/assets/css/style.css`), and under a `file://` URL the
browser resolves that against the filesystem root, not the project folder. The
CSS, images and links all 404 and you get unstyled HTML. It is not a build
problem; the same files work correctly the moment they are served over HTTP.

`npm run serve` builds first, then serves the folder, so what you see is what
Netlify will publish.
