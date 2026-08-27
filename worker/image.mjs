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
//
// §8.3.1 (Jake's ruling 2026-08-09, cross-tenant): every generated image
// carries embedded IPTC/XMP/EXIF metadata before it ships. Ported here from
// jaketaylor-home-loans/worker/image.mjs, which built it first. See
// embedSeoMetadata() below for the two deliberate deviations from that
// reference implementation.

// §8.3.2 (Jake's design 2026-08-26, cross-tenant): the image text gate, added
// here 2026-08-26. It is the one step in this file that does NOT fail soft.
// The prompt below has said "no visible logos, no text, no brand markings, no
// watermark" since it was written and the model ignored it: the audit of all
// 111 live images on 2026-08-26 found five carrying machine-invented
// lettering, one of which OCR ranked at confidence 95 and four of which only a
// human eye caught. A prompt is not a defence. See imageTextGate.mjs for the
// rule, the brand allowlist this tenant needs, and what the gate cannot catch.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanForRenderedText } from "./imageTextGate.mjs";

const execFileAsync = promisify(execFile);

const API_BASE = "https://platform.higgsfield.ai";

// §8.1: credential shape confirmed live 2026-08-08, not assumed --
// cloud.higgsfield.ai issues an ID and a Secret as two separate values from
// one "Create API Key" action. config.mjs reads both
// (HIGGSFIELD_CONTENT_API_KEY_ID / _SECRET) and combines them into the
// single "id:secret" string Higgsfield's documented header format expects
// ("Authorization: Key {id}:{secret}") before this module ever sees it --
// this function stays unaware it was ever two values.
function authHeader(apiKey) {
  return `Key ${apiKey}`;
}

// §8.1/§8.4: model slug and request body, both read off the live API with
// the real credential on 2026-08-11 -- not from docs, not inferred.
//
// ~~a real request to POST /nano_banana_pro with a deliberately-fake key
// returned 401 "Invalid credentials", not 404 -- meaning the route itself
// is real ... the endpoint shape is not a guess anymore.~~ Wrong, and the
// first run with real credentials disproved it: every page failed with
// `404 {"detail":"model_not_found"}`. A fake key returning 401 only proved
// auth is checked BEFORE the model is resolved. Left visible on purpose:
// the mistake was promoting a plausible inference to "confirmed."
//
// What GET /models actually returns for this account -- the whole catalog,
// 13 entries, and **no nano_banana_pro among them at any spelling**. The
// only text2image models this account can call:
//
//     higgsfield-ai/soul/standard      1.0000 credits
//     higgsfield-ai/soul/v2/standard   0.0000
//     higgsfield-ai/soul/cinema        0.0000
//     higgsfield-ai/soul/character     1.0000   (needs a reference input)
//     higgsfield-ai/soul/reference     1.0000   (needs a reference input)
//     higgsfield-ai/popcorn/auto       1.4720
//
// soul/character and soul/reference are excluded by §8.3, not by preference:
// the automated path must never take a photo-of-a-real-person reference
// input. soul/standard is Higgsfield's photoreal line and matches the
// documentary style §8.3 asks for. Swapping to popcorn/auto or
// soul/v2/standard is this one line if Jake prefers their look.
const MODEL_ID = "higgsfield-ai/soul/standard";

// Body shape, also confirmed live rather than copied: `prompt` sits at the
// TOP level. POST with `{input:{prompt}}` returns
// `422 {"loc":["body","prompt"],"msg":"Field required"}` -- so the nested
// `input` wrapper that jaketaylor-home-loans/worker/image.mjs sends is
// wrong, and this file's flat body was right all along. Worth fixing there.
//
// `resolution` is a closed set: 422 says "Input should be '720p' or
// '1080p'". The "1k" this file used before is not a valid value, so even
// with the correct slug every request would still have failed validation.
const RESOLUTION = "1080p";

