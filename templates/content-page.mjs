import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";
import { withSideMenu, groupGuidesByTopic } from "./side-menu.mjs";

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

  const heroHtml = `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / ${esc(breadcrumbLabel)}</div>
        <h1>${esc(h1)}</h1>
        <p>${intro}</p>
      </div>
    </section>`;

  const articleHtml = `
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

  // Guides get the two-column layout with the scrolling side menu (Jake,
  // 2026-08-26). Service and location pages keep the full-width layout: the
  // menu is the guides section's index, not sitewide chrome.
  const bodyHtml =
    data.type === "educational"
      ? heroHtml + withSideMenu(articleHtml, allPages, path)
      : heroHtml + articleHtml;

  return shell({
    path, title, description, h1AsTitle: h1, serviceType, faqs, breadcrumbLabel, photo,
    datePublished, dateModified, bodyHtml,
  });
}

// The guides hub — checklist item 15. Educational pages front and center,
// service and location pages listed below so the hub also strengthens their
// internal linking. Uses the shared shell: nav, footer, schema all standard.
export function renderGuidesIndex(pages) {
  // Services only. Location pages moved to /service-areas/ on 2026-08-12:
  // this hub used to list every non-guide page, so the five actual guides sat
  // in a list alongside every city page under a heading promising
  // "plain-language guides". The worker adds a location page per city per
  // service, so that list was on its way to ~100 entries with the guides
  // buried in it.
  const services = pages.filter((p) => p.type === "service");

  const card = (p) =>
    `<div class="card"><h3><a href="${p.path}">${esc(p.h1)}</a></h3><p>${esc(p.description)}</p><p style="font-size:0.8rem;opacity:0.7">Updated ${esc(p.dateModified || p.datePublished || "")}</p></div>`;

  // Grouped by topic since 2026-08-26, same reasoning as the 2026-08-12
  // split above one step further: a flat list was readable at 5 guides and
  // is not at 50, and the backlog is headed for hundreds. Topic ids are the
  // side menu's anchor targets.
  const topicSections = groupGuidesByTopic(pages)
    .map(
      (g, i) => `
    <section${i % 2 ? ' class="soft"' : ""} id="topic-${g.key}">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Guides</span>
          <h2>${esc(g.label)}</h2>
        </div>
        <div class="card-grid">
          ${g.pages.map(card).join("\n          ")}
        </div>
      </div>
    </section>`
    )
    .join("\n");

  const introHtml = `
    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Guides</span>
          <h2>Straight answers about water and fire damage</h2>
          <p>Written plainly, one question per page: what to do, what to expect, and what actually matters when it happens to your home.</p>
        </div>
      </div>
    </section>`;

  const servicesHtml = `
    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Services</span>
          <h2>When you need us, not a guide</h2>
        </div>
        <div class="card-grid">
          ${services.map(card).join("\n          ")}
        </div>
        <p style="margin-top:18px"><a href="/service-areas/">See every city we serve →</a></p>
      </div>
    </section>`;

  const bodyHtml = introHtml + withSideMenu(topicSections + servicesHtml, pages, "/guides/");

  const newest = pages.map((p) => p.dateModified || p.datePublished).filter(Boolean).sort().at(-1);

  return shell({
    path: "/guides/",
    title: "Water & Fire Damage Guides | Gold Water Fire",
    description:
      "Plain-language guides on water damage, fire damage, insurance, and what to expect from a restoration crew, from Gold Water Fire in Phoenix.",
    h1AsTitle: "Guides",
    breadcrumbLabel: "Guides",
    datePublished: "2026-08-10",
    dateModified: newest || "2026-08-10",
    bodyHtml,
  });
}

// The service-areas hub. Split out of the guides hub on 2026-08-12 — see the
// note in renderGuidesIndex for why.
//
// Grouped by city rather than listed flat, because the worker's backlog is
// city x service: a flat list repeats "Water Damage Restoration in ..." down
// the page and gets unreadable at the ~100 pages the backlog holds. Grouping
// also matches how someone actually looks for this ("do they cover Gilbert?").
//
// City is derived from the URL, not from a field. Location pages live at
// /<city>/<service>.html by construction, so the path is the one thing
// guaranteed to be present and correct on every one of them.
export function renderAreasIndex(pages) {
  const locations = pages.filter((p) => p.type === "location");
  const services = pages.filter((p) => p.type === "service");

  const cityOf = (p) => (p.path.match(/^\/([^/]+)\//) || [, ""])[1];
  const pretty = (slug) =>
    slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const byCity = new Map();
  for (const p of locations) {
    const c = cityOf(p);
    if (!byCity.has(c)) byCity.set(c, []);
    byCity.get(c).push(p);
  }
  const cities = [...byCity.keys()].sort();

  // The id is the anchor target the guides side menu links to, /service-areas/#<city>.
  const cityBlock = (c) => `
          <div class="card" id="${esc(c)}">
            <h3>${esc(pretty(c))}, AZ</h3>
            <ul style="margin:8px 0 0;padding-left:18px">
              ${byCity.get(c)
                .sort((a, b) => a.h1.localeCompare(b.h1))
                .map((p) => `<li><a href="${p.path}">${esc(p.h1)}</a></li>`)
                .join("\n              ")}
            </ul>
          </div>`;

  const serviceCard = (p) =>
    `<div class="card"><h3><a href="${p.path}">${esc(p.h1)}</a></h3><p>${esc(p.description)}</p></div>`;

  const bodyHtml = `
    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Service Areas</span>
          <h2>Where Gold Water Fire works</h2>
          <p>Based in Chandler and working across the greater Phoenix metro area. Pick your city for what restoration and rebuild look like where you live.</p>
        </div>
        <div class="card-grid">${cities.map(cityBlock).join("")}
        </div>
      </div>
    </section>
    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Services</span>
          <h2>What we do, wherever you are</h2>
        </div>
        <div class="card-grid">
          ${services.map(serviceCard).join("\n          ")}
        </div>
        <p style="margin-top:18px">Not sure where to start? <a href="/guides/">Read the guides</a> or <a href="/contact.html">get a free inspection</a>.</p>
      </div>
    </section>`;

  const newest = locations.map((p) => p.dateModified || p.datePublished).filter(Boolean).sort().at(-1);

  return shell({
    path: "/service-areas/",
    title: "Service Areas | Fire & Water Damage Restoration Across Phoenix Metro | Gold Water Fire",
    description:
      "Cities Gold Water Fire serves across the Phoenix, AZ metro: fire and water damage restoration and reconstruction in Mesa, Chandler, Phoenix and the surrounding valley.",
    h1AsTitle: "Service Areas",
    breadcrumbLabel: "Service Areas",
    datePublished: "2026-08-12",
    dateModified: newest || "2026-08-12",
    bodyHtml,
  });
}
