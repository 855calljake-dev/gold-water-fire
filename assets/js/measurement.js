// GWF static pages only. Collection stays absent on forms and nonproduction hosts.
(function () {
  "use strict";
  var script = document.currentScript;
  var id = script && script.dataset.measurementId;
  var path = script && script.dataset.pagePath;
  var origin = "https://www.goldwaterfire.com";
  function normalized(value) {
    return value.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/$/, "") || "/";
  }
  function optedOut() {
    try {
      return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" ||
        window["ga-disable-" + id] === true || localStorage.getItem("gwf-analytics-opt-out") === "true";
    } catch (_) {
      return true;
    }
  }
  if (!/^G-[A-Z0-9]{10}$/.test(id || "") || id === "G-Z8RSYV9HRM" ||
      !/^\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+\.html)?$/.test(path || "") ||
      ["/contact", "/thanks", "/404"].includes(normalized(path)) ||
      window.location.origin !== origin || window.location.search || window.location.hash ||
      normalized(window.location.pathname) !== normalized(path) ||
      optedOut() || window.__gwfMeasurementLoaded) return;

  var referrer = "";
  try {
    var source = new URL(document.referrer);
    if ([origin, "https://www.google.com", "https://www.bing.com", "https://duckduckgo.com", "https://search.yahoo.com"].includes(source.origin) &&
        !source.username && !source.password) referrer = source.origin + "/";
  } catch (_) {}
  window.__gwfMeasurementLoaded = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  var fields = {
    page_location: origin + path,
    page_referrer: referrer,
    page_title: "Gold Water Fire",
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  };
  gtag("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted"
  });
  gtag("set", fields);
  gtag("js", new Date());
  gtag("config", id, Object.assign({ send_page_view: false }, fields));
  function event(name) {
    if (optedOut()) {
      window["ga-disable-" + id] = true;
      return;
    }
    gtag("event", name, Object.assign({ send_to: id, tenant_slug: "gwf" }, fields));
  }
  event("page_view");
  var loader = document.createElement("script");
  loader.async = true;
  loader.referrerPolicy = "no-referrer";
  loader.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  document.head.appendChild(loader);
  document.addEventListener("click", function (eventObject) {
    if (!eventObject.isTrusted || eventObject.defaultPrevented) return;
    var link = eventObject.target.closest && eventObject.target.closest("a[href]");
    if (!link || !/^tel:\+?1?4809993339$/.test(link.getAttribute("href").replace(/[ ()-]/g, ""))) return;
    event("phone_click");
  });
})();
