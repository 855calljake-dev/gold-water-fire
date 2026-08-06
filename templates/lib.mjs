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
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function absUrl(path) {
  return BRAND.siteUrl + (path.startsWith("/") ? path : "/" + path);
}
