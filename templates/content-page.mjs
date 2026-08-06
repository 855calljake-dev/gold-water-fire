import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";

// The reusable template for service, educational, and location pages —
// the page type this whole pipeline exists to generate at volume.
// Field contract (SOP-AGENTIC-SEO-WEBSITES.md §4): slug, title, description,
// h1, breadcrumbLabel, intro, sections[], faqs[], photo, cta, evidence.
export function renderContentPage(data) {
  const {
    path, title, description, h1, breadcrumbLabel, intro,
    sections = [], faqs = [], photo, cta, serviceType, internalLinks = [],
  } = data;

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

  const photoHtml = photo ? `
    <section>
      <div class="wrap">
        <div class="service-photo">
          <img src="${photo.src}" alt="${esc(photo.alt)}" loading="lazy" width="1600" height="893">
        </div>
        <p class="img-note">Illustrative imagery — not a photo of an actual Gold Water Fire job or staff member.</p>
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
    <section class="cta-band">
      <div class="wrap">
        <h2>${esc(cta.heading)}</h2>
        <p>${esc(cta.body)}</p>
        <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
        ${linksHtml ? `<p style="margin-top:16px;font-size:0.85rem">${linksHtml}</p>` : ""}
      </div>
    </section>`;

  return shell({
    path, title, description, h1AsTitle: h1, serviceType, faqs, bodyHtml,
  });
}
