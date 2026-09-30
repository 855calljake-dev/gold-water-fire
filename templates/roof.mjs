import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";
import { ICON, CITIES, slug } from "./home.mjs";

// The roofing landing page, /roof/. www.goldwaterroof.com 301s here (netlify.toml).
// Built on the homepage's components and home.css so it reads as the same
// site; roof.css adds only what the homepage has no equivalent for.
//
// Claims, all from CLAIMS-TO-VERIFY.md "Roofing services" (Jake, 2026-09-29):
// repair, replacement, leak and storm response, emergency tarping; tile,
// shingle, foam and flat roofs; ROC #264344 KB-2 covers roofing. Not stated
// anywhere on this page, on purpose:
// - who does the roofing work (own crew or subcontractor): not yet answered;
// - the name "Gold Water Roof": the DBA is not registered yet, so the page
//   says Gold Water Fire;
// - any photograph: there are no real roofing photos, and a generated roof
//   could pass for a completed job. The hero art is a drawn roofline instead.

const PATH = "/roof/";

const ACCENT = "#c9962b";
const RICON = {
  tarp: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12 12 4l10 8"></path><path d="M5 10.5 12 15l7-4.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>`,
  storm: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 17H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 9 4 4 0 0 1 17.5 17z"></path><path d="m12 13-2 4h3l-2 4"></path></svg>`,
  repair: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.4-.6-.6-2.4z"></path></svg>`,
  replace: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8"></path><path d="M6 9.5V20h12V9.5"></path><path d="M9 14h6"></path><path d="M9 17h6"></path></svg>`,
  bucket: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16l-1.6 12H5.6z"></path><path d="M12 2.5s-2 2.2-2 3.5a2 2 0 0 0 4 0c0-1.3-2-3.5-2-3.5z"></path></svg>`,
};

const SERVICES = [
  ["tarp", "Emergency tarping", "We cover the damaged section so the next storm does not add to the damage inside."],
  ["storm", "Leak and storm response", "Monsoon wind, driving rain, tiles or shingles torn loose. We find where the water is getting in and stop it."],
  ["repair", "Roof repair", "Cracked or slipped tile, lifted shingles, worn foam and flashing that has pulled away."],
  ["replace", "Roof replacement", "When a repair no longer makes sense, we replace the roof and tell you plainly why."],
];
const ROOF_TYPES = ["Tile", "Shingle", "Foam", "Flat"];

// Roofing guides the content worker has already published. Looked up in the
// page data at build time, so titles stay current and a pulled guide simply
// drops out instead of leaving a dead link.
const GUIDE_PATHS = [
  "/guides/roof-leak-vs-plumbing-leak.html",
  "/guides/roof-repair-after-storm-damage.html",
  "/guides/monsoon-roof-leak-prevention.html",
  "/guides/tile-roof-underlayment-failure.html",
  "/guides/flat-roof-ponding-arizona.html",
];

const FAQS = [
  { q: "Do you tarp roofs after storm damage?", a: "Yes. Emergency tarping covers the damaged section to keep more water out until the roof is repaired. Call (480) 999-3339 at any hour." },
  { q: "What kinds of roofs do you work on?", a: "Tile, shingle, foam and flat roofs across the Phoenix metro." },
  { q: "Is the roof inspection free?", a: "Yes. It costs nothing to have us come out and look." },
  { q: "Can you also fix the water damage inside the house?", a: "Yes. Gold Water Fire also does water damage restoration and reconstruction, so the ceiling, insulation and walls under a leak are handled by the same company as the roof." },
  { q: "Are you licensed?", a: "Yes. Arizona ROC license #264344, KB-2." },
];

