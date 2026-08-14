import { BRAND, esc, absUrl } from "./lib.mjs";

const NAV = [
  { href: "/water-damage-restoration.html", label: "Water Damage" },
  { href: "/fire-damage-restoration.html", label: "Fire Damage" },
  { href: "/reconstruction.html", label: "Reconstruction" },
  // Checklist item 15 (BYTOMORROW-TECH-STACK.md): content pages must be
  // reachable from human nav, not only the sitemap. Before this link the
  // five guides were orphans and /guides/ itself 404'd.
  { href: "/guides/", label: "Guides" },
  // Same reasoning as the Guides link above, one step further. The worker
  // publishes a location page per city per service, so this list grows without
  // anyone touching the nav. Before this hub existed every one of them was
  // dumped onto /guides/ under a heading about plain-language guides, which is
  // wrong for the reader and dilutes the guides' own keyword focus.
  { href: "/service-areas/", label: "Service Areas" },
  { href: "/about.html", label: "About" },
  { href: "/contact.html", label: "Contact" },
];

function localBusinessSchema() {
  return {
    "@type": "HomeAndConstructionBusiness",
    name: BRAND.name,
    telephone: "+1-480-999-3339",
    email: BRAND.email,
    url: BRAND.siteUrl + "/",
    address: {
      "@type": "PostalAddress",
      streetAddress: BRAND.addressLine1,
      addressLocality: BRAND.city,
      addressRegion: BRAND.region,
      postalCode: BRAND.postalCode,
      addressCountry: "US",
    },
    areaServed: { "@type": "AdministrativeArea", name: "Phoenix Metropolitan Area, Arizona" },
    // Google reads these for the knowledge panel and both were simply absent,
    // so nothing on the site ever told it which image is the logo. Raster on
    // purpose: the structured-data guidance wants a crawlable image, and PNG
    // is the safe answer while SVG support across their tooling is uneven.
    logo: absUrl("/assets/img/logo-badge-512.png"),
    image: absUrl("/assets/img/logo-badge-512.png"),
  };
}

function serviceSchema(serviceType) {
  return {
    "@type": "Service",
    serviceType,
    provider: { "@type": "HomeAndConstructionBusiness", name: BRAND.name, telephone: "+1-480-999-3339" },
    areaServed: { "@type": "AdministrativeArea", name: "Phoenix Metropolitan Area, Arizona" },
  };
}

function faqSchema(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function breadcrumbSchema(breadcrumbLabel, path) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: breadcrumbLabel, item: absUrl(path) },
    ],
  };
}

function imageObjectSchema(photo) {
  return {
    "@type": "ImageObject",
    url: absUrl(photo.src),
    contentUrl: absUrl(photo.src),
    description: photo.alt,
  };
}

function webPageSchema({ path, datePublished, dateModified }) {
  return {
    "@type": "WebPage",
    "@id": absUrl(path) + "#webpage",
    url: absUrl(path),
    datePublished,
    dateModified: dateModified || datePublished,
  };
}

// Stacked schema per SOP-AGENTIC-SEO-WEBSITES.md §3 — LocalBusiness + Service + FAQ +
// BreadcrumbList + ImageObject + WebPage (dates) together outperforms a single schema
// type for AI citation. BYTOMORROW-TECH-STACK.md Tier-1 checklist item 14.
function schemaBlock({ serviceType, faqs, breadcrumbLabel, path, photo, datePublished, dateModified }) {
  const graph = [localBusinessSchema()];
  if (serviceType) graph.push(serviceSchema(serviceType));
  if (faqs && faqs.length) graph.push(faqSchema(faqs));
  if (breadcrumbLabel && path && path !== "/") graph.push(breadcrumbSchema(breadcrumbLabel, path));
  if (photo) graph.push(imageObjectSchema(photo));
  if (datePublished) graph.push(webPageSchema({ path, datePublished, dateModified }));
  const payload = graph.length === 1 ? { "@context": "https://schema.org", ...graph[0] }
    : { "@context": "https://schema.org", "@graph": graph };
  return `<script type="application/ld+json">\n${JSON.stringify(payload, null, 2)}\n</script>`;
}

