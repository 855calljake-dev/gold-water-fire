// Ops telemetry — what this worker writes down about itself so it shows up in
// the daily report. Spec: bytomorrow-bos doctrine/SOP-DAILY-OPS-REPORT.md.
//
// Airtable is the store and also the table Jake clicks into from the email,
// so there is one place, not a store plus a copy of it that can disagree.
// Plain fetch(), no SDK -- same reasoning as image.mjs and draft.mjs.
//
// Deliberately duplicated from bytomorrow-platform's src/lib/ops/telemetry.ts
// rather than shared: Tier-1 tenants have no build step and no dependencies,
// and §8.4 already sets the precedent that the next tenant copies this file
// until a real template repo is extracted. If the field names here and there
// drift apart, the report silently loses this tenant -- keep them identical.
//
// EVERY CALL HERE FAILS SOFT. Telemetry must never be able to break the work
// it describes. A run that shipped five pages and failed to record it is a
// reporting bug; a run that died trying to report is an outage caused by the
// reporting system, which is strictly worse than having none.

const AIRTABLE_API = "https://api.airtable.com/v0";
export const TENANT = "gold-water-fire";

function config() {
  const pat = process.env.AIRTABLE_OPS_PAT;
  const baseId = process.env.AIRTABLE_OPS_BASE_ID;
  if (!pat || !baseId) return null;
  return {
    pat,
    baseId,
    runs: process.env.AIRTABLE_OPS_RUNS_TABLE || "Runs",
    artifacts: process.env.AIRTABLE_OPS_ARTIFACTS_TABLE || "Artifacts",
  };
}

async function createRows(cfg, table, rows) {
  // Airtable caps batch creates at 10.
  for (let i = 0; i < rows.length; i += 10) {
    const res = await fetch(`${AIRTABLE_API}/${cfg.baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.pat}`, "content-type": "application/json" },
      body: JSON.stringify({
        records: rows.slice(i, i + 10).map((fields) => ({ fields })),
        typecast: true,
      }),
    });
    if (!res.ok) throw new Error(`Airtable ${table} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/**
 * One row for this run. `status` is ran | partial | failed -- note there is no
 * "did not fire": a worker cannot report its own silence, so absence is that
 * signal and the report's roster infers it.
 */
export async function recordRun({ date, surface, status, attempted, published, failures, spendUsd, durationSec, note }) {
  const cfg = config();
  if (!cfg) {
    console.log("[ops] telemetry not configured (AIRTABLE_OPS_PAT / AIRTABLE_OPS_BASE_ID) -- this run will show as DID NOT FIRE in the daily report");
    return false;
  }
  try {
    await createRows(cfg, cfg.runs, [{
      Date: date,
      Tenant: TENANT,
      Surface: surface,
      Status: status,
      Attempted: attempted,
      Published: published,
      Failures: (failures || []).join("\n"),
      "Spend USD": Object.values(spendUsd || {}).reduce((a, b) => a + b, 0),
      "Spend By Account": Object.entries(spendUsd || {}).map(([k, v]) => `${k}: $${v.toFixed(2)}`).join("\n"),
      "Duration Sec": durationSec ?? null,
      Note: note || "",
    }]);
    console.log(`[ops] recorded run: ${surface} ${status}, ${attempted} attempted / ${published} published`);
    return true;
  } catch (err) {
    console.log(`[ops] run record failed (${err.message}) -- the run itself is unaffected`);
    return false;
  }
}

/** One row per thing produced -- the named list behind a number in the email. */
export async function recordArtifacts(artifacts) {
  if (!artifacts?.length) return 0;
  const cfg = config();
  if (!cfg) return 0;
  try {
    await createRows(cfg, cfg.artifacts, artifacts.map((a) => ({
      Date: a.date,
      Tenant: TENANT,
      Surface: a.surface,
      Type: a.type,
      Name: a.name,
      Status: a.status,
      // Jake's instruction: the row points at the site's MENU, not the page --
      // he navigates from the hub. buildMenuUrl() below is the only place that
      // decides which hub a given page belongs under.
      "Menu URL": a.menuUrl || "",
      "Direct URL": a.directUrl || "",
      Reason: a.reason || "",
      "Cost USD": a.costUsd ?? null,
    })));
    console.log(`[ops] recorded ${artifacts.length} artifact row(s)`);
    return artifacts.length;
  } catch (err) {
    console.log(`[ops] artifact rows failed (${err.message}) -- the run itself is unaffected`);
    return 0;
  }
}

const SITE = "https://www.goldwaterfire.com";

/**
 * The menu/hub a page lives under, never the page itself. Educational pages
 * hang off the guides hub; location pages off the service page they belong to.
 * If a path doesn't match either shape the homepage is the honest fallback --
 * better than linking somewhere that doesn't list the page.
 */
export function buildMenuUrl(page) {
  const path = page?.path || "";
  if (path.startsWith("/guides/")) return `${SITE}/guides/`;
  if (path.includes("water-damage")) return `${SITE}/water-damage-restoration.html`;
  if (path.includes("fire-damage")) return `${SITE}/fire-damage-restoration.html`;
  if (path.includes("reconstruction")) return `${SITE}/reconstruction.html`;
  return `${SITE}/`;
}