// Drawn hero art: a gold roofline in the rain. Decorative, so aria-hidden.
// The rain is two CSS-animated layers that stop under prefers-reduced-motion.
function heroArt() {
  const drops = (n, seed, cls) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = ((i * 97 + seed * 31) % 560) + 20;
      const y = ((i * 53 + seed * 17) % 480) - 40;
      out += `<line x1="${x}" y1="${y}" x2="${x - 9}" y2="${y + 30}"/>`;
    }
    return `<g class="${cls}">${out}</g>`;
  };
  return `<svg class="roof-art" viewBox="0 0 600 460" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="roofGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9962b"/><stop offset=".5" stop-color="#f1cf7a"/><stop offset="1" stop-color="#c9962b"/></linearGradient>
          <radialGradient id="rainFade" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
          <mask id="rainMask"><rect width="600" height="460" fill="url(#rainFade)"/></mask>
        </defs>
        <g class="rain" mask="url(#rainMask)">${drops(46, 1, "rain-a")}${drops(34, 7, "rain-b")}</g>
        <g class="courses" stroke="#c9962b" stroke-opacity=".32" stroke-width="3" stroke-linecap="round">
          <line x1="232" y1="176" x2="368" y2="176"/><line x1="188" y1="220" x2="412" y2="220"/><line x1="144" y1="264" x2="456" y2="264"/><line x1="100" y1="308" x2="500" y2="308"/>
        </g>
        <path class="ridge" d="M40 356 300 116 560 356" fill="none" stroke="url(#roofGold)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M110 356v70h380v-70" fill="none" stroke="#13335c" stroke-width="4" stroke-linecap="round"/>
      </svg>`;
}

