// The ONLY facts the drafting model may state as true. Kept separate from
// prose so it's obvious what's confirmed vs what the model might invent.
// Source of truth: CLAIMS-TO-VERIFY.md. Update both together.

export const CONFIRMED_FACTS = `
- Company name: Gold Water Fire (three separate words, never run together)
- Phone: (480) 999-3339
- Email: Help@goldwaterfire.com
- Address: 221 E Willis Rd Ste 8, Chandler, AZ 85286
- AZ ROC license: #264344 · KB-2
- Co-founders: Jim Bennett and Jake Taylor
- Brandon Gurr: Construction Manager, leads reconstruction/rebuild work (formerly Gurr Brothers Construction, which is HIS résumé, never state it as Gold Water Fire's own job count or years in business)
- Team: Kristine (Office Admin), Brooke (Water and Mitigation Scheduling Assistant), Johnny (Reconstruction Team Lead)
- Three services: Water Damage Restoration, Fire Damage Restoration, Reconstruction & Rebuild
- Service area: the full Phoenix, Arizona metro area, with this named boundary description from the owner: "NW Peoria, SE Avondale, SW San Tan Valley, NW Apache Junction, and outlying areas further than that." Safe to name specific cities within that area (Phoenix, Mesa, Chandler, Scottsdale, Glendale, Gilbert, Tempe, Peoria, Surprise, Avondale, Goodyear, Buckeye, Apache Junction, Queen Creek, San Tan Valley, Fountain Hills, Paradise Valley, Cave Creek, El Mirage, Tolleson, Litchfield Park).
`.trim();

// Structural evidence gate — SOP-AGENTIC-SEO-WEBSITES.md §2. Checked in code
// after generation, not left to prompt compliance alone. Case-insensitive
// substring/regex match against the full rendered text of a draft.
export const FORBIDDEN_PATTERNS = [
  { label: "IICRC certification claim", re: /IICRC/i },
  { label: "bonded/insured claim", re: /\bbonded\b|\binsured\b/i },
  { label: "specific years-in-business or founding-year claim", re: /\b(19|20)\d{2}\b.{0,20}\b(founded|since|established)\b|\bfounded in\b|\bsince \d{4}\b/i },
  { label: "job/project count claim", re: /\b\d[\d,]*\+?\s*(jobs|projects|homes|properties|customers)\b/i },
  { label: "specific response-time number", re: /\b(one|two|three|1|2|3)[\s-]?(hour|hr)\b.{0,20}\bresponse\b/i },
  { label: "hard 24/7 availability claim", re: /24\/7|24-hour|around the clock/i },
  { label: "testimonial/review language", re: /\b(said|told us|reviewed by|stars?)\b.{0,30}\b(customer|client)\b|"[^"]{15,}"\s*[-–—]\s*[A-Z][a-z]+/ },
  { label: "competitor mention", re: /\b(Preferred Choice|ServPro|ServiceMaster|Restoration 1|Paul Davis|BELFOR)\b/i },
  // draft.mjs's hard rule 6 says the emotional register is direction for HOW
  // the model writes and never content to echo back. That was prompt-only,
  // and this file exists precisely because prompt compliance is not
  // verification -- the same reasoning as every rule above it. A leaked
  // "Faith Loop" on a live restoration page would read as nonsense to a
  // homeowner and expose the internal system to a competitor reading the
  // site.
  //
  // Matches the SYSTEM terms only, not the bare phase words. "Reflection"
  // and "invitation" have ordinary English uses that could legitimately
  // appear in restoration copy, and a gate that rejects real drafts for
  // using a common word would get switched off. These compounds have no
  // innocent reading on a page about water damage.
  { label: "internal Faith Loop / Pride Cycle label leaked into copy", re: /\bfaith[\s-]?loop\b|\bpride[\s-]?cycle\b|\bsacrifice[\s-]faith\b|\bemotional register\b|\bscrollkeeper\b/i },
];

export function findForbiddenClaims(text) {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}
