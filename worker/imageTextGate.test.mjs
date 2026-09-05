#!/usr/bin/env node
// Seeded regression test for the §8.3.2 image text gate. Run it:
//
//   npm run test:imagegate
//
// WHY A SEEDED CORPUS RATHER THAN A DESCRIPTION. This repo's em dash gate
// (af5f0c6) was proven by seeding thirteen deliberately bad pages plus the
// cases that must NOT fail, and running it. Reading a gate tells you what its
// author meant; running it tells you what it does. This is that, for pixels.
//
// THE CORPUS IS REAL PRODUCTION OUTPUT, not synthetic. Every file below either
// is live on www.goldwaterfire.com right now, or was until 8bc8f93 pulled it.
//
//   worker/test-fixtures/garbled/ holds the two images pulled from the live
//   site on 2026-08-26 for carrying machine-invented lettering. They were
//   recovered out of git history rather than re-downloaded, so they are the
//   exact bytes that shipped. They stop being served to readers and start
//   earning their keep as evidence.
//
//   Everything else is referenced in place under assets/img/, not copied,
//   because duplicating megabytes of binaries to assert that a file passes a
//   gate it already passes is waste. The tradeoff: if a future session
//   regenerates one of them, this corpus changes underneath the test. That is
//   handled rather than ignored, see PINNED below, so it can never drift
//   silently.
//
// FOUR CASE CLASSES, and the middle two are the whole reason this file is
// longer than JTHL's version of it.
//
//   MUST_REJECT   one image, the genuine defect. Peak confidence 95.
//   MUST_PASS_BRANDED   four images carrying Gold Water Fire's own navy
//                       wordmark band, correctly spelled, read by OCR at 96
//                       and 97. Without the brand allowlist in
//                       imageTextGate.mjs these would fail forever, and the
//                       gate would be switched off within a week.
//   MUST_PASS_PUNCTUATION   two images with no text in them at all, which the
//                           first draft of this rule flagged at confidence 69
//                           and 74 on a pair of em dash characters, because
//                           awk's length() counts bytes and six bytes passes a
//                           ">= 4 characters" test. The ASCII-letter match is
//                           what fixes it. These two exist so that fix can
//                           never be quietly reverted.
//   MUST_PASS_CLEAN   ten of the remaining live images, an ordinary sample.
//
// KNOWN_FALSE_NEGATIVE is the fifth entry and the honest one. The washing
// machine image was one of the five real defects on this tenant, and this gate
// scores it ZERO: tesseract does not rank its gibberish at any confidence, so
// no threshold anywhere would have caught it. It is asserted to PASS on
// purpose. If a future change starts catching it, this test fails and tells
// you that you improved something, which is the right way round. Do not read
// a green run here as "no garbled image can reach the site."
//
// A failure here is not a flaky test. It means either the gate changed or the
// corpus did, and the message says which.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanForRenderedText, TEXT_CONFIDENCE_THRESHOLD } from "./imageTextGate.mjs";

const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(WORKER_DIR);
const FIXTURES = path.join(WORKER_DIR, "test-fixtures", "garbled");
const IMG = path.join(ROOT, "assets", "img");

const fixture = (slug) => ({ slug, file: path.join(FIXTURES, `${slug}.jpg`) });
const live = (slug) => ({ slug, file: path.join(IMG, `${slug}.jpg`) });

// The one genuine defect the 2026-08-26 audit of all 111 live images found by
// OCR. An invented appliance label on the water heater tank, reading roughly
// "WHAT IS G WHEN / WATER HEATER / WHIT / ADD-ARE WATERS". Only "HEATER" clears
// the confidence threshold, and one token is all it takes.
const MUST_REJECT = [fixture("water-heater-failure-water-damage-phoenix-az")];

// See KNOWN_FALSE_NEGATIVE in the header. This is a limit, not a pass.
const KNOWN_FALSE_NEGATIVE = [fixture("washing-machine-supply-line-failure-phoenix-az")];

const MUST_PASS_BRANDED = [
  "fire-smoke-damage-restoration-cleanup-phoenix-az",
  "reconstruction-rebuild-restoration-phoenix-az",
  "restoration-contractor-phoenix-az-metro-home-exterior",
  "water-damage-restoration-drying-equipment-phoenix-az",
].map(live);

const MUST_PASS_PUNCTUATION = [
  "arizona-monsoon-season-home-prep-checklist-phoenix-az",
  "tolleson-reconstruction-tolleson-az",
].map(live);

