// Shared helpers. Zero external dependencies on purpose — this stays a plain
// Node script, not a framework, per SOP-AGENTIC-SEO-WEBSITES.md §4.

export const BRAND = {
  name: "Gold Water Fire",
  phone: "(480) 999-3339",
  phoneHref: "tel:+14809993339",
  email: "Help@goldwaterfire.com",
  addressLine1: "221 E Willis Rd Ste 8",
  addressLine2: "Chandler, AZ 85286",
  city: "Chandler",
  region: "AZ",
  postalCode: "85286",
  license: "AZ ROC #264344 · KB-2",
  siteUrl: "https://www.goldwaterfire.com",
  // Google Business Profile link, in the footer of every page (ByTomorrow standard,
  // Jake 2026-11-07). The profile exists in Business Profile Manager but is still
  // "Verification required" (read 2026-11-07), so Maps has no public listing yet; this
  // search resolves to the listing the day it verifies. Swap to the place link
  // (https://www.google.com/maps/place/?q=place_id:...) once it is public.
  googleBusinessProfileUrl:
    "https://www.google.com/maps/search/?api=1&query=Gold+Water+Fire+221+E+Willis+Rd+Ste+8+Chandler+AZ+85286",
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function absUrl(path) {
  return BRAND.siteUrl + (path.startsWith("/") ? path : "/" + path);
}

// The text-message consent wording. This is the wording Gold Water Roof's
// approved A2P 10DLC campaign filed with Twilio, with only the name changed. A
// carrier reviewer compares the page to the filing, so change it only together
// with the filing. scripts/consent.test.mjs holds a literal copy on purpose.
export const SMS_CONSENT_TEXT = "I agree to receive text messages from Gold Water Fire about this request (appointment confirmations, reminders and estimate updates) at the number above. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Agreeing is not a condition of purchase.";

// The consent box for every form that takes a phone number. Unticked, optional
// and separate from sending the form: consent is never a condition of service.
// A browser leaves an unticked checkbox out of the POST, so a Netlify Forms
// submission carries sms_consent=yes when ticked and no such field when not.
// Netlify only keeps fields it found in the deployed HTML, which is why this
// has to be a real field in every built form, not something added by script.
export function smsConsentField(idPrefix) {
  const id = `${idPrefix}-sms-consent`;
  return `<div class="sms-consent">
            <input type="checkbox" id="${id}" name="sms_consent" value="yes">
            <div>
              <label class="sms-consent-text" for="${id}">${esc(SMS_CONSENT_TEXT)}</label>
              <p class="sms-consent-links"><a href="/privacy/">Privacy Policy</a> and <a href="/terms/">Terms</a></p>
            </div>
          </div>`;
}

// The confirmed service-area list (CLAIMS-TO-VERIFY.md, 2026-08-06). Shared by
// the homepage, the service pages and the LocalBusiness schema in shell.mjs.
export const CITIES = [
  "Phoenix", "Mesa", "Chandler", "Scottsdale", "Glendale", "Gilbert", "Tempe", "Peoria", "Surprise",
  "Avondale", "Goodyear", "Buckeye", "Apache Junction", "Queen Creek", "San Tan Valley",
  "Fountain Hills", "Paradise Valley", "Cave Creek", "El Mirage", "Tolleson", "Litchfield Park",
];