function header(activePath) {
  return `
  <div class="top-bar">
    <div class="wrap">
      <span>24/7 Emergency Response · Fire &amp; Water Damage · Phoenix Metro Area</span>
      <a class="phone" href="${BRAND.phoneHref}">${BRAND.phone}</a>
    </div>
  </div>

  <header class="site-header">
    <div class="wrap">
      <a class="brand-block" href="/" aria-label="${esc(BRAND.name)} home">
        <span class="brand-mark"><img src="/assets/img/gold-water-fire-phoenix-mark.svg" alt="" width="188" height="240" loading="eager"></span>
        <span class="brand-text">
          <span class="brand"><span class="gold-word">Gold</span> Water <span class="fire-word">Fire</span></span>
          <span class="tagline">Restoration Services</span>
        </span>
      </a>
      <nav class="main-nav" aria-label="Primary">
        ${NAV.map((n) => `<a href="${n.href}"${n.href === activePath ? ' class="active"' : ""}>${esc(n.label)}</a>`).join("\n        ")}
      </nav>
      <a class="btn-call" href="${BRAND.phoneHref}">Call ${BRAND.phone}</a>
    </div>
  </header>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <h4>${esc(BRAND.name)}</h4>
          <p>Fire and water damage restoration and reconstruction serving the Phoenix, AZ metro area. ${esc(BRAND.license)}.</p>
        </div>
        <div>
          <h4>Services</h4>
          <ul>
            <li><a href="/water-damage-restoration.html">Water Damage Restoration</a></li>
            <li><a href="/fire-damage-restoration.html">Fire Damage Restoration</a></li>
            <li><a href="/reconstruction.html">Reconstruction &amp; Rebuild</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li><a href="${BRAND.phoneHref}">${BRAND.phone}</a></li>
            <li><a href="mailto:${BRAND.email}">${BRAND.email}</a></li>
            <li>${esc(BRAND.addressLine1)}<br>${esc(BRAND.addressLine2)}</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; <span id="year"></span> ${esc(BRAND.name)}. ${esc(BRAND.license)}.</span>
        <a href="https://bytomorrow.ai" target="_blank" rel="noopener">Built by ByTomorrow.ai, automated operations for real businesses</a>
      </div>
    </div>
  </footer>
  <script src="/assets/js/main.js"></script>`;
}

// shell(): the ONE place header/nav/footer/NAP/schema-boilerplate live.
// Every page — hand-composed or generated — renders through this.
export function shell({
  path,
  title,
  description,
  h1AsTitle,
  ogImage,
  robotsNoindex = false,
  serviceType,
  faqs,
  breadcrumbLabel,
  photo,
  datePublished,
  dateModified,
  bodyHtml,
  extraHead = "",
}) {
  const canonical = absUrl(path);
  // Tier-1 checklist item 12 (BYTOMORROW-TECH-STACK.md): resolve to the page's own
  // photo before falling back to the sitewide default — never the reverse.
  const resolvedOgImage = ogImage || photo?.src || "/assets/img/og-image.jpg";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  ${robotsNoindex ? '<meta name="robots" content="noindex">' : ""}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(h1AsTitle || title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${absUrl(resolvedOgImage)}">
  ${datePublished ? `<meta property="article:published_time" content="${datePublished}">` : ""}
  ${datePublished ? `<meta property="article:modified_time" content="${dateModified || datePublished}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <!-- SVG first: modern browsers take it and render the mark sharp at any
       size, including the 2x/3x tab icons a 48px .ico can only fake. The
       .ico stays for older browsers, which ignore the SVG line. -->
  <link rel="icon" type="image/svg+xml" href="/assets/img/gold-water-fire-phoenix-mark.svg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/css/style.css">
  ${schemaBlock({ serviceType, faqs, breadcrumbLabel, path, photo, datePublished, dateModified })}
  ${extraHead}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
${header(path)}
  <main id="main">
${bodyHtml}
  </main>
${footer()}
</body>
</html>
`;
}
