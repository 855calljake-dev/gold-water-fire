import { shell } from "./shell.mjs";

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
        </div>
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
    dateModified: "2026-08-07T10:36:36-07:00",
    bodyHtml,
  });
}
