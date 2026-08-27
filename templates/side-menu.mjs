import { esc } from "./lib.mjs";

// The guides side menu (Jake's request, 2026-08-26): a scrolling right-hand
// sidebar on the guides section carrying every topic and every city we serve.
// Generated from the same content/pages data as the rest of the site, so each
// worker batch updates the menu with zero extra effort.
//
// Only the CURRENT page's topic lists its articles in full; other topics show
// a count and link to their section of the /guides/ hub. Deliberate, from the
// 2026-08-26 pre-ship review: embedding every guide title on every page grew
// each page by the size of the whole backlog (+46% at 51 guides, O(n^2) site
// bytes on the way to the 400-page target). Bounded this way, a page's menu
// grows only with its own topic, and the hub still lists everything.
//
// Topics are derived here, at build time, from the page title and slug.
// The page JSON contract has no topic field and the worker does not emit one;
// if a page ever carries an explicit `topic` matching a key below, it wins
// over the keyword rules. Rules are ordered: first match takes the page.
export const TOPICS = [
  {
    key: "insurance",
    label: "Insurance & Claims",
    match: /insurance|claim|coverage|adjuster|responsib|landlord|living expenses/i,
  },
  {
    key: "fire",
    label: "Fire & Smoke Damage",
    match: /fire|smoke|soot|wildfire/i,
  },
  {
    key: "reconstruction",
    label: "Reconstruction & Rebuild",
    match: /reconstruction|rebuild|permit|patch/i,
  },
  {
    key: "process",
    label: "The Restoration Process",
    match: /restoration|drying|mitigation|crew|mold|category|carpet|salvage|document|hidden water/i,
  },
  {
    key: "water",
    label: "Water Damage Causes & Emergencies",
    match: /water|pipe|leak|drainage|monsoon|flood|sewer|toilet|overflow|heater|softener|dishwasher|ice maker|washing machine|supply line|condensate|pool|irrigation|slab|shower pan|window seal|gutter|foundation/i,
  },
];
const FALLBACK = { key: "more", label: "More Guides" };

export function topicOf(page) {
  const explicit = TOPICS.find((t) => t.key === page.topic);
  if (explicit) return explicit;
  const haystack = `${page.h1 || ""} ${page.slug || ""}`;
  return TOPICS.find((t) => t.match.test(haystack)) || FALLBACK;
}

// Groups educational pages by topic, in TOPICS order, alphabetical inside
// each group. Used by both the side menu and the /guides/ hub so the two can
// never disagree about which topic a guide belongs to.
export function groupGuidesByTopic(pages) {
  const guides = pages.filter((p) => p.type === "educational");
  const groups = new Map();
  for (const g of guides) {
    const t = topicOf(g);
    if (!groups.has(t.key)) groups.set(t.key, { ...t, pages: [] });
    groups.get(t.key).pages.push(g);
  }
  const ordered = [...TOPICS, FALLBACK]
    .map((t) => groups.get(t.key))
    .filter(Boolean);
  for (const g of ordered) g.pages.sort((a, b) => (a.h1 || "").localeCompare(b.h1 || ""));
  return ordered;
}

const prettyCity = (slug) =>
  slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// City slugs come from the URL, same derivation as renderAreasIndex: location
// pages live at /<city>/<service>.html by construction.
export function cityListOf(pages) {
  const cities = new Set();
  for (const p of pages) {
    if (p.type !== "location") continue;
    const m = p.path.match(/^\/([^/]+)\//);
    if (m) cities.add(m[1]);
  }
  return [...cities].sort();
}

export function renderSideMenu(pages, currentPath) {
  const groups = groupGuidesByTopic(pages);
  const cities = cityListOf(pages);
  const currentPage = pages.find((p) => p.path === currentPath);
  const currentTopicKey = currentPage ? topicOf(currentPage).key : null;

  const link = (p) => {
    const current = p.path === currentPath;
    return `<li${current ? ' class="current"' : ""}><a href="${p.path}"${current ? ' aria-current="page"' : ""}>${esc(p.h1)}</a></li>`;
  };

  const topicBlocks = groups
    .map((g) => {
      const heading = `<h3><a href="/guides/#topic-${esc(g.key)}">${esc(g.label)} <span class="count">(${g.pages.length})</span></a></h3>`;
      if (g.key !== currentTopicKey) {
        return `
        <div class="side-menu-group">
          ${heading}
        </div>`;
      }
      return `
        <div class="side-menu-group open">
          ${heading}
          <ul>
            ${g.pages.map(link).join("\n            ")}
          </ul>
        </div>`;
    })
    .join("\n");

  const cityLinks = cities
    .map((c) => `<li><a href="/service-areas/#${esc(c)}">${esc(prettyCity(c))}</a></li>`)
    .join("\n            ");

  return `
      <aside class="side-menu" aria-label="All guides and service areas">
        <nav>
          <h2 class="side-menu-head"><a href="/guides/">All Guides</a></h2>
${topicBlocks}
          <h2 class="side-menu-head"><a href="/service-areas/">Cities We Serve</a></h2>
          <div class="side-menu-group">
            <ul class="side-menu-cities">
            ${cityLinks}
            </ul>
          </div>
        </nav>
      </aside>`;
}

// Wraps a page body in the two-column guides layout: content left, the
// scrolling menu right. Below the grid breakpoint the menu drops under the
// content (source order), so nothing is hidden on a phone.
export function withSideMenu(mainHtml, pages, currentPath) {
  return `
    <div class="wrap guide-layout">
      <div class="guide-main">
${mainHtml}
      </div>
${renderSideMenu(pages, currentPath)}
    </div>`;
}
