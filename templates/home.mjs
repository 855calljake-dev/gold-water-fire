import { shell } from "./shell.mjs";

export function renderHome() {
  // SOP-AGENTIC-SEO-WEBSITES.md §8.3, Jake's ruling 2026-08-09, cross-tenant:
  // an image caption is the page's own H1, bare. Home isn't a per-page template
  // — renderHome() takes no data, so there's no page.h1 to read — and the hero
  // renders the H1 with a gold accent word. So it lives here once, plain for the
  // caption and marked up for the hero, rather than being typed in two places
  // that can drift apart.
  const h1 = "Fire and water damage restoration for the Phoenix metro area.";
  const heroH1 = h1.replace("Phoenix", '<span class="gold-word">Phoenix</span>');

  const bodyHtml = `
    <section class="hero hero-photo">
      <div class="wrap">
        <div>
          <span class="badge-247"><span class="dot"></span>24/7 Emergency Response</span>
          <h1>${heroH1}</h1>
          <p class="lede">Gold Water Fire handles the cleanup, drying, and rebuild after fire, smoke, or water damage hits your home or business, with one crew, start to finish, day or night.</p>
          <div class="hero-ctas">
            <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
            <a class="btn-secondary" href="/contact.html">Get a Free Inspection</a>
          </div>
          <div class="hero-facts">
            <div class="fact"><strong>Free</strong>Inspection</div>
            <div class="fact"><strong>24/7</strong>Emergency response</div>
            <div class="fact"><strong>AZ ROC #264344 · KB-2</strong>Licensed contractor</div>
            <div class="fact"><strong>Chandler, AZ</strong>Serving the Phoenix metro area</div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">What We Do</span>
          <h2>Three services, one crew, no handoffs</h2>
          <p>From the first call to the final walkthrough, Gold Water Fire manages restoration and reconstruction under one roof, with no juggling separate contractors for cleanup and rebuild.</p>
        </div>
        <div class="card-grid">
          <div class="card has-media">
            <div class="card-media"><img src="/assets/img/water-damage-restoration-drying-equipment-phoenix-az.jpg" alt="Water damage restoration technician running air movers and a dehumidifier in a flooded room" loading="lazy" width="1600" height="893"></div>
            <h3>Water Damage Restoration</h3>
            <p>Extraction, structural drying, and cleanup after leaks, pipe breaks, and flooding.</p>
            <a class="card-link" href="/water-damage-restoration.html">See how it works &rarr;</a>
          </div>
          <div class="card has-media">
            <div class="card-media"><img src="/assets/img/fire-smoke-damage-restoration-cleanup-phoenix-az.jpg" alt="Fire damage restoration crew removing smoke-damaged drywall near a soot-covered brick fireplace" loading="lazy" width="1600" height="893"></div>
            <h3>Fire Damage Restoration</h3>
            <p>Smoke and soot remediation, odor control, and structural cleanup after a fire.</p>
            <a class="card-link" href="/fire-damage-restoration.html">See how it works &rarr;</a>
          </div>
          <div class="card has-media">
            <div class="card-media"><img src="/assets/img/reconstruction-rebuild-restoration-phoenix-az.jpg" alt="Reconstruction crew framing new interior walls during a residential rebuild" loading="lazy" width="1600" height="893"></div>
            <h3>Reconstruction &amp; Rebuild</h3>
            <p>Repair and rebuild damaged structures back to move-in condition, led by our in-house construction team.</p>
            <a class="card-link" href="/reconstruction.html">See how it works &rarr;</a>
          </div>
        </div>
        <p class="img-note">${h1}</p>
      </div>
    </section>

    <section class="trust-band">
      <div class="wrap">
        <div class="section-head" style="max-width:100%">
          <span class="eyebrow" style="color:var(--gold-light)">Why Gold Water Fire</span>
          <h2 style="color:#fff">Local ownership, licensed work, one crew for the whole job</h2>
        </div>
      </div>
      <div class="trust-grid">
        <div class="item">
          <strong>AZ ROC #264344 · KB-2</strong>
          <span>Licensed Arizona contractor.</span>
        </div>
        <div class="item">
          <strong>Restoration + Reconstruction</strong>
          <span>Cleanup and rebuild from the same company, with no second contractor to hire.</span>
        </div>
        <div class="item">
          <strong>Chandler-based</strong>
          <span>221 E Willis Rd, serving the greater Phoenix metro area.</span>
        </div>
        <div class="item">
          <strong>Owner-operated</strong>
          <span>Co-founded and run by Jim Bennett and Jake Taylor.</span>
        </div>
      </div>
    </section>

    <section class="photo-band">
      <img src="/assets/img/restoration-contractor-phoenix-az-metro-home-exterior.jpg" alt="Single-story home in the Phoenix, Arizona metro area at dusk" loading="lazy" width="1600" height="893">
      <div class="caption">
        <div class="wrap">
          <h3>Serving homes and businesses across the Phoenix metro</h3>
          <p>Based in Chandler, Gold Water Fire responds to fire and water damage across the greater Phoenix area.</p>
        </div>
      </div>
    </section>

    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">How It Works</span>
          <h2>What happens after you call</h2>
        </div>
        <ol class="process-list">
          <li>
            <span class="num">1</span>
            <div>
              <h4>Call or request service</h4>
              <p>Tell us what happened and where. We'll ask a few quick questions to get the right crew moving.</p>
            </div>
          </li>
          <li>
            <span class="num">2</span>
            <div>
              <h4>Assessment and mitigation</h4>
              <p>We assess the damage, stop it from spreading, and begin extraction, drying, or cleanup.</p>
            </div>
          </li>
          <li>
            <span class="num">3</span>
            <div>
              <h4>Restoration and rebuild</h4>
              <p>If reconstruction is needed, our own team handles repairs (walls, flooring, and finishes) through to completion.</p>
            </div>
          </li>
          <li>
            <span class="num">4</span>
            <div>
              <h4>Final walkthrough</h4>
              <p>We walk the property with you before we call the job done.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section class="cta-band">
      <div class="wrap">
        <h2>Fire or water damage doesn't wait. Neither do we.</h2>
        <p>Call now to talk to Gold Water Fire about your property.</p>
        <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
      </div>
    </section>`;

  return shell({
    path: "/",
    title: "24/7 Fire & Water Damage Restoration | Gold Water Fire, Phoenix, AZ Metro",
    description: "24/7 emergency fire and water damage restoration and reconstruction for homes and businesses across the Phoenix, AZ metro area. Call (480) 999-3339, day or night.",
    h1AsTitle: "24/7 Fire & Water Damage Restoration | Gold Water Fire, Phoenix, AZ Metro",
    photo: {
      src: "/assets/img/restoration-contractor-phoenix-az-metro-home-exterior.jpg",
      alt: "Single-story home in the Phoenix, Arizona metro area at dusk",
    },
    datePublished: "2026-08-06T08:54:02-07:00",
    dateModified: "2026-08-07T11:10:31-07:00",
    bodyHtml,
  });
}