const MUST_PASS_CLEAN = [
  "apache-junction-water-damage-restoration-apache-junction-az",
  "cave-creek-fire-damage-restoration-cave-creek-az",
  "el-mirage-reconstruction-el-mirage-az",
  "gilbert-fire-damage-restoration-gilbert-az",
  "hero-emergency-response-night-phoenix-az",
  "litchfield-park-water-damage-restoration-litchfield-park-az",
  "peoria-fire-damage-restoration-peoria-az",
  "roof-leak-vs-plumbing-leak-phoenix-az",
  "slab-leaks-signs-and-what-happens-next-phoenix-az",
  "tolleson-water-damage-restoration-tolleson-az",
].map(live);

// Every file in the corpus, pinned by content. Regenerating a live image is a
// legitimate thing for a future session to do; silently testing against a
// different picture than the one these expectations were measured on is not.
const PINNED = {
  "water-heater-failure-water-damage-phoenix-az":
    "e99fa89b0341877ae03ab28697883d59946c6ddb34883413bca19dee0c360921",
  "washing-machine-supply-line-failure-phoenix-az":
    "d20cd341038ef872440d249af672d537ebf0695a65e55ff62816d5ef5bcaa3c2",
  "fire-smoke-damage-restoration-cleanup-phoenix-az":
    "f52c46727858b8bb561216e621710d0de513c931bcd8717cc205883bd727ae69",
  "reconstruction-rebuild-restoration-phoenix-az":
    "70de64d6e9925b6c5b20f7cb7cb60c8068d0b4964cc611893751ade6c8f812b7",
  "restoration-contractor-phoenix-az-metro-home-exterior":
    "c1b150ade36118a01436099f27ec4f26e8a00b6a94b3ef744f39081b1a61eb95",
  "water-damage-restoration-drying-equipment-phoenix-az":
    "ec2a507d0f1c50a80d7fefd7b9cdf628dd52abcaa34cf6f3f392e8457b328560",
  "arizona-monsoon-season-home-prep-checklist-phoenix-az":
    "ad53893175f425029bb3b3c23c6dbbf991512cde8fc14a7855941d8225100413",
  "tolleson-reconstruction-tolleson-az":
    "dc71a3ba65e5b1e8c509ca9a8a8c204e8500321d693327193fdb2c8082c3d984",
  // Re-pinned 2026-09-04: the image was replaced by e808536 (2026-08-27,
  // "Replace the last pillarboxed image") and the pin was never updated, so
  // this case failed as CORPUS DRIFT for a week. Re-measured on the new file:
  // gate passes it clean, same as the old one.
  "apache-junction-water-damage-restoration-apache-junction-az":
    "8ffdb55f766848692f8e8b5cdedb292d3bb709b34b762f57dd702b943a8d33c0",
  "cave-creek-fire-damage-restoration-cave-creek-az":
    "44f9638dbaddfdd08f130daa4b17c3947384aac852074edaead55a8ed04e05e7",
  "el-mirage-reconstruction-el-mirage-az":
    "0d5106f83a5763e8027dd7ddd731807cd46afb84ecd6f44e394d0d557446f608",
  "gilbert-fire-damage-restoration-gilbert-az":
    "e2736919c7bdc15e71af5c7dc99f20ddb54dc1b22651593f0307e0bd94cbce2d",
  "hero-emergency-response-night-phoenix-az":
    "31a55aeecc2972f01a22480bafa6b5fda8d903da12591d795cac6fd1bbabdefa",
  "litchfield-park-water-damage-restoration-litchfield-park-az":
    "044ca3c9c3f4a9ffbbca02ee02a15cc805607b2261701a351a31b744155045dd",
  "peoria-fire-damage-restoration-peoria-az":
    "c00ef443086d8e29943520f60dfc5c90c404c278368ec3911f54f0064410d977",
  "roof-leak-vs-plumbing-leak-phoenix-az":
    "374b54a4421393f76b20890cbb0ad8c908ecebd3f05ad08be50a18c5a63ffa37",
  "slab-leaks-signs-and-what-happens-next-phoenix-az":
    "a63b12c8fedfb05d1a627413ce2164ce1e3dbe9b94fe4254f3fbe2897b549409",
  "tolleson-water-damage-restoration-tolleson-az":
    "99b8a9b79c516f02448819df4dc317c0b1870817c3ba1c299b49b8d03458f51a",
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

let failures = 0;

function fail(msg) {
  failures++;
  console.log(`  FAIL  ${msg}`);
}

async function scan({ slug, file }) {
  let buffer;
  try {
    buffer = await readFile(file);
  } catch (err) {
    fail(`${slug}: could not read ${file} (${err.message})`);
    return null;
  }
  const actual = sha256(buffer);
  const expected = PINNED[slug];
  if (expected && actual !== expected) {
    fail(`${slug}: CORPUS DRIFT. Expected sha256 ${expected.slice(0, 16)}, got ${actual.slice(0, 16)}. The file changed, so the numbers below were measured on a different picture. Re-measure and update PINNED deliberately, do not just paste the new hash.`);
    return null;
  }
  return scanForRenderedText(buffer, "jpg", slug);
}

async function main() {
  console.log(`§8.3.2 image text gate, threshold ${TEXT_CONFIDENCE_THRESHOLD}\n`);

  console.log("MUST REJECT (rendered text present):");
  for (const c of MUST_REJECT) {
    const r = await scan(c);
    if (!r) continue;
    if (!r.available) {
      fail(`${c.slug}: the gate could not run at all, so this proves nothing. ${r.reason}`);
      continue;
    }
    if (r.ok) fail(`${c.slug}: PASSED and must not. peak ${r.peakConf.toFixed(0)}, ${r.tokenCount} letter token(s).`);
    else console.log(`  ok    ${c.slug}: ${r.hits.length} hit(s), peak ${r.peakConf.toFixed(0)}`);
  }

  console.log("\nMUST PASS, this tenant's own wordmark (brand allowlist):");
  for (const c of MUST_PASS_BRANDED) {
    const r = await scan(c);
    if (!r) continue;
    if (!r.ok) fail(`${c.slug}: REJECTED and must not. ${r.reason}`);
    else if (!r.allowed.length) {
      // Passing for the wrong reason is still a broken test. If OCR stops
      // reading the band, this case no longer exercises the allowlist and
      // somebody should know before they delete it as redundant.
      fail(`${c.slug}: passed, but the brand band was not detected at all, so the allowlist is untested here. Did the image change, or the wordmark?`);
    } else {
      console.log(`  ok    ${c.slug}: allowlisted ${r.allowed.map((t) => `${t.text}(${t.conf.toFixed(0)})`).join(", ")}`);
    }
  }

  console.log("\nMUST PASS, punctuation only (the byte-length bug):");
  for (const c of MUST_PASS_PUNCTUATION) {
    const r = await scan(c);
    if (!r) continue;
    if (!r.ok) fail(`${c.slug}: REJECTED and must not. This is the byte-length regression. ${r.reason}`);
    else console.log(`  ok    ${c.slug}: ${r.tokenCount} letter token(s), peak ${r.peakConf.toFixed(0)}`);
  }

  console.log("\nMUST PASS, clean sample:");
  for (const c of MUST_PASS_CLEAN) {
    const r = await scan(c);
    if (!r) continue;
    if (!r.ok) fail(`${c.slug}: REJECTED and must not. ${r.reason}`);
    else console.log(`  ok    ${c.slug}: peak ${r.peakConf.toFixed(0)}`);
  }

  console.log("\nKNOWN LIMIT, a real defect this gate does NOT catch:");
  for (const c of KNOWN_FALSE_NEGATIVE) {
    const r = await scan(c);
    if (!r) continue;
    if (r.ok) {
      console.log(`  ok    ${c.slug}: passes, as documented. peak ${r.peakConf.toFixed(0)}, ${r.tokenCount} letter token(s). OCR does not see this image's gibberish at any confidence, so no threshold would catch it. Pixel checking is not visual review.`);
    } else {
      fail(`${c.slug}: now REJECTED, which is an IMPROVEMENT, not a bug. Something got better. Move this case to MUST_REJECT and update the header comment, then delete this line.`);
    }
  }

  const total =
    MUST_REJECT.length +
    MUST_PASS_BRANDED.length +
    MUST_PASS_PUNCTUATION.length +
    MUST_PASS_CLEAN.length +
    KNOWN_FALSE_NEGATIVE.length;

  console.log(`\n${total - failures}/${total} cases as expected.`);
  if (failures) {
    console.log(`${failures} FAILURE(S). The gate or the corpus changed. Do not ship until this is green or the change is deliberate and written down.`);
    process.exit(1);
  }
  console.log("Gate behaves as measured.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