// §8.2: repriced 2026-08-11 off the live catalog, which reports
// soul/standard at 1.0000 credits -- not the 2 credits the old
// nano_banana_pro assumption used. At the Ultra plan's ~$99-129/mo for 3,000
// credits that's ~$0.033-0.043/image; the higher end is kept as the
// conservative budget estimate, same convention as before.
export const IMAGE_COST_USD_ESTIMATE = 0.043;

const POLL_INTERVAL_MS = 3000;
// Raised 90s -> 240s on 2026-08-12. The first fully-working live run lost 2
// of 5 pages to "Higgsfield generation timed out after 90000ms" — and a
// measured generation had already taken 87s, so the old cap sat about three
// seconds above the typical case. Anything slower than average failed, which
// is why the loss rate was 40% rather than occasional. §8.5 turns a lost image
// into a lost page, so a marginal timeout is a marginal publication rate.
// 240s is ~2.75x the measured time; the run is a nightly cron with nothing
// waiting on it, so patience costs nothing and impatience costs pages.
const POLL_TIMEOUT_MS = 240_000;

// §8.3: illustrative only, text-to-image only in the automated path -- no
// photo-of-a-real-person edit/reference inputs, ever, no exceptions an
// unattended worker could reach for. Matches the documentary restoration-
// photography style already established by hand for GWF's existing images.
//
// `subjectOverride` re-rolls one page's image with a different scene without
// touching the rules below it. Added 2026-08-12 after Jake rejected a
// reconstruction image whose doors were malformed — unframed slabs, mismatched
// jambs, hardware that did not exist. Image models are unreliable at door
// furniture, and the fix is to change the SUBJECT, not to regenerate the same
// prompt and hope.
//
// The override replaces the subject clause ONLY. Every §8.3 rule after it --
// non-identifiable person, no logos, no text, no watermark -- is always
// appended and cannot be overridden from a call site. A content rule that a
// caller can switch off is not a content rule.
function buildPrompt(item, subjectOverride) {
  const subject = subjectOverride || (item.type === "location"
    ? `${item.service} in a residential property in ${item.city}, Arizona`
    : item.topic);

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
function buildFilename(item, ext) {
  const geography = item.type === "location"
    ? item.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : "phoenix";
  return `${item.slug}-${geography}-az.${ext}`;
}

// The extension has to match the actual bytes, not what we hoped for.
// exiftool picks its parser from the file extension and hard-refuses a
// mismatch -- "Not a valid JPG (looks more like a PNG)" -- which the §8.3.1
// fail-soft then swallows, shipping an untagged image and logging it as a
// missing binary. That is exactly what happened on the first real generation
// (2026-08-11): this function named every file .jpg, and Higgsfield returns
// PNG. Sniffing the magic bytes means the name follows the file, and a
// provider that switches format later can't silently break tagging again.
function detectImageExtension(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function buildAlt(item) {
  return item.type === "location"
    ? `Restoration technician performing ${item.service.toLowerCase()} work at a property in ${item.city}, Arizona`
    : `Restoration technician illustrating: ${item.topic}`;
}

// §8.3, page weight (Jake's call 2026-08-11: "let's make the images
// lighter"). Higgsfield returns a ~1.9MB PNG at 2048x1152. Gold Water Fire's
// hand-made images are 1600x893 JPEGs at ~270KB, so unconverted worker output
// was roughly 7x heavier than the house convention -- a straight Core Web
// Vitals cost on a site whose entire purpose is ranking. These constants
// match the existing images rather than inventing a new standard.
const TARGET_WIDTH = 1600;
const JPEG_QUALITY = 82;

// ImageMagick 7 ships `magick`; Debian/Ubuntu's `imagemagick` package is
// still 6.x, where the binary is `convert`. Railway's Nixpacks image is
// Ubuntu, so the deployed side is the one that needs `convert` -- try both
// rather than assuming the local dev spelling is what production has.
const MAGICK_BINARIES = ["magick", "convert"];

// Convert to a web-weight JPEG before anything else touches the bytes.
// Fails soft, like the metadata step: if ImageMagick isn't on the host the
// original image still ships, just heavy. A page losing its image over a
// compression step would invert §8.5, same reasoning as embedSeoMetadata().
//
// Runs BEFORE embedSeoMetadata() deliberately -- conversion rewrites the file
// and would discard anything written first. `-strip` clears whatever the
// generator left behind so the only metadata on the shipped file is ours.
async function optimizeForWeb(buffer, sourceExt, filenameHint) {
  const inPath = join(tmpdir(), `gwf-src-${process.pid}-${filenameHint}.${sourceExt}`);
  const outPath = join(tmpdir(), `gwf-opt-${process.pid}-${filenameHint}.jpg`);
  try {
    await writeFile(inPath, buffer);
    let lastErr = null;
    for (const bin of MAGICK_BINARIES) {
      try {
        await execFileAsync(bin, [
          inPath,
          "-resize", `${TARGET_WIDTH}x>`,   // ">" = only shrink, never upscale
          "-strip",
          "-interlace", "Plane",            // progressive: better perceived load
          "-sampling-factor", "4:2:0",
          "-colorspace", "sRGB",
          "-quality", String(JPEG_QUALITY),
          outPath,
        ]);
        const optimized = await readFile(outPath);
        const pct = Math.round((1 - optimized.length / buffer.length) * 100);
        console.log(`[image] Optimized ${sourceExt.toUpperCase()} -> JPEG via ${bin}: ${buffer.length} -> ${optimized.length} bytes (${pct}% smaller, max ${TARGET_WIDTH}px wide)`);
        return { buffer: optimized, ext: "jpg" };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("no ImageMagick binary found");
  } catch (err) {
    console.log(`[image] Optimization SKIPPED (${err.message}) -- shipping the original ${sourceExt.toUpperCase()} at ${buffer.length} bytes; ImageMagick may not be installed on this host`);
    return { buffer, ext: sourceExt };
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

// §8.3.1: an image file is indexable content on its own -- Google Images and
// AI crawlers read embedded IPTC/XMP/EXIF off the file, a separate signal
// from the page's <img alt="">. Shells out to the `exiftool` CLI rather than
// adding an npm dependency: a system binary matches this worker family's
// "plain script, no SDK" ethos, the same reasoning §8.1 gives for calling
// Higgsfield through fetch() instead of its SDK.
//
// FAILS SOFT, on purpose: returns the original buffer unchanged if exiftool
// isn't installed on the host. A missing metadata pass must never cost the
// page its image -- §8.5 makes the image itself a release requirement, and
// dropping a whole page because a secondary tagging step couldn't run would
// invert that. `[image] SEO metadata` is logged either way so a silent
// degradation is still visible in the run log.
//
// Two deliberate deviations from the JTHL reference implementation, both
// verified against exiftool 13.55 before writing rather than assumed:
//   1. Keywords/Subject are passed as repeated flags, not one comma-joined
//      string. JTHL's `-Keywords=a,b,c` lands as a SINGLE keyword containing
//      commas; repeating the flag produces the real multi-value list that
//      IPTC/XMP consumers expect.
//   2. Tags are group-qualified (`-XMP-dc:Title`, `-IPTC:ObjectName`,
//      `-EXIF:Artist`) instead of bare. Bare `-Title=` writes only XMP-dc,
//      so JTHL's images carry no IPTC title at all; and its bare `-Title`
//      followed by `-XMP:Title` was two writes to the same one field.
// Both are worth folding back into JTHL and the SOP -- noted, not silently
// diverged.
function buildMetadataArgs({ item, page, copyrightYear }) {
  const owner = "Gold Water Fire";
  // Both halves are confirmed facts (facts.mjs). Year comes from the page's
  // own datePublished, not a bare new Date() -- run.mjs deliberately keeps
  // every date in this pipeline traceable to its one injected value, and a
  // hardcoded year would silently go stale in January.
  const copyright = `© ${copyrightYear} ${owner} · AZ ROC #264344 KB-2`;

  // Derived from the page actually being illustrated -- never boilerplate.
  // `page` here has already passed the evidence gate, so these strings
  // describe checked content.
  const keywords = [
    owner,
    item.type === "location" ? item.service : item.topic,
    item.type === "location" ? `${item.city}, Arizona` : "Phoenix, Arizona",
    "restoration contractor",
  ].filter(Boolean);

  const args = [
    "-overwrite_original",
    `-XMP-dc:Title=${page.title}`,
    // IPTC caps ObjectName at 64 bytes and truncates mid-word with a minor
    // warning. Cut it on a word boundary here so the title reads as a phrase
    // rather than being sheared in half.
    `-IPTC:ObjectName=${truncateOnWord(page.title, 64)}`,
    `-XMP-dc:Description=${page.description}`,
    `-IPTC:Caption-Abstract=${page.description}`,
    `-EXIF:ImageDescription=${page.description}`,
    `-EXIF:Artist=${owner}`,
    `-XMP-dc:Creator=${owner}`,
    `-IPTC:By-line=${owner}`,
    `-EXIF:Copyright=${copyright}`,
    `-IPTC:CopyrightNotice=${copyright}`,
    `-XMP-dc:Rights=${copyright}`,
    `-IPTC:Credit=${owner}`,
    `-IPTC:Source=https://www.goldwaterfire.com`,
  ];

  // Real geo signal on location pages, from the page's own city -- not
  // stamped onto educational pages, which aren't about a specific place.
  if (item.type === "location") {
    args.push(`-IPTC:City=${item.city}`);
    args.push("-IPTC:Province-State=Arizona");
    args.push("-IPTC:Country-PrimaryLocationName=United States");
  }

  // Clear first, then append: exiftool merges into existing list tags, and
  // Higgsfield could hand back a file that already carries its own.
  args.push("-IPTC:Keywords=", "-XMP-dc:Subject=");
  for (const kw of keywords) {
    args.push(`-IPTC:Keywords=${kw}`, `-XMP-dc:Subject=${kw}`);
  }

  return args;
}

// Titles here are "<the page's real subject> | Gold Water Fire ...", and they
// run past IPTC's 64-byte ObjectName limit often enough to matter. Cutting at
// the title's own separator keeps the subject clause whole instead of leaving
// a sheared brand fragment ("... | Gold"); nothing is lost, because the full
// title is still in XMP-dc:Title and the brand is in By-line/Credit/Keywords.
// Falls back to a word boundary for a title with no separator in range.
function truncateOnWord(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSeparator = Math.max(cut.lastIndexOf("|"), cut.lastIndexOf("—"), cut.lastIndexOf(" - "));
  const boundary = lastSeparator > 0 ? lastSeparator : cut.lastIndexOf(" ");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/[\s|,·—-]+$/, "");
}

export async function embedSeoMetadata(buffer, { item, page, filename }) {
  const tmpPath = join(tmpdir(), `gwf-img-${process.pid}-${filename}`);
  try {
    await writeFile(tmpPath, buffer);
    const copyrightYear = (page.datePublished || "").slice(0, 4) || String(new Date().getUTCFullYear());
    await execFileAsync("exiftool", [...buildMetadataArgs({ item, page, copyrightYear }), tmpPath]);
    const tagged = await readFile(tmpPath);
    console.log(`[image] SEO metadata embedded in ${filename} (${buffer.length} -> ${tagged.length} bytes)`);
    return tagged;
  } catch (err) {
    console.log(`[image] SEO metadata SKIPPED for ${filename} (${err.message}) -- image ships untagged; exiftool may not be installed on this host`);
    return buffer;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
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

// Statuses that mean "this will fail identically for every other page in
// this run": a bad credential, an exhausted balance, a model that doesn't
// exist on this account. Nothing page-specific can change any of them, so
// there is no point drafting four more pages with Opus to find out.
// Deliberately NOT including 429 -- rate limiting is transient and the next
// page may well succeed.
const ACCOUNT_LEVEL_STATUSES = new Set([401, 403, 404]);

/**
 * Generate one illustrative image for a backlog item. Never throws -- a
 * failure here must not crash the run or block other pages (§8.5).
 *
 * Returns one of three things:
 *   - `{ filename, alt, buffer, costUsd }` on success
 *   - `null` on a failure specific to this page; run.mjs treats that as
 *     "this page does not ship this run" and moves on to the next one
 *   - `{ accountFailure: true, reason }` when the failure is account-level
 *     and will recur for every remaining page -- run.mjs stops the run
 *
 * That third case exists because of what this pipeline costs when it is
 * broken. Text is drafted BEFORE its image is attempted, so a dead image
 * provider means every page burns a full Opus draft and is then thrown away
 * by §8.5's release gate. That is exactly what happened 2026-08-11:
 * ~$2/night for five discarded drafts, nightly, while the account sat at
 * `not_enough_credits`. Failing fast turns that into one wasted draft.
 *
 * `page` is the drafted page this image illustrates, already through the
 * evidence gate -- it exists here only so §8.3.1's embedded metadata can be
 * derived from real page content instead of a boilerplate string.
 */
export async function generateImage({ item, page, apiKey, subjectOverride }) {
  try {
    const submitRes = await fetch(`${API_BASE}/${MODEL_ID}`, {
      method: "POST",
      headers: {
        authorization: authHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: buildPrompt(item, subjectOverride),
        aspect_ratio: "16:9",
        resolution: RESOLUTION,
      }),
    });
    if (!submitRes.ok) {
      const body = await submitRes.text();
      console.log(`[image] Higgsfield submit failed ${submitRes.status}: ${body}`);
      if (ACCOUNT_LEVEL_STATUSES.has(submitRes.status)) {
        return { accountFailure: true, reason: `Higgsfield ${submitRes.status} ${body.slice(0, 160)}` };
      }
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
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

    const sourceExt = detectImageExtension(rawBuffer);
    if (!sourceExt) {
      // A 200 that isn't a recognizable image is not something to ship and
      // hope about -- §8.5 would rather drop the page than publish a mystery
      // file under an image name.
      console.log(`[image] Downloaded file is not a recognized image (first bytes: ${rawBuffer.subarray(0, 8).toString("hex")}) -- not shipping`);
      return null;
    }

    // Compress first, then tag. recorder.mjs commits whatever it's handed, so
    // the tagging step has to be last -- this is the final point at which the
    // file that ships and the file that got tagged are the same bytes.
    const optimized = await optimizeForWeb(rawBuffer, sourceExt, item.slug);

    // §8.3.2 text gate, and its placement AFTER optimizeForWeb is deliberate:
    // the threshold of 65 was measured on this site's 1600px JPEGs, which is
    // what actually ships. Checking the raw 2048px PNG would be checking a
    // different artifact at a resolution the numbers were never taken at.
    //
    // Returning null is not a shrug, it is the whole enforcement. run.mjs
    // already refuses to ship a page whose image came back null (§8.5,
    // strengthened 2026-08-08), so a text rejection is simply an image
    // failure and the backlog item stays `pending` for the next run. There is
    // deliberately no second mechanism here.
    //
    // Not an accountFailure: the provider is working fine, it drew words. The
    // next page may well come back clean, so the run keeps going.
    const textCheck = await scanForRenderedText(optimized.buffer, optimized.ext, item.slug);
    if (!textCheck.ok) {
      console.log(`[image] TEXT GATE REJECTED ${item.slug} (§8.3.2): ${textCheck.reason}`);
      return null;
    }
    if (textCheck.allowed.length) {
      console.log(`[image] Text gate passed ${item.slug}; brand tokens allowlisted: ${textCheck.allowed.map((t) => `${t.text}(${t.conf.toFixed(0)})`).join(", ")}`);
    }

    const filename = buildFilename(item, optimized.ext);
    const buffer = await embedSeoMetadata(optimized.buffer, { item, page, filename });

    return {
      filename,
      alt: buildAlt(item),
      buffer,
      costUsd: IMAGE_COST_USD_ESTIMATE,
    };
  } catch (err) {
    console.log(`[image] Generation failed for ${item.slug}: ${err.message}`);
    return null;
  }
}
