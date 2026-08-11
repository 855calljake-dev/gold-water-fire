import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";

// The reusable template for service, educational, and location pages —
// the page type this whole pipeline exists to generate at volume.
// Field contract (SOP-AGENTIC-SEO-WEBSITES.md §4): slug, title, description,
// h1, breadcrumbLabel, intro, sections[], faqs[], photo, cta, evidence,
// datePublished (set once, at first draft), dateModified (updated on every
// content edit) — Tier-1 checklist item 13, BYTOMORROW-TECH-STACK.md.
export function renderContentPage(data, allPages = []) {
  const {
    path, title, description, h1, breadcrumbLabel, intro,
    sections = [], faqs = [], photo, cta, serviceType, internalLinks = [],
    datePublished, dateModified,
  } = data;

  // Checklist item 15 + SOP §3.2: cross-links are the topical-cluster signal
  // and must exist in the page itself. Same-type pages first, self excluded.
  const others = allPages.filter((p) => p.path !== path);
  const related = [
    ...others.filter((p) => p.type === data.type),
    ...others.filter((p) => p.type !== data.type),
  ].slice(0, 3);
  const relatedHtml = related.length
    ? `
    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Keep reading</span>
          <h2>More from Gold Water Fire</h2>
        </div>
        <div class="card-grid">
          ${related.map((p) => `<div class="card"><h3><a href="${p.path}">${esc(p.h1)}</a></h3><p>${esc(p.description)}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>`
    : "";

  const sectionsHtml = sections.map((s) => {
    if (s.cards) {
      return `
    <section${s.soft ? ' class="soft"' : ""}>
      <div class="wrap">
        <div class="section-head">
          ${s.eyebrow ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ""}
          <h2>${esc(s.heading)}</h2>
          ${s.body ? `<p>${s.body}</p>` : ""}
        </div>
        <div class="card-grid">
          ${s.cards.map((c) => `<div class="card"><h3>${esc(c.heading)}</h3><p>${c.body}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>`;
    }
    return `
    <section${s.soft ? ' class="soft"' : ""}>
      <div class="wrap">
        <div class="section-head">
          ${s.eyebrow ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ""}
          <h2>${esc(s.heading)}</h2>
          <p>${s.body}</p>
        </div>
      </div>
    </section>`;
  }).join("\n");

  const faqHtml = faqs.length ? `
    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Common Questions</span>
          <h2>Questions people ask us</h2>
        </div>
        <div class="process-list" style="max-width:820px">
          ${faqs.map((f) => `<div><h4 style="margin-bottom:6px">${esc(f.q)}</h4><p style="margin:0;color:var(--muted)">${f.a}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>` : "";

  // SOP-AGENTIC-SEO-WEBSITES.md §8.3, Jake's ruling 2026-08-09, cross-tenant:
  // the caption is the page's own H1, bare — nothing appended, no disclaimer
  // clause. It replaced a fixed sentence repeated identically on every image
  // sitewide, which was real crawlable text that said nothing about the page
  // it sat on. Reference implementation: jaketaylor-home-loans's
  // templates/content-page.mjs. That one is a <figcaption> because its markup
  // is a <figure>; this stays a <p class="img-note"> because .service-photo
  // clips its children (border-radius + overflow:hidden) — the ruling is about
  // what the caption says, not which element carries it.
  const photoHtml = photo ? `
    <section>
      <div class="wrap">
        <div class="service-photo">
          <img src="${photo.src}" alt="${esc(photo.alt)}" loading="lazy" width="1600" height="893">
        </div>
        <p class="img-note">${esc(h1)}</p>
      </div>
    </section>` : "";

  const linksHtml = internalLinks.length ? ` ${internalLinks.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join(" &middot; ")}` : "";

  const bodyHtml = `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / ${esc(breadcrumbLabel)}</div>
        <h1>${esc(h1)}</h1>
        <p>${intro}</p>
      </div>
    </section>
${photoHtml}
${sectionsHtml}
${faqHtml}
${relatedHtml}
    <section class="cta-band">
      <div class="wrap">
        <h2>${esc(cta.heading)}</h2>
        <p>${esc(cta.body)}</p>
        <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
        ${linksHtml ? `<p style="margin-top:16px;font-size:0.85rem">${linksHtml}</p>` : ""}
      </div>
    </section>`;

  return shell({
    path, title, description, h1AsTitle: h1, serviceType, faqs, breadcrumbLabel, photo,
    datePublished, dateModified, bodyHtml,
  });
}

// The guides hub — checklist item 15. Educational pages front and center,
// service and location pages listed below so the hub also strengthens their
// internal linking. Uses the shared shell: nav, footer, schema all standard.
export function renderGuidesIndex(pages) {
  const guides = pages.filter((p) => p.type === "educational");
  const rest = pages.filter((p) => p.type !== "educational");

  const card = (p) =>
    `<div class="card"><h3><a href="${p.path}">${esc(p.h1)}</a></h3><p>${esc(p.description)}</p><p style="font-size:0.8rem;opacity:0.7">Updated ${esc(p.dateModified || p.datePublished || "")}</p></div>`;

  const bodyHtml = `
    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Guides</span>
          <h2>Straight answers about water and fire damage</h2>
          <p>Written plainly, one question per page — what to do, what to expect, and what actually matters when it happens to your home.</p>
        </div>
        <div class="card-grid">
          ${guides.map(card).join("\n          ")}
        </div>
      </div>
    </section>
    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Services</span>
          <h2>When you need us, not a guide</h2>
        </div>
        <div class="card-grid">
          ${rest.map(card).join("\n          ")}
        </div>
      </div>
    </section>`;

  const newest = pages.map((p) => p.dateModified || p.datePublished).filter(Boolean).sort().at(-1);

  return shell({
    path: "/guides/",
    title: "Water & Fire Damage Guides | Gold Water Fire",
    description:
      "Plain-language guides on water damage, fire damage, insurance, and what to expect from a restoration crew — from Gold Water Fire in Phoenix.",
    h1AsTitle: "Guides",
    breadcrumbLabel: "Guides",
    datePublished: "2026-08-10",
    dateModified: newest || "2026-08-10",
    bodyHtml,
  });
}
