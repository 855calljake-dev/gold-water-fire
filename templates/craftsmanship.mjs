import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";

// The craftsmanship gallery. Real photographs, not generated imagery — the
// only page on the site whose images did not come from the worker's image
// pipeline. Data lives in content/craftsmanship.json; every image there has
// already been deduplicated, EXIF/GPS-stripped, and screened for faces,
// readable documents, and identifying details before it entered the repo
// (gwf-bos LEDGER, 2026-09-02).
//
// Wording rule, from CLAIMS-TO-VERIFY.md: these photos show work by members
// of the team from before Gold Water Fire existed. Page copy and alt text
// credit "members of our team" and never present any photo as a completed
// Gold Water Fire project. No locations, no dates, no per-photo job claims.

const SECTIONS = [
  { key: "kitchen", label: "Kitchens" },
  { key: "bathroom", label: "Bathrooms" },
  { key: "whole-room-result", label: "Finished Rooms" },
  { key: "flooring", label: "Flooring" },
  { key: "painting-finish", label: "Paint and Finish Work" },
  { key: "framing-drywall", label: "Framing and Drywall" },
  { key: "fire-damage", label: "Fire Damage" },
  { key: "water-mitigation", label: "Water Mitigation and Drying" },
  { key: "demo-prep", label: "Demolition and Prep" },
  { key: "exterior-roof", label: "Exterior" },
  { key: "other", label: "On the Job" },
];

export const CREDIT_LINE = "Residential reconstruction work by members of our team.";

function imgCard(img) {
  return `<div class="card has-media"><div class="card-media"><img src="${img.file}" alt="${esc(img.alt)}" loading="lazy" width="${img.width}" height="${img.height}"></div></div>`;
}

export function renderCraftsmanship(craft) {
  const images = craft.images || [];

  const sectionsHtml = SECTIONS.map((s, i) => {
    const group = images.filter((img) => img.category === s.key);
    if (!group.length) return "";
    return `
    <section${i % 2 ? ' class="soft"' : ""} id="${s.key}">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Craftsmanship</span>
          <h2>${esc(s.label)}</h2>
        </div>
        <div class="card-grid">
          ${group.map(imgCard).join("\n          ")}
        </div>
      </div>
    </section>`;
  }).join("\n");

  const bodyHtml = `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / Craftsmanship</div>
        <h1>Craftsmanship</h1>
        <p>Residential reconstruction craftsmanship: the standard our team brings to every job. The photos below show reconstruction work delivered by members of our team across more than a decade in the trade.</p>
      </div>
    </section>
${sectionsHtml}
    <section class="cta-band">
      <div class="wrap">
        <h2>This is the standard we hold on your job</h2>
        <p>${esc(CREDIT_LINE)} Call for a free inspection and see it in person.</p>
        <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
      </div>
    </section>`;

  const featured = images.find((img) => img.featured);

  return shell({
    path: "/craftsmanship.html",
    title: "Craftsmanship | Reconstruction Work by Our Team | Gold Water Fire",
    description:
      "Kitchens, bathrooms, flooring, drying, and rebuild work: photos of residential reconstruction delivered by members of the Gold Water Fire team across their careers.",
    h1AsTitle: "Craftsmanship",
    breadcrumbLabel: "Craftsmanship",
    photo: featured ? { src: featured.file, alt: featured.alt } : undefined,
    datePublished: "2026-09-02",
    bodyHtml,
  });
}

// A three-image strip for content pages, matched to the page's topic and
// varied deterministically by path so neighbouring pages don't repeat the
// same three photos. Returns "" when there is nothing to show, so callers
// can drop it in unconditionally.
export function craftStrip(pagePath, craft) {
  const images = craft?.images;
  if (!images || !images.length) return "";

  const p = pagePath.toLowerCase();
  let pool;
  if (/water|leak|flood|pipe|drain|sewage|sewer|moisture|mold|dry|burst/.test(p)) {
    pool = images.filter((i) => i.category === "water-mitigation");
  } else if (/fire|smoke|soot|burn/.test(p)) {
    pool = images.filter((i) => ["fire-damage", "demo-prep"].includes(i.category));
  } else {
    pool = images.filter((i) =>
      ["kitchen", "bathroom", "whole-room-result", "flooring"].includes(i.category)
    );
  }
  if (pool.length < 3) pool = images;

  let hash = 0;
  for (const ch of pagePath) hash = (hash * 31 + ch.charCodeAt(0)) % pool.length;
  const picks = [0, 1, 2].map((n) => pool[(hash + n) % pool.length]);

  return `
    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Craftsmanship</span>
          <h2>The standard our team works to</h2>
        </div>
        <div class="card-grid">
          ${picks.map(imgCard).join("\n          ")}
        </div>
        <p class="img-note">${esc(CREDIT_LINE)} <a href="/craftsmanship.html">See the full gallery &rarr;</a></p>
      </div>
    </section>`;
}
