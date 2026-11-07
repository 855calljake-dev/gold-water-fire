import { shell } from "./shell.mjs";
import { BRAND, esc } from "./lib.mjs";

// Privacy Policy and Terms of Service. Two readers: a homeowner deciding whether
// to give a phone number, and the carrier reviewer who checks a texting
// registration (A2P 10DLC) for a privacy page, consent language, the no-sharing
// clause, and STOP and HELP handling. Every sentence states what this site and
// the office actually do. The pattern is goldwaterroof.com, same legal company,
// but nothing is copied from it unless it is also true here.
//
// Where the facts come from, so the next edit can check them:
//   Forms: the four form templates (home, contact, roof, service).
//   Third parties: scripts/consent.test.mjs fails if a page loads a host this
//     policy does not name, or an analytics or advertising tag. A new tracker
//     means changing this page first.
//   Calls: the live phone agent's own disclosure, GWF Dispatch v32, read
//     2026-11-07: it opens with "This call is recorded", and "If asked whether
//     you're a real person, say plainly that you're an AI assistant". Its
//     send_sms tool is pinned to staff numbers, so it never texts a caller. If
//     the agent changes, the Calls section changes with it.
//   Texting: the filed campaign says customers who do not tick the box are not
//     texted. Nothing here may offer another way in, such as texting first or
//     agreeing on a call, unless the filing changes too.
//
// BRAND carries the phone, email, address and license. The worker's facts.mjs
// is the source of truth, but worker/ is not a build input (see
// scripts/netlify-ignore.sh), so the test proves the two match instead.

// The legal entity: Jake's rulings of 2026-09-29 ("ADL Solutions registers GWF")
// and 2026-10-16 ("Yes it's ADL Solutions Inc"), the name on the EIN letter.
const LEGAL_NAME = "ADL Solutions Inc";
const LEGAL_LINE = `${LEGAL_NAME}, doing business as ${BRAND.name}`;

// If the merge lands after this date, change it to the merge date.
const EFFECTIVE = "November 7, 2026";
const EFFECTIVE_ISO = "2026-11-07T00:00:00-07:00";

const ADDRESS = `${BRAND.addressLine1}, ${BRAND.addressLine2}`;
const phoneLink = `<a href="${BRAND.phoneHref}">${esc(BRAND.phone)}</a>`;
const emailLink = `<a href="mailto:${BRAND.email}">${esc(BRAND.email)}</a>`;

function hero(heading, label, intro) {
  return `
    <section class="page-hero">
      <div class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / ${esc(label)}</div>
        <h1>${esc(heading)}</h1>
        <p>${intro}</p>
      </div>
    </section>`;
}

const CONTACT_BLOCK = `
          <h2>Contact</h2>
          <p>${esc(LEGAL_LINE)}<br>
          ${esc(BRAND.addressLine1)}<br>
          ${esc(BRAND.addressLine2)}<br>
          ${phoneLink}<br>
          ${emailLink}</p>`;

