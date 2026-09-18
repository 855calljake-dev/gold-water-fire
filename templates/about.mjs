import { shell } from "./shell.mjs";

// Real photograph, supplied by Jake Taylor 2026-09-18 for this page. Team
// photos were gated in CLAIMS-TO-VERIFY.md until real ones were supplied and
// rights-cleared; that row records the clearance. Source and provenance live
// in the private repo 855calljake-dev/gwf-media. Individual team photos are
// carried by data/team.json and rendered by assets/js/main.js.
const TEAM_PHOTO = {
  src: "/assets/img/team/team-jim-bennett-brandon-gurr.jpg",
  alt: "Jim Bennett and Brandon Gurr standing at a kitchen island in a cabinet and countertop showroom.",
};

export function renderAbout() {
  const bodyHtml = `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / About</div>
        <h1>About Gold Water Fire</h1>
        <p>A licensed Arizona restoration and reconstruction contractor based in Chandler, serving the Phoenix metro area.</p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Who We Are</span>
          <h2>Locally owned, licensed, and built to handle the whole job</h2>
          <p>Gold Water Fire was co-founded by Jim Bennett and Jake Taylor as a fire and water damage restoration and reconstruction contractor for the Phoenix, Arizona metro area. The company is licensed under AZ ROC #264344 (KB-2) and is based at 221 E Willis Rd Ste 8, Chandler, AZ 85286.</p>
        </div>
      </div>
    </section>

    <section class="soft">
      <div class="wrap">
        <div class="section-head">
          <span class="eyebrow">Our Team</span>
          <h2>The people behind the work</h2>
          <p>Real names and real faces. Nothing on this page is a stock photo.</p>
        </div>
        <figure class="team-photo">
          <img src="${TEAM_PHOTO.src}" alt="${TEAM_PHOTO.alt}" width="1600" height="900">
          <figcaption>Co-founder Jim Bennett and Construction Manager Brandon Gurr comparing countertop and cabinet options.</figcaption>
        </figure>
        <div class="team-grid" id="team-list"></div>
      </div>
    </section>

    <section class="cta-band">
      <div class="wrap">
        <h2>Have a fire or water damage situation?</h2>
        <p>Call Gold Water Fire to talk to our team.</p>
        <a class="btn-primary" href="tel:+14809993339">Call (480) 999-3339</a>
      </div>
    </section>`;

  return shell({
    path: "/about.html",
    title: "About | Gold Water Fire, Phoenix, AZ Metro",
    description: "Gold Water Fire is a licensed Arizona restoration and reconstruction contractor based in Chandler, AZ, co-founded by Jim Bennett and Jake Taylor.",
    h1AsTitle: "About | Gold Water Fire",
    breadcrumbLabel: "About",
    datePublished: "2026-08-06T11:55:09-07:00",
    dateModified: "2026-09-18T10:30:00-07:00",
    photo: TEAM_PHOTO,
    bodyHtml,
  });
}