export function renderRoof(pages = []) {
  const guides = GUIDE_PATHS.map((p) => pages.find((g) => g.path === p)).filter(Boolean);
  const h1 = "Roof leaking? Call us first.";
  const bodyHtml = `
  <div class="lp lp-roof">
    <section class="lp-hero roof-hero" id="top">
      <div class="wrap">
        <div class="lp-hero-inner">
          <div class="lp-eyebrow"><span class="dot"></span><span>24/7 roof emergency response</span></div>
          <h1>${esc(h1)}</h1>
          <p class="lp-lede">Emergency tarping, repairs and full replacements for tile, shingle, foam and flat roofs, anywhere in the Phoenix metro.</p>
          <div class="lp-ctas">
            <a class="lp-btn lp-btn-gold" href="tel:+14809993339">${ICON.phone}<span>Call (480) 999-3339</span></a>
            <a class="lp-btn lp-btn-ghost" href="#inspection">Book a free roof inspection</a>
          </div>
        </div>
        ${heroArt()}
      </div>
    </section>

    <section class="lp-band lp-facts" aria-label="At a glance">
      <div class="wrap">
        <div class="item"><strong>Answered 24/7</strong><span>Nights, weekends and holidays.</span></div>
        <div class="item"><strong>Free inspection</strong><span>No cost to have us come look.</span></div>
        <div class="item"><strong>AZ ROC #264344</strong><span>Licensed Arizona contractor, KB-2.</span></div>
        <div class="item"><strong>Based in Chandler</strong><span>221 E Willis Rd, Ste 8.</span></div>
      </div>
    </section>

    <section class="lp-pad">
      <div class="wrap">
        <h2>While the water is still coming in.</h2>
        <p class="lp-sub">A leak in a storm is stressful. These four steps cover what matters most.</p>
        <div class="lp-steps">
          <div class="step">${ICON.warn}<h3>Get safe</h3><p>If the ceiling sags or water is near lights or outlets, leave that room. Cut power at the breaker only if you can reach it from a dry spot.</p></div>
          <div class="step">${RICON.bucket}<h3>Catch the water</h3><p>Buckets and towels under the drips. Move furniture, electronics and anything you care about out of the room.</p></div>
          <div class="step">${ICON.camera}<h3>Take photos</h3><p>Photograph the ceilings, walls and anything wet before it gets moved. Your insurer will ask for them.</p></div>
          <div class="step">${ICON.call}<h3>Call us</h3><p>Answered at any hour. If the roof needs covering, we tarp it to keep more water out until the repair.</p></div>
        </div>
      </div>
    </section>

    <section class="lp-band lp-pad" id="services">
      <div class="wrap">
        <h2>What we do on the roof.</h2>
        <div class="roof-services">
          ${SERVICES.map(([ic, h, p]) => `<div class="card">${RICON[ic]}<h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("\n          ")}
        </div>
        <div class="roof-types">
          <span class="label">Roof types we work on</span>
          <ul>${ROOF_TYPES.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>
      </div>
    </section>

    <section class="lp-pad">
      <div class="wrap roof-inside">
        <div>
          <h2>A roof leak rarely stops at the roof.</h2>
          <p class="lp-sub">Water that gets past the roof soaks insulation, stains ceilings and runs down inside walls. Gold Water Fire also dries out homes and rebuilds them, so one company handles the roof, the water inside and the ceiling that has to come back. One call, one plan.</p>
        </div>
        <ol class="roof-chain">
          <li><span class="n">1</span><span><strong>The roof</strong>Tarped, then repaired or replaced.</span></li>
          <li><span class="n">2</span><span><strong><a href="/water-damage-restoration.html">The water inside</a></strong>Extracted and dried out, then checked dry.</span></li>
          <li><span class="n">3</span><span><strong><a href="/reconstruction.html">The ceiling and walls</a></strong>Drywall, insulation and paint put back.</span></li>
        </ol>
      </div>
    </section>

    <section class="lp-band lp-pad lp-area">
      <div class="wrap">
        <div>
          <h2>Roofing anywhere in the Phoenix metro.</h2>
          <p class="lp-sub">From Peoria to San Tan Valley and Avondale to Apache Junction, plus the outlying towns past them. Not on the list? Call anyway.</p>
        </div>
        <ul class="lp-cities">
          ${CITIES.map((c) => `<li><a href="/service-areas/#${slug(c)}">${esc(c)}</a></li>`).join("\n          ")}
        </ul>
      </div>
    </section>

    <section class="lp-pad" id="questions">
      <div class="wrap roof-faq">
        <h2>Common questions.</h2>
        ${FAQS.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n        ")}
        ${guides.length ? `<div class="roof-guides">
          <h3>Roof guides</h3>
          <ul>
            ${guides.map((g) => `<li><a href="${esc(g.path)}">${esc(g.h1)}</a></li>`).join("\n            ")}
          </ul>
        </div>` : ""}
      </div>
    </section>

    <section class="lp-band lp-pad lp-inspect" id="inspection">
      <div class="wrap">
        <div>
          <h2>Book a free roof inspection.</h2>
          <p class="lp-sub">Tell us what happened. We call you back, come out, and walk you through what we find on the roof and inside. It costs nothing to have us look.</p>
          <div class="lp-phone-block">
            <span>Water coming through the ceiling right now? Skip the form.</span>
            <a href="tel:+14809993339">(480) 999-3339</a>
            <span>Answered 24/7</span>
          </div>
        </div>
        <form class="lp-form" name="service-request" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="company">
          <input type="hidden" name="form-name" value="service-request">
          <p class="hp"><label>Leave this field blank<input name="company"></label></p>
          <div class="row">
            <div class="field"><label for="rf-name">Your name</label><input id="rf-name" type="text" name="name" autocomplete="name" required></div>
            <div class="field"><label for="rf-phone">Phone</label><input id="rf-phone" type="tel" name="phone" autocomplete="tel" required></div>
          </div>
          <div class="field"><label for="rf-address">Property address or city</label><input id="rf-address" type="text" name="address" autocomplete="street-address"></div>
          <div class="field">
            <label for="rf-service">What is going on with the roof?</label>
            <select id="rf-service" name="service">
              <option value="Roof: leak">It is leaking</option>
              <option value="Roof: storm damage">Storm or wind damage</option>
              <option value="Roof: emergency tarp">It needs a tarp now</option>
              <option value="Roof: repair">It needs a repair</option>
              <option value="Roof: replacement">I am thinking about replacing it</option>
              <option value="Roof: not sure">Not sure yet</option>
            </select>
          </div>
          <div class="field"><label for="rf-message">Anything we should know? <span class="opt">(optional)</span></label><textarea id="rf-message" name="message" rows="4" placeholder="Roof type, where the water is showing up, how long it has been leaking"></textarea></div>
          <button type="submit">Book a free roof inspection</button>
          <p class="note">We only use your number to call you back about this.</p>
        </form>
      </div>
    </section>
  </div>`;

  return shell({
    path: PATH,
    title: "Roof Repair, Tarping & Replacement 24/7 | Gold Water Fire, Phoenix, AZ Metro",
    description: "24/7 roof leak response, emergency tarping, repair and replacement for tile, shingle, foam and flat roofs in the Phoenix metro. Call (480) 999-3339.",
    h1AsTitle: "Roof Repair, Tarping & Replacement 24/7 | Gold Water Fire",
    serviceType: "Roofing",
    faqs: FAQS,
    breadcrumbLabel: "Roofing",
    datePublished: "2026-09-29T16:00:00-07:00",
    extraHead: `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/assets/css/home.css">
  <link rel="stylesheet" href="/assets/css/roof.css">`,
    bodyHtml,
  });
}
