import { readFileSync } from "node:fs";
import { esc } from "./lib.mjs";

const config = JSON.parse(readFileSync(new URL("../content/measurement.json", import.meta.url), "utf8"));
const EXCLUDED = new Set(["/contact.html", "/thanks.html", "/404.html"]);

export function measurementTag(path, settings = config) {
  if (!settings || settings.enabled !== true) return "";
  if (settings.tenant !== "gwf" || settings.origin !== "https://www.goldwaterfire.com" ||
      !/^G-[A-Z0-9]{10}$/.test(settings.measurementId ?? "") ||
      settings.measurementId === "G-Z8RSYV9HRM" ||
      settings.enhancedMeasurementDisabled !== true) {
    throw new Error("GWF measurement requires a verified GWF stream and disabled enhanced measurement");
  }
  if (!/^\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+\.html)?$/.test(path) || EXCLUDED.has(path)) return "";
  return `<script defer src="/assets/js/measurement.js" data-measurement-id="${esc(settings.measurementId)}" data-page-path="${esc(path)}"></script>`;
}