export function renderPrivacy() {
  const bodyHtml = `${hero(
    "Privacy Policy",
    "Privacy Policy",
    `Effective ${EFFECTIVE}. This policy covers goldwaterfire.com, calls to ${esc(BRAND.phone)} and text messages from ${esc(BRAND.name)}.`,
  )}

    <section>
      <div class="wrap">
        <div class="legal-copy">
          <h2>Who we are</h2>
          <p>${esc(BRAND.name)} is a trade name of ${esc(LEGAL_NAME)}. In this policy, "we" means ${esc(LEGAL_LINE)}, ${esc(ADDRESS)}, phone ${phoneLink}, ${emailLink}.</p>

          <h2>What we collect</h2>
          <h3>When you send a form</h3>
          <p>We receive what you type: your name, your phone number, your email address if the form asks for it, the property address or city, what happened, and any details you add. We also receive whether you ticked the text-message box. Netlify, which hosts this site, stores each submission along with your IP address, your browser type and the page you sent it from.</p>

          <h3>When you visit this site</h3>
          <p>This site does not run analytics or advertising trackers such as Google Analytics or a Meta pixel, and it sets no cookies of its own. Netlify records standard technical details of each visit, such as your IP address and the page you asked for.</p>
          <p>Every page loads a small Google script for the "preferred source" button in the footer, and some pages load their fonts from Google. Your browser fetches those files from Google, so Google receives your IP address and browser details. <a href="https://policies.google.com/privacy" rel="nofollow noopener">Google's privacy policy</a> covers what it does with them.</p>

          <h3>When you call ${esc(BRAND.phone)}</h3>
          <p>Calls are recorded, and the call says so as soon as it is answered. A call may be answered by an AI assistant for ${esc(BRAND.name)}, which takes your details and tries to connect you with a person on our team. If you ask whether you are talking to a real person, it tells you it is an AI assistant.</p>
          <p>We keep the recording, a transcript and a summary of the call, the number you called from, and the details you give, such as your name, callback number, email address, property address, the reason for your call, and any insurance carrier or claim number you mention. The assistant also sends your contact details, property address and the reason for your call to our on-call staff by text and email so someone can respond. If you would rather not be recorded, send a form instead.</p>

          <h2>How we use it</h2>
          <p>We use this information to respond to your request, schedule and carry out an inspection, prepare an estimate, do the work you hire us for, and keep a record of the job and the call.</p>

          <h2>Text messages</h2>
          <p>We text customers only when they agree to it by ticking the text-message box on a form on this site. Customers who do not tick the box are not texted. Calling us does not sign you up for texts.</p>
          <p>The box starts unticked and is separate from sending the form. You can send the form without ticking it, and agreeing is not a condition of purchase.</p>
          <p>If you tick it, we may text you about that request: appointment confirmations, reminders and estimate updates. We do not send marketing texts. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Twilio, which carries the messages, keeps a record of them and of your replies.</p>
          <p>We also text our own staff about new service calls. The full text-message terms are in our <a href="/terms/">Terms</a>.</p>

          <h2>Sharing and selling</h2>
          <p>We do not sell your personal information. Mobile phone numbers and text-message consent are never shared with or sold to third parties or affiliates for marketing or promotional purposes.</p>
          <p>Apart from the companies listed below, we share your information only when you ask us to, when doing the work you hired us for requires it, or when the law requires it.</p>

          <h2>Who handles your information</h2>
          <p>These companies handle it so that we can run the site, the phone line and our records:</p>
          <ul>
            <li>Netlify hosts this site and stores form submissions.</li>
            <li>Google supplies the fonts and the button described above, and provides our email.</li>
            <li>Twilio carries our phone calls and text messages.</li>
            <li>Retell AI runs the AI assistant on our phone line and records and transcribes calls, using speech and language model providers to do so.</li>
            <li>HighLevel (GoHighLevel) holds our customer records, including call summaries, transcripts and links to recordings.</li>
            <li>Resend delivers the email alerts the assistant sends to our staff.</li>
            <li>ByTomorrow.ai built this site and helps us run it, the phone line and our customer records.</li>
          </ul>

          <h2>Your choices</h2>
          <p>To ask what we hold about you, or to ask us to correct or delete it, call ${phoneLink} or email ${emailLink}. Some records may have to stay, such as job records we are required to keep. To stop texts, reply STOP to any text from us.</p>

          <h2>Changes</h2>
          <p>We post any change to this policy on this page with a new effective date.</p>
${CONTACT_BLOCK}
        </div>
      </div>
    </section>`;

  return shell({
    path: "/privacy/",
    title: `Privacy Policy | ${BRAND.name}`,
    description: `How ${BRAND.name} handles what you send through this site or tell us on a call, who processes it, and how text messages work.`,
    h1AsTitle: `Privacy Policy | ${BRAND.name}`,
    breadcrumbLabel: "Privacy Policy",
    datePublished: EFFECTIVE_ISO,
    bodyHtml,
  });
}

export function renderTerms() {
  const bodyHtml = `${hero(
    "Terms of Service",
    "Terms",
    `Effective ${EFFECTIVE}. These terms cover goldwaterfire.com and text messages from ${esc(BRAND.name)}.`,
  )}

    <section>
      <div class="wrap">
        <div class="legal-copy">
          <h2>Who we are</h2>
          <p>${esc(BRAND.name)} is a trade name of ${esc(LEGAL_NAME)}. In these terms, "we" means ${esc(LEGAL_LINE)}, a fire and water damage restoration and reconstruction contractor in the Phoenix, Arizona metro area, ${esc(BRAND.license)}, at ${esc(ADDRESS)}. Using this site or sending us a request means you accept these terms.</p>

          <h2>Requests and inspections</h2>
          <p>A form or a call is a request for us to contact you. It is not a contract for work. Any work we do for you is covered by its own written agreement. For active flooding or fire, call ${phoneLink} instead of sending a form.</p>

          <h2>SMS terms: text messages from ${esc(BRAND.name)}</h2>
          <p>${esc(LEGAL_LINE)}, sends these text messages.</p>
          <p>Customers: if you tick the text-message box on a form on this site, we may text you about that request: appointment confirmations, reminders and estimate updates. Customers who do not tick the box are not texted. The box is optional, you can send the form without ticking it, and agreeing is not a condition of purchase. Calling us does not sign you up for texts.</p>
          <p>Staff: we also text our own employees and on-call staff about new service calls.</p>
          <p>We do not send marketing texts.</p>
          <ul>
            <li>Message frequency varies with your request.</li>
            <li>Msg &amp; data rates may apply.</li>
            <li>Reply STOP at any time to opt out. You will get one message confirming it, and no more texts after that.</li>
            <li>Reply HELP for help, or call ${phoneLink} or email ${emailLink}.</li>
            <li>Carriers are not liable for delayed or undelivered messages.</li>
            <li>How we handle your number and your consent is in our <a href="/privacy/">Privacy Policy</a>.</li>
          </ul>

          <h2>This site</h2>
          <p>The content on this site is general information about fire and water damage and about ${esc(BRAND.name)}. It is not advice about your specific property, which needs an inspection. We may change the site and these terms at any time. Changes to these terms are posted on this page with a new effective date.</p>
${CONTACT_BLOCK}
        </div>
      </div>
    </section>`;

  return shell({
    path: "/terms/",
    title: `Terms of Service | ${BRAND.name}`,
    description: `The terms for using goldwaterfire.com and for text messages from ${BRAND.name}, including who texts, what about, and how to opt out.`,
    h1AsTitle: `Terms of Service | ${BRAND.name}`,
    breadcrumbLabel: "Terms",
    datePublished: EFFECTIVE_ISO,
    bodyHtml,
  });
}
