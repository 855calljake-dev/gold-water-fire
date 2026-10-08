import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";
import { CREDIT_LINE } from "./craftsmanship.mjs";

// The landing page. Implements the canvas Jake approved on 2026-09-27
// ("Gold Water Fire Landing Page", desktop 1440 and mobile 390 artboards):
// dark navy ground, Montserrat, gold accent, and these sections in this
// order: hero, facts band, the first hour, three services, one-crew gallery,
// team, service area, free-inspection form. Header, nav, footer, schema, and
// the Preferred Source button still come from shell(), so the page keeps the
// same chrome as every other page and every sitewide ruling reaches it.
//
// Every photograph here already ships elsewhere on the site: the hero is the
// site's own night photo, the nine work photos are from the screened
// craftsmanship set (content/craftsmanship.json, CLAIMS-TO-VERIFY.md
// "Team craftsmanship photos" row: credited to members of our team, never
// presented as a completed Gold Water Fire job), and the three portraits are
// the About page's team photos (rights recorded in 855calljake-dev/gwf-media).
//
// Copy is the canvas's copy. Two lines were changed to keep the claims gate:
// the "Call us" card no longer says a person answers (the line is answered by
// the dispatch agent first), and the team heading no longer says these are
// the people who pick up the phone, for the same reason.

const ACCENT = "#c9962b";

