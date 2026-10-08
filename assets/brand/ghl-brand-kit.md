# Gold Water Fire brand kit in GoHighLevel

Loaded 2026-09-16 into the Gold Water Fire sub-account (`locationId` `bvd3wX0RlnicNDrv6Jmt`),
Marketing > Brand Boards. Both halves exist and both are set as the location default:

| Half | Name | Status |
|---|---|---|
| Design Kit (logos, colors, fonts) | Gold Water Fire | Default |
| Brand Voice (tone, audience, positioning) | Gold Water Fire | Default |

This file is the record of what was entered. The masters stay in `final-logos/README.md`; if the
two disagree, the README wins and the board is what needs correcting.

## How it was loaded, and why not by API

The GHL API has `create-design-kit` and `create-brand-voice` under `/brand-boards/locations/{id}/`.
Both the `ghl-gwf` location token and the `ghl-bytomorrow` agency token returned 401
"not authorized for this scope" on `brand-boards/design-kit.*` and `brand-boards/voices.*`
(read 2026-09-16), and the `ghl-gwf` token also 401s on `medias.readonly`. The kit was therefore
built through the dashboard in Jake's own browser session. `ghl-brand-kit.json` next to this file
holds the same content as ready-to-send API payloads for the day a token carries those scopes.

## Logos

Seven files uploaded to the sub-account's Media Storage. Two are placed on the Design Kit:

| Slot | File | Media Storage URL |
|---|---|---|
| Logo 1 | `lockup-horizontal-full-color.svg` | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e1eb5f46f76a8d4ec.svg |
| Logo 2 | `badge-round-on-light.svg` | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e2e74dc3612301c27.svg |

Also in Media Storage, not on a slot:

| File | Media Storage URL |
|---|---|
| `lockup-horizontal-white.svg` (dark backgrounds) | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e9f8b31b6ab52dcf0.svg |
| `lockup-stacked-full-color.svg` | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e1eb5f46f76a8d4eb.svg |
| `badge-round-full-color.svg` (navy disc, for photos) | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e42c38177da78d907.svg |
| `phoenix-mark-full-color.svg` | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422e42c38177da78d912.svg |
| `gold-water-fire-fire-and-water-damage-restoration-phoenix-metro-arizona-logo.png` (1024 px badge) | https://assets.cdn.filesafe.space/bvd3wX0RlnicNDrv6Jmt/media/6aab422f9f8b31b6ab52dd0c.png |

All from the Montserrat set, per the README's recommendation. The location record's own
`logoUrl` (Settings > Business Profile) was not touched; it already carries a badge PNG.

## Colors

| Label | Hex | Source |
|---|---|---|
| Desert Gold | `#c9962b` | brand sheet, site `--gold` |
| White | `#ffffff` | |
| Midnight Blue | `#0b2545` | brand sheet, site `--navy` |
| Fire | `#d94f1e` | brand sheet (the site's `--ember` is `#e2540a`; the sheet value was used, per the README) |
| Water Blue | `#0f6fb0` | site `--water-blue` |
| Ink | `#16202b` | site `--ink`, body text |

## Typography

One font: Montserrat. The README says pick one set and use it everywhere, so Cinzel was not added.

## Brand Voice

Written as Mode 2 business copy. Reader: a Phoenix-metro homeowner in the first hours after a
water or fire loss. Dominant emotion: Overwhelm, so the tactic stack is You're Not Alone, then
Simple Sales Stories, then Problem / Solution / Outcome, with no Timeline Collapse and no urgency
pressure. Only claims confirmed in `CLAIMS-TO-VERIFY.md` appear: 24/7 response, free inspection,
ROC #264344 KB-2, Phoenix metro service area. No IICRC, no "bonded and insured", no response-time
number, no years or project counts.

| Field | Value |
|---|---|
| Type of business | Water Damage Restoration Service (Google category) |
| Tone of voice | Empathetic (dashboard preset) |
| Website | www.goldwaterfire.com |
| Email | Help@goldwaterfire.com |
| Address | 221 E Willis Rd Ste 8, Chandler, AZ 85286 |
| Phone | +1 480 999 3339 |
| Business hours | 24/7 emergency response. Office in Chandler, Arizona. |
| Target audience | Homeowners and small commercial property owners across the Phoenix metro who have just had a pipe burst, a flood, a fire, or smoke damage. Most have never filed a property claim. Many are reading on a phone while standing in the damage. |
| Customer pain points | They do not know what to do first. Water is spreading or the house smells of smoke. They are worried about mold, about what insurance will cover, and about being taken advantage of by a contractor who shows up fast and talks faster. They want one person who will tell them the truth and handle it. |
| Brand promise | We answer, we come, and we stay with you from the first hour through the last coat of paint. |
| Brand values | Tell the truth about the damage. Do the work right. Treat the home as if it were our own. We oppose scare tactics, pressure signatures, and contractors who disappear after the emergency is over. |
| What the brand does | Fire and water damage restoration and reconstruction for homes and businesses across the Phoenix metro: emergency water extraction, structural drying, smoke and soot cleanup, odor removal, and the full rebuild afterward. |
| Better than competitors | One Arizona-licensed contractor for both the emergency cleanup and the rebuild, so the homeowner is never handed off between companies. AZ ROC #264344 (KB-2). Free inspection. Based in Chandler and serving the whole Phoenix metro. |
| Unique selling proposition | Emergency mitigation and full reconstruction under one Arizona-licensed contractor, with a free inspection and a 24/7 phone line that explains the next step in plain words. |
| Risks of inaction | Water that sits moves into drywall, cabinets, and subfloor, and mold can follow. Soot and smoke residue set into surfaces the longer they wait. Damage that is not documented early is harder to get covered. |
| Call to action | Call (480) 999-3339, day or night, or request a free inspection at goldwaterfire.com. |

The dashboard form has no free-text tone field. The longer tone guidance (short sentences, name
the feeling first, no countdown pressure, no em dashes) lives in `ghl-brand-kit.json` under
`brandVoice.answers.toneOfVoice` for the API version.

## Open

- Re-mint the `ghl-gwf` location token with `brand-boards/design-kit.write`,
  `brand-boards/voices.write` and `medias.readonly` if agents should read or edit the board.
  Until then the board is dashboard-only.
