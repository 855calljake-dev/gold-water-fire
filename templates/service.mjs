import { shell } from "./shell.mjs";
import { esc } from "./lib.mjs";
import { ICON, CITIES, slug, workImg } from "./home.mjs";
import { CREDIT_LINE } from "./craftsmanship.mjs";

// The service-page template (water and fire), built 2026-10-07 from the market
// research in gwf-bos records/seo/20261007-gwf-market-research. A page opts in
// with "template": "service" in its JSON; any other service page keeps
// templates/content-page.mjs.
//
// What the research said these pages were missing, and where each answer is:
//   - the answer first (bottomLine, under the H1) and a plain definition of
//     the term people actually search ("What is water extraction?")
//   - cost drivers and timeline, which People-also-ask asks on every query and
//     almost no Phoenix competitor answers
//   - the process as numbered steps, also emitted as HowTo schema
//   - cited official sources (EPA, USFA, NWS, Arizona DIFI) instead of claims
//     we cannot back; nothing here states a certification, bond, insurance,
//     review or response time (CLAIMS-TO-VERIFY.md)
// Visual system: the homepage's (home.css), plus service.css for the animated
// line-art heroes and the step rail. Everything moving stops under
// prefers-reduced-motion.

const ACCENT = "#c9962b";
const ICONS = {
  check: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`,
  quote: `<svg width="26" height="26" viewBox="0 0 24 24" fill="${ACCENT}" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6l-.8-1.4C7.6 14.8 8.4 13.6 8.5 12H7zm8 0h4v4c0 3-1.5 5-4 6l-.8-1.4c1.4-.8 2.2-2 2.3-3.6H15z"></path></svg>`,
};

// The brand's phoenix mark, large and soft on the right of every service hero:
// gold for fire, blue for water. Decorative, so empty alt and aria-hidden.
const MARK = `<img class="svc-mark" src="/assets/img/gold-water-fire-phoenix-mark.svg" alt="" aria-hidden="true" width="188" height="240" loading="eager">`;

function heroArt(kind) {
  if (kind === "fire") {
    let embers = "";
    for (let i = 0; i < 34; i++) {
      const x = 56 + ((i * 37) % 44), d = (i * 0.53) % 7, s = 4 + (i % 5) * 2, dur = 5 + (i % 6);
      embers += `<span style="left:${x}%;width:${s}px;height:${s}px;animation-delay:-${d.toFixed(2)}s;animation-duration:${dur}s"></span>`;
    }
    return `<div class="svc-art svc-art-fire" aria-hidden="true"><div class="glow"></div>${MARK}${embers}</div>`;
  }
  return `<div class="svc-art svc-art-water" aria-hidden="true">
        ${MARK}
        <svg class="wave wave-a" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 60 C 150 20 300 100 450 60 S 750 20 900 60 S 1200 100 1200 60 V120 H0Z"/></svg>
        <svg class="wave wave-b" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 70 C 200 30 350 110 600 70 S 1000 30 1200 70 V120 H0Z"/></svg>
        <div class="drops">${Array.from({ length: 14 }, (_, i) => `<span style="left:${56 + ((i * 53) % 44)}%;animation-delay:-${((i * 0.37) % 2.4).toFixed(2)}s"></span>`).join("")}</div>
      </div>`;
}

function howToSchema(d) {
  return {
    "@type": "HowTo",
    name: d.stepsHeading || `How ${d.serviceType.toLowerCase()} works`,
    step: d.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
  };
}

