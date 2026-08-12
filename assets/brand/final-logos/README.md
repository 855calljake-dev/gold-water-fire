# Gold Water Fire — final logo files

**These are the masters. Send these to printers, sign shops, and apparel
vendors.** Everything here is vector SVG: it prints sharp at any size, from a
favicon to a truck door to a building sign.

## Two typeface sets — pick one and stay with it

| Folder | Typeface | Character |
|---|---|---|
| `sans-montserrat/` | Montserrat | Matches the wordmark on the brand sheet's primary logo. Modern, wide, geometric. |
| `serif-cinzel/` | Cinzel | Matches the typography panel on the brand sheet. Classical, engraved, formal. |

**The brand sheet contradicts itself** — its typography swatch names Cinzel, a
serif, while the logo drawn beside it is set in a sans. Both sets exist here so
that is a choice rather than an accident. **Montserrat is the closer match to
the logo Jake has actually been showing people**, and is the default
recommendation; the double-storey `a` and flat-barred `G` in the sheet's
wordmark rule out Poppins and the other geometric sans candidates.

Whichever you pick, use it everywhere. Two typefaces across shirts, trucks and
signage reads as two companies.

Each folder holds the identical set of twelve files and its own font file.

Anything elsewhere in the repo — including the PNGs in `assets/img/` — is a
derivative for the website. If a file here and a file there disagree, this
folder wins.

---

## What to send, by job

| Job | File |
|---|---|
| T-shirts, polos, hats (light garments) | `lockup-horizontal-full-color.svg` |
| T-shirts, polos, hats (navy/dark garments) | `lockup-horizontal-white.svg` |
| Truck doors and vehicle wrap | `lockup-horizontal-caps-truck.svg` |
| Tall or square space (yard signs, ads) | `lockup-stacked-full-color.svg` |
| Social profile picture, stickers, coins | `badge-round-full-color.svg` |
| **Badge on a white or light page — web, decks, print collateral** | **`badge-round-on-light.svg`** |
| Embroidery, one-colour print, engraving | `phoenix-mark-black.svg` or `-white` |
| App icon, favicon, watermark | `phoenix-mark-full-color.svg` |

**`badge-round-on-light.svg` is the everyday one.** It has no navy disc, so it
drops onto any white or light background without a visible box around it, and
"WATER" is set in midnight blue rather than white — white type on a white
page is invisible, and navy is what the flat lockups already use for that
word. Use `badge-round-full-color.svg` (navy disc) only where the badge needs
to sit on a photo or a dark field.

Every lockup also exists in white and black — use the **white** file on dark
garments and the **black** file for single-colour processes.

## Colours

| Name | Hex | Use |
|---|---|---|
| Desert Gold | `#c9962b` | "Gold", badge ring, mark highlights |
| Midnight Blue | `#0b2545` | "Water", subline, badge field |
| Fire | `#d94f1e` | "Fire", mark |

Ask your printer to colour-match to these hex values. If they need Pantone or
CMYK, have **them** convert — a conversion depends on their press, ink and
substrate, and a number guessed here would be worse than one they pick.

## Typography

**Montserrat Bold** or **Cinzel Bold** depending on the set you chose, both
licensed under the SIL Open Font License. The font file sits in each folder for
anyone setting *new* type in the brand.

You do **not** need it to print these logos — see below.

## What "print-ready" means here, and why it matters

Each file was built and checked against four things:

1. **All type is outlined.** Every letter is a shape, not live text. A printer
   who does not have Cinzel installed cannot accidentally substitute a
   different font — the usual way a logo ships wrong without anyone noticing
   until the boxes arrive.
2. **No external references.** No linked fonts, no linked images. The file is
   self-contained; nothing can go missing in transit.
3. **Physical size is declared** in millimetres alongside the viewBox, so the
   printer's software knows the intended size instead of guessing from pixels.
   Scale proportionally as needed — it is vector, nothing degrades.
4. **Transparent background.** No white box behind the art.

## Two things to tell your printer

**Screen printing:** the full-colour mark contains gradients. Gradients need
either simulated-process printing or a halftone, which costs more screens. For
a cheaper, cleaner shirt, use `lockup-horizontal-white.svg` (one colour) —
that is exactly what the one-colour files are for.

**DTG, vinyl, embroidery digitising, and vehicle wrap** all handle these files
as-is.

## Provenance

The phoenix is traced from the original master painting
(`../gold-water-fire-phoenix-mark.png`, 1462×1858) by hue separation, not
redrawn, so the silhouette matches the artwork the brand already uses. Two
implementation details are load-bearing and commented inside the SVGs — the
warm side is one gradient-filled shape rather than two colour-separated ones,
and the gradients use `userSpaceOnUse`. Both produced visibly wrong output the
other way. Do not "simplify" them without re-rendering and looking.
