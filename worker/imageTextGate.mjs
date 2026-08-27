// SOP-AGENTIC-SEO-WEBSITES.md §8.3.2, the image text gate. (Jake's design,
// 2026-08-26, scope UNIVERSAL.) Ported from
// jaketaylor-home-loans/worker/imageTextGate.mjs, which shipped it first the
// same day, with one addition this tenant needs and that one does not: the
// brand allowlist below.
//
// WHAT THIS IS FOR. A generated image was, until this file existed, the one
// artifact in the pipeline that reached a live page with nothing having looked
// at its contents. evidenceGate.mjs reads page FIELDS; it never reads pixels.
// The prompt in image.mjs has said "no visible logos, no text, no brand
// markings, no watermark" since it was written, and the model ignored it: the
// audit of all 111 live GWF images on 2026-08-26 found one carrying an
// invented appliance label reading roughly "WHAT IS G WHEN / WATER HEATER /
// WHIT / ADD-ARE WATERS". A prompt is not a defence, exactly as facts.mjs
// exists because prompt compliance is not verification.
//
// SCALE, because it decides how alarmed to be. GWF's rate is 1 bad image in
// 111. JTHL's, on the batch that triggered this rule, was 4 in 10. The gap is
// prompt shape, not luck: GWF asks for photorealistic scenes, JTHL asked for
// conceptual diagram-style illustrations, and a diagram's whole job is to
// explain, so the model reaches for labels and headings. GWF's single failure
// is the one object in 111 images that carries a printed label in real life,
// an appliance. Keep buildPrompt() scene-shaped; it is the cheaper half of
// this fix and this gate is only the backstop.
//
// THE RULE, measured rather than proposed. Run tesseract in sparse mode over
// the image, then reject if any token containing four or more consecutive
// ASCII letters carries a confidence above 65, unless every such run in that
// token is one of this tenant's own brand words. worker/imageTextGate.test.mjs
// re-runs the real corpus, so the numbers here are a claim this repo can check
// rather than a note someone has to trust.
//
// THREE TRAPS, all already paid for, do not re-discover them.
//
//   1. DO NOT TEST TOKEN LENGTH ALONE. It is tempting to write "reject any
//      token of 4+ characters", and in awk `length()` counts BYTES: a pair of
//      em dash characters is six bytes and sails through a naive `>= 4` test.
//      That produced exactly two false positives in the 2026-08-26 GWF audit,
//      at confidence 69 and 74, on images with no text in them whatsoever
//      (arizona-monsoon-season-home-prep-checklist and
//      tolleson-reconstruction). Match ASCII letters explicitly. That is what
//      LETTER_RUN below is, and both of those images are in the test corpus.
//   2. VOLUME IS NOT THE SIGNAL, CONFIDENCE IS. A clean photograph's shape
//      noise really does produce OCR tokens. A word-count threshold therefore
//      fails in both directions. What separates rendered glyphs from noise is
//      how sure tesseract is, not how much it found.
//   3. THIS TENANT'S IMAGES CARRY A LEGIBLE WORDMARK. Four of the site's
//      hand-made images (all from the initial build, commit 12f0990) carry a
//      navy band reading "GOLD WATER FIRE", correctly spelled and fully
//      legible, and OCR reads it at confidence 95 and 96. JTHL needed no
//      equivalent because its watermark sits at 16% opacity and tesseract does
//      not see it at all. See BRAND_TOKENS for why this is an allowlist and
//      not a crop.
//
// THIS GATE DOES NOT FAIL SOFT, and that is deliberate and opposite to the two
// steps either side of it in image.mjs. optimizeForWeb() and embedSeoMetadata()
// both ship the image when their binary is missing, because a missing weight
// check costs page speed and a missing metadata pass costs some SEO. A missing
// TEXT check ships gibberish onto a live page. So: no tesseract on the host
// means the image does not ship, which under §8.5 means the page does not ship
// either. `tesseract-ocr` and `tesseract-ocr-eng` are both in nixpacks.toml for
// that reason, and run.mjs probes for both in its first log line, because a
// hard-failing gate on a host without tesseract publishes nothing, silently,
// and looks exactly like a quiet day.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// Above this, tesseract is reading glyphs somebody drew. Below it, it is
// pattern-matching noise. Measured on this tenant's own 111 live images: the
// worst clean one peaks at 58, and every real rendered glyph in the set (the
// garbled appliance label, and the brand band) lands at 95 or 96. 65 sits in
// the empty band between, with real headroom on both sides rather than being
// tuned to one sample.
export const TEXT_CONFIDENCE_THRESHOLD = 65;

// Four or more consecutive ASCII letters, unanchored, so "Mesa," and "(GOLD"
// count and a run of punctuation or a multi-byte dash never does. See trap 1.
const LETTER_RUN = /[A-Za-z]{4,}/;
const LETTER_RUNS_GLOBAL = /[A-Za-z]{4,}/g;

