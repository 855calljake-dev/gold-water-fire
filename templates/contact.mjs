import { shell } from "./shell.mjs";

export function renderContact() {
  const bodyHtml = `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / Contact</div>
        <h1>Request Service</h1>
        <p>Free inspection, no obligation. Call for the fastest response, or send us the details and we'll follow up.</p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="contact-grid">
          <div>
            <form class="quote-form" name="service-request" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="company">
              <input type="hidden" name="form-name" value="service-request">
              <p class="field" style="display:none">
                <label>Leave this field blank<input name="company"></label>
              </p>
              <div class="field">
                <label for="name">Name</label>
                <input type="text" id="name" name="name" required>
              </div>
              <div class="field">
                <label for="phone">Phone</label>
                <input type="tel" id="phone" name="phone" required>
              </div>
              <div class="field">
                <label for="email">Email</label>
                <input type="email" id="email" name="email">
              </div>
              <div class="field">
                <label for="address">Property Address</label>
                <input type="text" id="address" name="address">
              </div>
              <div class="field">
                <label for="service">What happened?</label>
                <select id="service" name="service">
                  <option value="Water damage">Water damage</option>
                  <option value="Fire damage">Fire damage</option>
                  <option value="Reconstruction / rebuild">Reconstruction / rebuild</option>
                  <option value="Not sure">Not sure</option>
                </select>
              </div>
              <div class="field">
                <label for="message">Details</label>
                <textarea id="message" name="message" placeholder="Tell us what's going on and when it happened."></textarea>
              </div>
              <button type="submit">Send Request</button>
              <p class="form-note">For active flooding or fire, call (480) 999-3339 instead of submitting this form.</p>
            </form>
          </div>
          <div>
            <ul class="info-list">
              <li>
                <strong>Phone</strong>
                <a href="tel:+14809993339">(480) 999-3339</a>
              </li>
              <li>
                <strong>Email</strong>
                <a href="mailto:Help@goldwaterfire.com">Help@goldwaterfire.com</a>
              </li>
              <li>
                <strong>Address</strong>
                <span>221 E Willis Rd Ste 8<br>Chandler, AZ 85286</span>
              </li>
              <li>
                <strong>License</strong>
                <span>AZ ROC #264344 · KB-2</span>
              </li>
              <li>
                <strong>Service Area</strong>
                <span>Phoenix, AZ metro area</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>`;

  return shell({
    path: "/contact.html",
    title: "Contact | Gold Water Fire — Phoenix, AZ Metro",
    description: "Request service or ask a question. Gold Water Fire serves the Phoenix, AZ metro area. Call (480) 999-3339 or send a request online.",
    h1AsTitle: "Contact | Gold Water Fire",
    breadcrumbLabel: "Contact",
    bodyHtml,
  });
}
