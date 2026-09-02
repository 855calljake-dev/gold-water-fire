#!/usr/bin/env node
// Static site generator. Plain Node, zero dependencies, no framework —
// SOP-AGENTIC-SEO-WEBSITES.md §4. Reads content/pages/*.json through the
// shared template, writes static HTML Netlify serves exactly as before.
// Idempotent: safe to run locally or as Netlify's own build command.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderContentPage, renderGuidesIndex, renderAreasIndex } from "../templates/content-page.mjs";
import { renderHome } from "../templates/home.mjs";
import { renderAbout } from "../templates/about.mjs";
import { renderContact } from "../templates/contact.mjs";
import { renderThanks, render404 } from "../templates/simple.mjs";
import { renderCraftsmanship } from "../templates/craftsmanship.mjs";
import { BRAND, absUrl } from "../templates/lib.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGES_DIR = path.join(ROOT, "content", "pages");

async function loadPageData() {
  const files = (await readdir(PAGES_DIR)).filter((f) => f.endsWith(".json"));
  const pages = [];
  for (const f of files) {
    const raw = await readFile(path.join(PAGES_DIR, f), "utf8");
    pages.push(JSON.parse(raw));
  }
  return pages;
}

function outPathFor(urlPath) {
  // "/" -> "<root>/index.html"
  // "/water-damage-restoration.html" -> "<root>/water-damage-restoration.html"
  // "/peoria/water-damage-restoration.html" -> nested dir, created as needed
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  return path.join(ROOT, rel);
}

async function writeHtml(urlPath, html) {
  const out = outPathFor(urlPath);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");
  return urlPath;
}

async function buildSitemap(urlPaths) {
  const urls = urlPaths
    .filter((p) => !["/thanks.html", "/404.html"].includes(p))
    .map((p) => `  <url><loc>${absUrl(p)}</loc></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  await writeFile(path.join(ROOT, "sitemap.xml"), xml, "utf8");
}

// IndexNow: push new/changed URLs to Bing/Yandex/Naver/Seznam on publish.
// Google doesn't support IndexNow (SOP-AGENTIC-SEO-WEBSITES.md §3.1) — this
// is for the other engines only. Verification key file lives at repo root:
// <key>.txt containing the key itself, matching keyLocation below.
const INDEXNOW_KEY = "a489af8cc4dde1196efe6d29cce4c5fb";

async function pingIndexNow(urlPaths) {
  if (process.env.CONTEXT !== "production") return; // only real deploys, not previews/local builds
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "www.goldwaterfire.com",
        key: INDEXNOW_KEY,
        keyLocation: absUrl(`/${INDEXNOW_KEY}.txt`),
        urlList: urlPaths.map((p) => absUrl(p)),
      }),
    });
    console.log(`IndexNow: submitted ${urlPaths.length} URLs, status ${res.status}`);
  } catch (err) {
    // Non-fatal — a failed ping must never break the build.
    console.warn("IndexNow submission failed (non-fatal):", err.message);
  }
}

async function buildLlmsTxt(pages) {
  // Emerging AI-crawler standard, SOP-AGENTIC-SEO-WEBSITES.md §3. Cheap,
  // curated pointer to what matters on the site — not auto-dumping everything.
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> Fire and water damage restoration and reconstruction contractor serving the Phoenix, Arizona metro area. Licensed ${BRAND.license}. Phone ${BRAND.phone}.`,
    "",
    "## Core pages",
    "",
    `- [Home](${absUrl("/")}): overview, service area, and contact`,
    `- [About](${absUrl("/about.html")}): company and team`,
    `- [Craftsmanship](${absUrl("/craftsmanship.html")}): photo gallery of reconstruction work by members of the team`,
    `- [Contact](${absUrl("/contact.html")})`,
  ];
  const byType = { service: [], educational: [], location: [] };
  for (const p of pages) (byType[p.type] || (byType[p.type] = [])).push(p);

  if (byType.service?.length) {
    lines.push("", "## Services", "");
    for (const p of byType.service) lines.push(`- [${p.h1}](${absUrl(p.path)})`);
  }
  if (byType.location?.length) {
    lines.push("", "## Service areas", "");
    for (const p of byType.location) lines.push(`- [${p.h1}](${absUrl(p.path)})`);
  }
  if (byType.educational?.length) {
    lines.push("", "## Guides", "");
    for (const p of byType.educational) lines.push(`- [${p.h1}](${absUrl(p.path)})`);
  }
  await writeFile(path.join(ROOT, "llms.txt"), lines.join("\n") + "\n", "utf8");
}

async function main() {
  const pages = await loadPageData();
  // Real-photo gallery data (content/craftsmanship.json). Loaded here once
  // and passed down: the gallery page renders all of it, home renders the
  // featured six, and every content page gets a topic-matched three-image
  // strip. A missing file degrades to no strips rather than a failed build.
  let craft = null;
  try {
    craft = JSON.parse(await readFile(path.join(ROOT, "content", "craftsmanship.json"), "utf8"));
  } catch {
    console.warn("content/craftsmanship.json not found; building without craftsmanship strips");
  }
  const written = [];

  for (const data of pages) {
    const html = renderContentPage(data, pages, craft);
    written.push(await writeHtml(data.path, html));
  }

  if (craft) written.push(await writeHtml("/craftsmanship.html", renderCraftsmanship(craft)));

  // Checklist item 15: the guides hub. Generated from the same page data, so
  // every future educational page appears here with zero extra effort.
  written.push(await writeHtml("/guides/index.html", renderGuidesIndex(pages)));
  // Companion hub for the location pages, split out of /guides/ so each list
  // stays about one thing. Same generation model: every future city page
  // appears here automatically.
  written.push(await writeHtml("/service-areas/index.html", renderAreasIndex(pages)));

  written.push(await writeHtml("/", renderHome(craft)));
  written.push(await writeHtml("/about.html", renderAbout()));
  written.push(await writeHtml("/contact.html", renderContact()));
  written.push(await writeHtml("/thanks.html", renderThanks()));
  written.push(await writeHtml("/404.html", render404()));

  await buildSitemap(written);
  await buildLlmsTxt(pages);
  await pingIndexNow(written.filter((p) => !["/thanks.html", "/404.html"].includes(p)));

  console.log(`Built ${written.length} pages + sitemap.xml + llms.txt`);
  for (const p of written) console.log("  " + p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
