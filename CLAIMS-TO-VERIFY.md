# CLAIMS TO VERIFY — Gold Water Fire

**Gate, not a to-do list.** Nothing in this file appears on the live site until Jake confirms it in
writing and this file is updated to say so. Built from day one per Jake's kickoff instruction —
do not bolt this on later, and do not let a claim slide onto a page "temporarily."

| Claim | Status | Where it would appear | Note |
|---|---|---|---|
| IICRC firm certification | **UNVERIFIED — do not display** | Trust badges, About, Services | Common in this trade (see reference site) but not confirmed for Gold Water Fire. No cert number, no badge, no "IICRC certified" language anywhere on the site until Jake supplies it. |
| Bonded / insured status | **UNVERIFIED — do not display** | Trust badges, footer, About | Do not print "licensed, bonded, and insured" as a block — only the AZ ROC license (#264344 · KB-2) is confirmed. |
| Customer testimonials / reviews | **UNVERIFIED — do not display** | Homepage, About, dedicated testimonials section | No testimonial content exists yet. No star ratings, review counts, or quoted customers anywhere on the site. |
| Team photos | **UNVERIFIED — do not display** | About page team roster | Team roster (names, roles) is confirmed and used; photos are not. Roster renders as text/initials only, no headshots, until real photos are supplied and rights-cleared. |
| 24/7 emergency availability | **CONFIRMED 2026-08-07** | Hero, top bar, Services, Contact | Jake confirmed directly: "we need to have a '24/7 Services'" on the homepage. Safe to display "24/7" / "24/7 Emergency Response" as-is. From 2026-08-13 to 2026-08-26 the drafting gate contradicted this row (a forbidden pattern rejected any 24/7 mention) and de-graduated the tenant over it on 2026-08-23; pattern removed 2026-08-26, issue #22. When a gate and this register disagree, this register wins and the gate is the bug. |
| Specific numeric response time (e.g. "1-hour response") | **STILL UNVERIFIED — do not display a number** | Hero, Services, Contact | Separate from the 24/7 availability claim above. The reference site advertises 1–2 hour response; that number is theirs, not confirmed for Gold Water Fire. Do not print any specific hour/minute response-time claim until Jake confirms one. |
| Years in business / project count | **UNVERIFIED — do not display** | About, trust badges | Brandon Gurr's "5,000+ projects" is his own résumé from Gurr Brothers Construction, not a Gold Water Fire company track record — never presented as the company's number. No separate GWF years-in-business or project-count claim exists. |
| Specific service-area city list | **CONFIRMED 2026-08-06 — see below** | Service area section, footer, location pages | Jake confirmed: the full Phoenix metro area, named boundaries "NW Peoria, SE Avondale, SW San Tan Valley, NW Apache Junction, and even outlying areas further than that." Safe to use as-is for the general service-area claim and as the basis for location pages. |
| Free inspection offer | **CONFIRMED 2026-08-07** | Homepage, share/OG image, Contact, Services | Jake confirmed directly, as a part owner of Gold Water Fire: "I will give a free inspection." Safe to use "Free Inspection" as a CTA/offer as-is. No specific inspection duration, scope, or fine print confirmed — don't invent detail beyond "free inspection" itself. |

## Verified facts (safe to use as-is)

- Phone: (480) 999-3339
- Address: 221 E Willis Rd Ste 8, Chandler, AZ 85286
- AZ ROC license: #264344 · KB-2
- Co-founders: Jim Bennett and Jake Taylor
- Brandon Gurr: Construction Manager (formerly Gurr Brothers Construction — his own résumé, not a Gold Water Fire track record)
- Team: Kristine (Office Admin), Brooke (Water and Mitigation Scheduling Assistant), Johnny (Reconstruction Team Lead)
- Legal entity: ADL Solutions, Inc (current — expected to change; do not print the entity name as the public-facing brand)
- Launch email: Help@goldwaterfire.com
- Display name is three separate capitalized words: **Gold Water Fire** — never run together
- **Service area (confirmed 2026-08-06):** the full Phoenix metro area. Jake's own words: "NW
  Peoria, SE Avondale, SW San Tan Valley, NW Apache Junction, and even outlying areas further than
  that." The core location-page list derived from this (`content/backlog.json`) is a standard
  Phoenix-metro municipality list bounded by those four points — Phoenix, Mesa, Chandler, Scottsdale,
  Glendale, Gilbert, Tempe, Peoria, Surprise, Avondale, Goodyear, Buckeye, Apache Junction, Queen
  Creek, San Tan Valley, Fountain Hills, Paradise Valley, Cave Creek, El Mirage, Tolleson, Litchfield
  Park. This list is *derived*, not dictated word-for-word by Jake — reasonable to build against, but
  flag any single city page to him if it's ever in question rather than assume.

## Resolved during this session

- **Phoenix mark** — found in `~/Downloads/GWF - Phoenix.jpg` and `GWF - Logo and Typography
  Sheet.png` (survived the earlier GoldWaterFire repo/folder deletion because they were saved to
  Downloads, not inside the deleted project). Processed into
  `assets/brand/gold-water-fire-phoenix-mark.png` (transparent) and wired into the header, footer,
  favicon, apple-touch-icon, and OG image. Brand colors confirmed from the sheet: Gold = gold/amber,
  Water = navy blue, Fire = red-orange — CSS updated to match sampled hex values.
- **Site imagery** — no real Gold Water Fire before/after job photos exist (the company has no
  completed jobs yet). Checked ADL Solutions' `07 Marketing/Showcase` archive on Jake's suggestion;
  it turned out to be ADL's accessibility-modification (ramp/ADA) portfolio for named individual
  clients — veterans, elderly, tribal Medicaid recipients — a different trade and a different
  consent scope, not reused here. Used Higgsfield-generated illustrative imagery instead (no real
  recognizable people, watermarked). ~~Captioned "Illustrative imagery" on every page it appears~~
  — superseded 2026-08-10: the caption is now the page's own H1, bare, per `bytomorrow-bos`
  `SOP-AGENTIC-SEO-WEBSITES.md` §8.3. **This does not relax anything on this list.** Nothing here
  was ever gated on that caption; the imagery is still illustrative and still must not be presented
  as a completed Gold Water Fire job in surrounding page copy, alt text, or JSON-LD.
  Replace with real photos once Gold Water Fire completes and rights-clears actual jobs.
- **Tier-1 checklist items 12–14 (2026-08-07)** — audited live against production, all three real:
  `og:image` was the sitewide default on every page regardless of the page's own photo; no page
  anywhere carried `datePublished`/`dateModified` in any form; JSON-LD never emitted `ImageObject`
  even on photo pages. Fixed in the shared shell (`templates/shell.mjs`): `og:image` now resolves to
  `photo.src` when present, falling back to the sitewide default only when a page has none;
  `datePublished`/`dateModified` added to the content-page field contract and to `home.mjs`/
  `about.mjs`/`contact.mjs` directly (real dates pulled from git history, not fabricated), rendered
  as `article:published_time`/`article:modified_time` OG tags and as a `WebPage` node in the same
  `@graph`; `ImageObject` added to the graph whenever a page has a photo. `thanks.html`/`404.html`
  (noindex, excluded from the sitemap already) deliberately carry no date metadata — out of scope,
  not an oversight. Verified live post-deploy, not just in the build output.