export function renderService(d, craft = null) {
  const sources = d.sources || [];
  const bodyHtml = `
  <div class="lp lp-svc">
    <section class="lp-hero svc-hero" id="top">
      ${heroArt(d.heroArt)}
      <div class="wrap">
        <div class="lp-hero-inner reveal">
          <div class="breadcrumb svc-crumb"><a href="/">Home</a> / ${esc(d.breadcrumbLabel)}</div>
          <div class="lp-eyebrow"><span class="dot"></span><span>${esc(d.eyebrow || "Answered 24/7")}</span></div>
          <h1>${esc(d.h1)}</h1>
          <p class="lp-lede">${esc(d.intro)}</p>
          <div class="lp-ctas">
            <a class="lp-btn lp-btn-gold" href="tel:+14809993339">${ICON.phone}<span>Call (480) 999-3339</span></a>
            <a class="lp-btn lp-btn-ghost" href="#inspection">Book a free inspection</a>
          </div>
          ${d.bottomLine ? `<div class="svc-bottomline"><span class="label">The short version</span><p>${esc(d.bottomLine)}</p></div>` : ""}
        </div>
      </div>
    </section>

    <section class="lp-band lp-facts" aria-label="At a glance">
      <div class="wrap">
        <div class="item"><strong>Answered 24/7</strong><span>Nights, weekends and holidays.</span></div>
        <div class="item"><strong>Free inspection</strong><span>No cost to have us come look.</span></div>
        <div class="item"><strong>AZ ROC #264344</strong><span>Licensed Arizona contractor, KB-2.</span></div>
        <div class="item"><strong>One company</strong><span>Roof, cleanup and rebuild.</span></div>
      </div>
    </section>

    <section class="lp-pad">
      <div class="wrap svc-split">
        <div class="svc-define">
          <h2>${esc(d.plainEnglishHeading)}</h2>
          <p class="svc-answer">${esc(d.plainEnglishBody)}</p>
        </div>
        <div class="svc-why">
          <h2>${esc(d.whyItMattersHeading)}</h2>
          <p>${esc(d.whyItMattersBody)}</p>
        </div>
      </div>
    </section>

    <section class="lp-band lp-pad">
      <div class="wrap">
        <h2>${esc(d.causesHeading || "What usually causes it")}</h2>
        <div class="svc-grid">
          ${d.causes.map((c) => `<div class="svc-card"><h3>${esc(c.heading)}</h3><p>${esc(c.body)}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>

    <section class="lp-pad" id="process">
      <div class="wrap">
        <h2>${esc(d.stepsHeading)}</h2>
        <ol class="svc-steps">
          ${d.steps.map((s, i) => `<li><span class="n">${i + 1}</span><div><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></div></li>`).join("\n          ")}
        </ol>
      </div>
    </section>

    ${d.work?.length ? `<section class="lp-pad svc-work">
      <div class="wrap">
        <div class="svc-gallery">${d.work.map((k) => workImg(craft, k)).join("")}</div>
        <p class="lp-credit">${esc(CREDIT_LINE)} <a href="/craftsmanship.html">See the full gallery</a></p>
      </div>
    </section>` : ""}

    <section class="lp-band lp-pad" id="cost">
      <div class="wrap">
        <h2>${esc(d.costHeading)}</h2>
        <p class="lp-sub">${esc(d.costIntro)}</p>
        <div class="svc-grid svc-grid-4">
          ${d.costDrivers.map((c) => `<div class="svc-card svc-cost">${ICONS.check}<h3>${esc(c.heading)}</h3><p>${esc(c.body)}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>

    <section class="lp-pad" id="timeline">
      <div class="wrap">
        <h2>${esc(d.timelineHeading)}</h2>
        <div class="svc-timeline">
          ${d.timeline.map((t) => `<div class="stage"><span class="label">${esc(t.label)}</span><p>${esc(t.body)}</p></div>`).join("\n          ")}
        </div>
      </div>
    </section>

    <section class="lp-band lp-pad" id="insurance">
      <div class="wrap svc-split">
        <div>
          <h2>${esc(d.insuranceHeading)}</h2>
          <p class="lp-sub">${esc(d.insuranceBody)}</p>
        </div>
        ${d.insuranceQuote ? `<figure class="svc-quote">
          ${ICONS.quote}
          <blockquote>${esc(d.insuranceQuote)}</blockquote>
          <figcaption><a href="${esc(d.insuranceQuoteSource.url)}" rel="noopener" target="_blank">${esc(d.insuranceQuoteSource.label)}</a></figcaption>
        </figure>` : ""}
      </div>
    </section>

    ${d.roofLink ? `<section class="lp-pad">
      <div class="wrap svc-chain">
        <h2>One call, from the roof to the last coat of paint.</h2>
        <ol>
          <li><span class="n">1</span><span><strong><a href="/roof/">The roof</a></strong>Tarped, then repaired or replaced.</span></li>
          <li><span class="n">2</span><span><strong><a href="/water-damage-restoration.html">The water and smoke</a></strong>Extracted, dried, cleaned and checked.</span></li>
          <li><span class="n">3</span><span><strong><a href="/reconstruction.html">The rebuild</a></strong>Drywall, floors, cabinets and paint, put back.</span></li>
        </ol>
      </div>
    </section>` : ""}

    <section class="lp-pad">
      <div class="wrap">
        <div class="svc-takeaway"><span class="label">Key takeaway</span><p>${esc(d.takeaway)}</p></div>
      </div>
    </section>

    <section class="lp-band lp-pad" id="questions">
      <div class="wrap svc-faq">
        <h2>Questions people ask us</h2>
        ${d.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n        ")}
      </div>
    </section>

    <section class="lp-pad lp-area">
      <div class="wrap">
        <div>
          <h2>Anywhere in the Phoenix metro.</h2>
          <p class="lp-sub">From Peoria to San Tan Valley and Avondale to Apache Junction, plus the outlying towns past them. Our office is in Chandler.</p>
        </div>
        <ul class="lp-cities">
          ${CITIES.map((c) => `<li><a href="/service-areas/#${slug(c)}">${esc(c)}</a></li>`).join("\n          ")}
        </ul>
      </div>
    </section>

    <section class="lp-band lp-pad lp-inspect" id="inspection">
      <div class="wrap">
        <div>
          <h2>${esc(d.cta.heading)}</h2>
          <p class="lp-sub">${esc(d.cta.body)} Or tell us what happened, and we call you back and come out. It costs nothing to have us look.</p>
          <div class="lp-phone-block">
            <span>Fastest is a call.</span>
            <a href="tel:+14809993339">(480) 999-3339</a>
            <span>Answered 24/7</span>
          </div>
        </div>
        <form class="lp-form" name="service-request" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="company">
          <input type="hidden" name="form-name" value="service-request">
          <p class="hp"><label>Leave this field blank<input name="company"></label></p>
          <div class="row">
            <div class="field"><label for="sv-name">Your name</label><input id="sv-name" type="text" name="name" autocomplete="name" required></div>
            <div class="field"><label for="sv-phone">Phone</label><input id="sv-phone" type="tel" name="phone" autocomplete="tel" inputmode="tel" required></div>
          </div>
          <div class="field"><label for="sv-address">Property address or city</label><input id="sv-address" type="text" name="address" autocomplete="street-address"></div>
          <div class="field">
            <label for="sv-service">What happened?</label>
            <select id="sv-service" name="service">
              <option value="Water damage"${d.serviceType.startsWith("Water") ? " selected" : ""}>Water damage</option>
              <option value="Fire damage"${d.serviceType.startsWith("Fire") ? " selected" : ""}>Fire or smoke damage</option>
              <option value="Roof: leak">Roof leak or storm damage</option>
              <option value="Reconstruction / rebuild">Repair or rebuild</option>
              <option value="Not sure">Not sure yet</option>
            </select>
          </div>
          <div class="field"><label for="sv-message">Anything we should know? <span class="opt">(optional)</span></label><textarea id="sv-message" name="message" rows="4"></textarea></div>
          <button type="submit">Book a free inspection</button>
          <p class="note">We only use your number to call you back about this.</p>
        </form>
      </div>
    </section>

    <section class="lp-pad svc-sources">
      <div class="wrap">
        <p class="updated">Last updated ${esc(String(d.dateModified || d.datePublished).slice(0, 10))} by Gold Water Fire, Chandler, Arizona.</p>
        ${sources.length ? `<h2 class="small">Sources</h2>
        <ul>${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join("")}</ul>` : ""}
        <p class="more">${(d.internalLinks || []).map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(" · ")}</p>
      </div>
    </section>
  </div>`;

  return shell({
    path: d.path,
    title: d.title,
    description: d.description,
    h1AsTitle: d.h1,
    serviceType: d.serviceType,
    faqs: d.faqs,
    breadcrumbLabel: d.breadcrumbLabel,
    photo: d.photo,
    datePublished: d.datePublished,
    dateModified: d.dateModified,
    extraGraph: [howToSchema(d)],
    extraHead: `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="/assets/css/home.css">
  <link rel="stylesheet" href="/assets/css/service.css">`,
    bodyHtml,
  });
}