// Trap 3. Gold Water Fire's own wordmark, uppercased. A token is forgiven only
// when EVERY four-plus letter run inside it is one of these.
//
// WHY AN ALLOWLIST AND NOT A CROP. The obvious alternative is to cut the
// bottom strip off before OCR, since the band always sits bottom left. It is
// simpler and it is worse: it blinds the gate to precisely the region where a
// garbled version of the mark would appear, and a model that invents lettering
// in a photograph has no reason to avoid that strip. The allowlist keeps
// full-frame coverage. "GOLD" passes, "G0LD" and "GOLDD" and "WATFR" do not,
// because they are not in this set.
//
// WHAT THIS DELIBERATELY DOES NOT CATCH: an image whose invented text happens
// to consist only of the words GOLD, WATER and FIRE. That is the price of the
// allowlist and it is a narrow one. The alternative prices every branded image
// as a permanent false positive, which would mean the gate gets switched off.
//
// Note this gate NEVER adds a mark and never removes one. SOP §8.3 is explicit
// that a tenant's existing mark convention is not changed on a session's own
// initiative. This list only stops the gate from misreading branding as damage.
const BRAND_TOKENS = new Set(["GOLD", "WATER", "FIRE"]);

function isBrandToken(text) {
  const runs = String(text).toUpperCase().match(LETTER_RUNS_GLOBAL);
  if (!runs || runs.length === 0) return false;
  return runs.every((run) => BRAND_TOKENS.has(run));
}

// --psm 11 is "sparse text, no particular order", the right mode for finding
// scattered lettering in a photograph rather than reading a document. tsv
// output is what carries a per-word confidence at all; the plain text output
// does not, and confidence is the entire signal here.
const TESSERACT_ARGS = ["-", "--psm", "11", "tsv"];

// tsv columns, in order: level page_num block_num par_num line_num word_num
// left top width height conf text.
const CONF_COL = 10;
const TEXT_COL = 11;

function parseTsv(stdout) {
  const tokens = [];
  const lines = stdout.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length <= TEXT_COL) continue;
    const text = cols[TEXT_COL];
    if (!text) continue;
    const conf = Number.parseFloat(cols[CONF_COL]);
    if (!Number.isFinite(conf)) continue;
    tokens.push({ text, conf });
  }
  return tokens;
}

/**
 * Look for rendered text in an image buffer.
 *
 * Returns { ok, available, reason, hits, allowed, peakConf, tokenCount }.
 *
 * `ok: false` with `available: false` means the gate could not run. That is
 * still a rejection, on purpose. The caller must not treat "we could not
 * check" as "it is fine", which is precisely the mistake the fail-soft steps
 * around it are allowed to make and this one is not.
 *
 * `allowed` carries the brand-band tokens that were seen and forgiven, so a
 * run log shows the allowlist doing its job rather than hiding it.
 */
export async function scanForRenderedText(buffer, ext = "jpg", hint = "image") {
  const safeHint = String(hint).replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
  const tmpPath = join(tmpdir(), `gwf-ocr-${process.pid}-${safeHint}.${ext}`);
  try {
    await writeFile(tmpPath, buffer);
    let stdout;
    try {
      ({ stdout } = await execFileAsync("tesseract", [tmpPath, ...TESSERACT_ARGS]));
    } catch (err) {
      return {
        ok: false,
        available: false,
        reason: `text gate could not run (${err.message}). tesseract-ocr AND tesseract-ocr-eng must both be installed (nixpacks.toml aptPkgs). §8.3.2 does NOT fail soft: an unchecked image does not ship.`,
        hits: [],
        allowed: [],
        peakConf: 0,
        tokenCount: 0,
      };
    }

    const tokens = parseTsv(stdout);
    const words = tokens.filter((t) => LETTER_RUN.test(t.text));
    const overThreshold = words.filter((t) => t.conf > TEXT_CONFIDENCE_THRESHOLD);
    const allowed = overThreshold.filter((t) => isBrandToken(t.text));
    const hits = overThreshold.filter((t) => !isBrandToken(t.text));
    const peakConf = words.reduce((max, t) => (t.conf > max ? t.conf : max), 0);

    if (hits.length) {
      const sample = hits
        .slice()
        .sort((a, b) => b.conf - a.conf)
        .slice(0, 5)
        .map((t) => `"${t.text}" (${t.conf.toFixed(0)})`)
        .join(", ");
      return {
        ok: false,
        available: true,
        reason: `rendered text detected in image: ${hits.length} non-brand token(s) above confidence ${TEXT_CONFIDENCE_THRESHOLD}, peak ${peakConf.toFixed(0)}: ${sample}`,
        hits,
        allowed,
        peakConf,
        tokenCount: words.length,
      };
    }

    return {
      ok: true,
      available: true,
      reason: null,
      hits: [],
      allowed,
      peakConf,
      tokenCount: words.length,
    };
  } catch (err) {
    // A failure to even write the temp file is still a failure to check, so it
    // is still a rejection. Same reasoning as the missing-binary path.
    return {
      ok: false,
      available: false,
      reason: `text gate errored (${err.message}), image not shipped`,
      hits: [],
      allowed: [],
      peakConf: 0,
      tokenCount: 0,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