export const ICON = {
  phone: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path></svg>`,
  arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>`,
  warn: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20z"></path><path d="M12 10v4"></path><path d="M12 17h.01"></path></svg>`,
  valve: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="4"></circle><path d="M2 13h6"></path><path d="M16 13h6"></path><path d="M12 3v6"></path><path d="M9 3h6"></path></svg>`,
  camera: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
  call: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"></path></svg>`,
  drop: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z"></path></svg>`,
  flame: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.3 1.2 2.4 2.5 2.8z"></path></svg>`,
  house: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>`,
};

// Craftsmanship photos the canvas uses, by file. Alt text comes from
// content/craftsmanship.json when the entry exists (the screened wording), with
// the canvas's own alt as the fallback so the page still builds without it.
export const WORK = {
  water: { file: "/assets/img/craftsmanship/multiple-air-movers-dehumidifier-drying-living-room.jpg", alt: "Air movers and a dehumidifier drying a living room with the lower drywall removed", w: 1600, h: 1200 },
  fire: { file: "/assets/img/craftsmanship/bedroom-interior-heavy-fire-smoke-damage-walls.jpg", alt: "Bedroom with heavy fire and smoke damage to walls and ceiling", w: 1200, h: 1600 },
  rebuild: { file: "/assets/img/craftsmanship/remodeled-kitchen-gray-quartz-counters-shaker-cabinets.jpg", alt: "Remodeled kitchen with gray quartz counters and shaker cabinets", w: 1600, h: 1200 },
  g1: { file: "/assets/img/craftsmanship/kitchen-prepared-plastic-containment-sheeting-taped-over.jpg", alt: "Kitchen sealed with plastic containment sheeting before work begins", w: 1600, h: 1200 },
  g2: { file: "/assets/img/craftsmanship/new-drywall-hung-taped-along-hallway-reconstruction.jpg", alt: "New drywall hung and taped along a hallway", w: 1200, h: 1600 },
  g3: { file: "/assets/img/craftsmanship/tiled-groin-vault-shower-ceiling-stone-mosaic.jpg", alt: "Tiled groin vault shower ceiling with stone mosaic", w: 1200, h: 1600 },
  g4: { file: "/assets/img/craftsmanship/white-shaker-cabinets-installed-kitchen-wood-look.jpg", alt: "Kitchen with new white shaker cabinets and wood-look flooring", w: 1600, h: 1200 },
  g5: { file: "/assets/img/craftsmanship/soaking-tub-glassenclosed-shower-white-surround-finished.jpg", alt: "Finished bathroom with soaking tub and glass shower enclosure", w: 1600, h: 1200 },
};

// The confirmed service-area list (CLAIMS-TO-VERIFY.md, 2026-08-06), in the
// canvas's order. Each links to its card on /service-areas/, the same anchors
// the guides side menu uses.
import { CITIES } from "./lib.mjs";
export { CITIES };
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function workImg(craft, key, extra = "") {
  const w = WORK[key];
  const entry = (craft?.images || []).find((i) => i.file === w.file);
  const alt = entry?.alt || w.alt;
  return `<img src="${w.file}" alt="${esc(alt)}" width="${entry?.width || w.w}" height="${entry?.height || w.h}" loading="lazy"${extra}>`;
}

function initials(name) {
  return String(name).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

// Team from data/team.json (the About page reads the same file at runtime).
// Members with a photo get a figure; the rest a name and role, as on About.
function teamSection(team) {
  const members = team?.team || [];
  const withPhoto = members.filter((m) => m.photo);
  const without = members.filter((m) => !m.photo);
  if (!members.length) return "";
  return `
    <section class="lp-band lp-pad" id="team">
      <div class="wrap">
        <h2>The people who show up.</h2>
        <p class="lp-sub">A small crew out of Chandler. You will know our names, and we will know your house.</p>
        ${withPhoto.length ? `<div class="lp-team">
          ${withPhoto.map((m) => `<figure>
            <img src="${esc(m.photo)}" alt="${esc(m.alt || m.name)}" width="800" height="1000" loading="lazy">
            <figcaption><span class="name">${esc(m.name)}</span><span class="role">${esc(m.role)}</span></figcaption>
          </figure>`).join("\n          ")}
        </div>` : ""}
        ${without.length ? `<div class="lp-team-more">
          ${without.map((m) => `<div class="person"><span class="initial" aria-hidden="true">${esc(initials(m.name))}</span><span><span class="name">${esc(m.name)}</span><span class="role">${esc(m.role)}</span></span></div>`).join("\n          ")}
        </div>` : ""}
      </div>
    </section>`;
}

export function renderHome(craft = null, team = null) {
  // SOP-AGENTIC-SEO-WEBSITES.md §8.3, Jake's ruling 2026-08-09, cross-tenant:
  // an illustrative image's caption is the page's own H1, bare. The hero photo
  // is the one generated image on this page, so its caption sits under the
  // hero. Marked up once here for the hero and reused plain for the caption.
  const h1 = "Water or fire in your home? Call us first.";
  const hero = {
    src: "/assets/img/hero-emergency-response-night-phoenix-az.jpg",
    alt: h1,
  };

  const bodyHtml = `
  <div class="lp">
    <section class="lp-hero" id="top">
      <img src="${hero.src}" alt="${esc(hero.alt)}" width="1920" height="914" loading="eager" fetchpriority="high">
      <div class="wrap">
        <div class="lp-hero-inner">
          <div class="lp-eyebrow"><span class="dot"></span><span>24/7 fire &amp; water damage restoration · Phoenix metro</span></div>
          <h1>${esc(h1)}</h1>
          <p class="lp-lede">One local crew handles the drying, the cleanup and the rebuild, anywhere in the Phoenix metro.</p>
          <div class="lp-ctas">
            <a class="lp-btn lp-btn-gold" href="tel:+14809993339">${ICON.phone}<span>Call (480) 999-3339</span></a>
            <a class="lp-btn lp-btn-ghost" href="#inspection">Book a free inspection</a>
          </div>
        </div>
      </div>
    </section>
    <div class="wrap"><p class="lp-img-note">${esc(h1)}</p></div>

    <section class="lp-pad lp-reel" aria-label="Gold Water Fire in 15 seconds">
      <div class="wrap">
        <div class="lp-reel-inner">
          <div>
            <h2>Fire, flood or roof. One call.</h2>
            <p class="lp-sub">Fifteen seconds on what we do, day or night, anywhere in the Phoenix metro.</p>
          </div>
          <video controls playsinline preload="none" poster="/assets/video/gold-water-fire-15s-poster.jpg" width="1280" height="720">
            <source src="/assets/video/gold-water-fire-15s.mp4" type="video/mp4">
          </video>
        </div>
      </div>
    </section>

    <section class="lp-band lp-facts" aria-label="At a glance">
      <div class="wrap">
        <div class="item"><strong>Answered 24/7</strong><span>Nights, weekends and holidays.</span></div>
        <div class="item"><strong>Free inspection</strong><span>No cost to have us come look.</span></div>
        <div class="item"><strong>AZ ROC #264344</strong><span>Licensed Arizona contractor, KB-2.</span></div>
        <div class="item"><strong>Based in Chandler</strong><span>221 E Willis Rd, Ste 6.</span></div>
      </div>
    </section>

    <section class="lp-pad">
      <div class="wrap">
        <h2>The first hour, before we get there.</h2>
        <p class="lp-sub">Most people have never dealt with this before. Here is what matters right now, in order.</p>
        <div class="lp-steps">
          <div class="step">${ICON.warn}<h3>Get safe</h3><p>Smoke, sparking outlets or a sagging ceiling means everyone goes outside. For active fire, call 911 first.</p></div>
          <div class="step">${ICON.valve}<h3>Stop the water</h3><p>Close the main shut-off. If you can reach the breaker without standing in water, cut power to wet rooms.</p></div>
          <div class="step">${ICON.camera}<h3>Take photos</h3><p>Photograph every affected room before anything moves or gets thrown out. Your insurer will ask for them.</p></div>
          <div class="step">${ICON.call}<h3>Call us</h3><p>Answered at any hour. We come out, look at the damage with you and lay out the plan.</p></div>
        </div>
      </div>
    </section>

    <section class="lp-band lp-pad" id="services">
      <div class="wrap">
        <h2>Three kinds of work. One crew does all of it.</h2>
        <div class="lp-bento">
          <a class="tall" href="/water-damage-restoration.html">
            ${workImg(craft, "water")}
            <div class="body">
              <div class="head">${ICON.drop}<h3>Water damage restoration</h3></div>
              <p>Burst pipes, AC condensate leaks, failed water heaters and monsoon flooding. We extract the water, dry the structure and confirm it is dry before anything gets closed up.</p>
              <span class="more">Water damage details ${ICON.arrow}</span>
            </div>
          </a>
          <a class="wide" href="/fire-damage-restoration.html">
            ${workImg(craft, "fire")}
            <div class="body">
              <div class="head">${ICON.flame}<h3>Fire and smoke</h3></div>
              <p>Board-up, soot and odor removal, and the water left behind by the hoses.</p>
              <span class="more">Fire damage details ${ICON.arrow}</span>
            </div>
          </a>
          <a class="wide" href="/reconstruction.html">
            ${workImg(craft, "rebuild")}
            <div class="body">
              <div class="head">${ICON.house}<h3>Reconstruction</h3></div>
              <p>Drywall, cabinets, flooring, tile and paint, finished by the team that dried it.</p>
              <span class="more">Rebuild details ${ICON.arrow}</span>
            </div>
          </a>
        </div>
        <p class="lp-credit">${esc(CREDIT_LINE)}</p>
      </div>
    </section>

    <section class="lp-pad">
      <div class="wrap">
        <h2>The people who dry it out are the people who put it back.</h2>
        <p class="lp-sub">No handoff to a stranger halfway through. You keep one plan and one phone number from the first hour to the last coat of paint.</p>
        <div class="lp-gallery">
          ${workImg(craft, "g1")}
          ${workImg(craft, "g2")}
          ${workImg(craft, "g3")}
          ${workImg(craft, "g4")}
          ${workImg(craft, "g5")}
        </div>
        <p class="lp-credit">${esc(CREDIT_LINE)} <a href="/craftsmanship.html">See the full gallery</a></p>
      </div>
    </section>

    ${teamSection(team)}

    <section class="lp-pad lp-area">
      <div class="wrap">
        <div>
          <h2>Anywhere in the Phoenix metro.</h2>
          <p class="lp-sub">From Peoria to San Tan Valley and Avondale to Apache Junction, plus the outlying towns past them. Not on the list? Call anyway.</p>
        </div>
        <ul class="lp-cities">
          ${CITIES.map((c) => `<li><a href="/service-areas/#${slug(c)}">${esc(c)}</a></li>`).join("\n          ")}
        </ul>
      </div>
    </section>

    <section class="lp-band lp-pad lp-inspect" id="inspection">
      <div class="wrap">
        <div>
          <h2>Book a free inspection.</h2>
          <p class="lp-sub">Tell us what happened. We call you back, come out, and walk you through what we find. It costs nothing to have us look.</p>
          <div class="lp-phone-block">
            <span>Water on the floor right now? Skip the form.</span>
            <a href="tel:+14809993339">(480) 999-3339</a>
            <span>Answered 24/7</span>
          </div>
        </div>
        <form class="lp-form" name="service-request" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="company">
          <input type="hidden" name="form-name" value="service-request">
          <p class="hp"><label>Leave this field blank<input name="company"></label></p>
          <div class="row">
            <div class="field"><label for="lp-name">Your name</label><input id="lp-name" type="text" name="name" autocomplete="name" required></div>
            <div class="field"><label for="lp-phone">Phone</label><input id="lp-phone" type="tel" name="phone" autocomplete="tel" required></div>
          </div>
          <div class="field"><label for="lp-address">Property address or city</label><input id="lp-address" type="text" name="address" autocomplete="street-address"></div>
          <div class="field">
            <label for="lp-service">What happened?</label>
            <select id="lp-service" name="service">
              <option value="Water damage">Water damage</option>
              <option value="Fire damage">Fire or smoke damage</option>
              <option value="Reconstruction / rebuild">Repair or rebuild</option>
              <option value="Not sure">Not sure yet</option>
            </select>
          </div>
          <div class="field"><label for="lp-message">Anything we should know? <span class="opt">(optional)</span></label><textarea id="lp-message" name="message" rows="4"></textarea></div>
          <button type="submit">Book a free inspection</button>
          <p class="note">We only use your number to call you back about this.</p>
        </form>
      </div>
    </section>
  </div>`;

  return shell({
    path: "/",
    title: "24/7 Fire & Water Damage Restoration | Gold Water Fire, Phoenix, AZ Metro",
    description: "24/7 emergency fire and water damage restoration and reconstruction for homes and businesses across the Phoenix, AZ metro area. Call (480) 999-3339, day or night.",
    h1AsTitle: "24/7 Fire & Water Damage Restoration | Gold Water Fire, Phoenix, AZ Metro",
    photo: hero,
    // The 15 s reel (2nd Brain GWF/Deliverables/2026-09-29-gwf-15s-motion-reel,
    // clean version, re-encoded 1280x720 for the web). preload="none" keeps the
    // page weight: nothing downloads until play is pressed.
    extraGraph: [{
      "@type": "VideoObject",
      name: "Gold Water Fire: fire, flood or roof, one call",
      description: "A 15 second look at Gold Water Fire: 24/7 fire, water and roof damage response and the rebuild, across the Phoenix metro.",
      thumbnailUrl: "https://www.goldwaterfire.com/assets/video/gold-water-fire-15s-poster.jpg",
      contentUrl: "https://www.goldwaterfire.com/assets/video/gold-water-fire-15s.mp4",
      uploadDate: "2026-10-07",
      duration: "PT15S",
    }],
    datePublished: "2026-08-06T08:54:02-07:00",
    dateModified: "2026-09-27T16:00:00-07:00",
    extraHead: `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/assets/css/home.css">`,
    bodyHtml,
  });
}
