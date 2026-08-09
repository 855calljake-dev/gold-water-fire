// Automated image generation, per bytomorrow-bos SOP-AGENTIC-SEO-WEBSITES.md
// §8. Plain fetch() to Higgsfield's REST API -- no SDK dependency, matching
// this worker's existing style (draft.mjs calls Claude the same way).
//
// §8.5, strengthened by Jake 2026-08-08: an approved image is a RELEASE
// requirement now, not a nice-to-have. A failed generation must not crash
// the run or block other pages, but a page whose image failed must not ship
// in this batch either -- run.mjs is the one that enforces "don't ship
// without an image" by simply not including the item in `drafted[]` when
// this returns null. This file only ever reports success or failure; it
// never decides whether a page is allowed to go out without a photo.

const API_BASE = "https://platform.higgsfield.ai";

// §8.1: credential shape needs reconciling at implementation time, not
// assumed. KEY-INVENTORY.md records a single HIGGSFIELD_API_KEY value (no
// separate ID/secret pair recorded) -- Higgsfield's documented header format
// is "Authorization: Key {id}:{secret}". Passing the stored value through
// verbatim (not parsed/split) is correct either way: if Jake stored it as
// one "id:secret" string, this works unmodified; if it turns out to be
// stored differently, this is the one line to fix once that's confirmed
// against a live account.
function authHeader(apiKey) {
  return `Key ${apiKey}`;
}

// §8.1/§8.4: model id per Higgsfield's own docs (docs.higgsfield.ai) --
// their published examples only show "higgsfield-ai/soul/standard" and
// "reve/text-to-image", not this one, so it was tested rather than trusted:
// a real request to POST /nano_banana_pro with a deliberately-fake key
// returned 401 "Invalid credentials", not 404 -- meaning the route itself
// is real and correctly matched before auth was even checked. That's the
// strongest confirmation available without a live key (HIGGSFIELD_API_KEY
// isn't deployed to this service yet -- KEY-INVENTORY.md). Only the actual
// credential value remains genuinely unverified; the endpoint shape is not
// a guess anymore.
const MODEL_ID = "nano_banana_pro";

// §8.2: priced from the live account. nano_banana_pro = 2 credits/image,
// Ultra plan ~$99-129/mo for 3,000 credits -> ~$0.066-0.086/image. Using the
// higher end as the conservative budget estimate.
export const IMAGE_COST_USD_ESTIMATE = 0.086;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

// §8.3: illustrative only, text-to-image only in the automated path -- no
// photo-of-a-real-person edit/reference inputs, ever, no exceptions an
// unattended worker could reach for. Matches the documentary restoration-
// photography style already established by hand for GWF's existing images.
function buildPrompt(item) {
  const subject = item.type === "location"
    ? `${item.service} in a residential property in ${item.city}, Arizona`
    : item.topic;

  return [
    "Photorealistic documentary-style photograph, restoration technician in plain workwear",
    `performing work related to: ${subject}.`,
    "Technician's face not the focal point (side, back, or obscured by equipment/PPE) --",
    "a generic, non-identifiable person, never a real recognizable individual.",
    "Real-looking residential interior or exterior setting, natural or practical lighting,",
    "shallow depth of field, warm neutral tones.",
    "No visible logos, no text, no brand markings, no watermark, no address or license plate,",
    "no baked-in captions or callouts -- plain photography only.",
    "Editorial restoration-industry photography style, matching a professional stock-photo look.",
  ].join(" ");
}

// §8.3: filename convention subject-service-geography-purpose. Backlog
// slugs already encode subject/service/purpose (they're unique per page by
// construction); this appends a geography token so every filename carries
// one, matching the convention's own worked example
// ("water-damage-drying-equipment-exposed-studs-arizona.png").
function buildFilename(item) {
  const geography = item.type === "location"
    ? item.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : "phoenix";
  return `${item.slug}-${geography}-az.jpg`;
}

function buildAlt(item) {
  return item.type === "location"
    ? `Restoration technician performing ${item.service.toLowerCase()} work at a property in ${item.city}, Arizona`
    : `Restoration technician illustrating: ${item.topic}`;
}

async function pollUntilDone(requestId, apiKey) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/requests/${requestId}/status`, {
      headers: { authorization: authHeader(apiKey) },
    });
    if (!res.ok) throw new Error(`Higgsfield status poll ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "failed" || data.status === "nsfw") {
      throw new Error(`Higgsfield generation ${data.status}: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Higgsfield generation timed out after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * Generate one illustrative image for a backlog item. Never throws -- a
 * failure here must not crash the run or block other pages (§8.5). Returns
 * null on any failure; the caller (run.mjs) is responsible for treating
 * null as "this page does not ship this run," not for retrying internally.
 */
export async function generateImage({ item, apiKey }) {
  try {
    const submitRes = await fetch(`${API_BASE}/${MODEL_ID}`, {
      method: "POST",
      headers: {
        authorization: authHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: buildPrompt(item),
        aspect_ratio: "16:9",
        resolution: "1k",
      }),
    });
    if (!submitRes.ok) {
      console.log(`[image] Higgsfield submit failed ${submitRes.status}: ${await submitRes.text()}`);
      return null;
    }
    const submitData = await submitRes.json();
    const requestId = submitData.request_id || submitData.id;
    if (!requestId) {
      console.log(`[image] Higgsfield response had no request_id: ${JSON.stringify(submitData)}`);
      return null;
    }

    const result = await pollUntilDone(requestId, apiKey);
    const imageUrl = result.images?.[0]?.url;
    if (!imageUrl) {
      console.log(`[image] Higgsfield completed with no image URL: ${JSON.stringify(result)}`);
      return null;
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Downloading generated image failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    return {
      filename: buildFilename(item),
      alt: buildAlt(item),
      buffer,
      costUsd: IMAGE_COST_USD_ESTIMATE,
    };
  } catch (err) {
    console.log(`[image] Generation failed for ${item.slug}: ${err.message}`);
    return null;
  }
}
