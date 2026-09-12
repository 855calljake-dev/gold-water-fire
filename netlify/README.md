# netlify/ — the dispatch line's call record in GoHighLevel

`functions/retell-webhook.mjs` is the Retell post-call webhook for (480) 999-3339. On every
`call_analyzed` event it writes the call into the Gold Water Fire GHL sub-account: contact,
note, timeline Call with the recording attached, and an opportunity when the call shows intent.
Ruling: Jake, 2026-09-09, "Use GHL, not Airtable, for call handling and reporting."

`lib/ghl.mjs` is the tenant-agnostic GHL client ported from `jaketaylor-home-loans`
`netlify/lib/ghl.mts` (SOP-CROSS-TENANT-FIX-PROPAGATION). `lib/retell-call.mjs` holds the pure
logic and is what `npm run test:webhook` exercises.

## Env, set in Netlify → Site configuration → Environment variables

| Name | Value | Who sets it |
|---|---|---|
| `RETELL_API_KEY` | the Retell workspace API key (signs every webhook) | Jake |
| `GHL_PIT` | a Private Integration Token minted INSIDE the Gold Water Fire sub-account, scopes per `SOP-GHL-LOCATION-TOKENS.md` (contacts, opportunities, conversations/message, locations/customFields) | Jake |
| `GHL_LOCATION_ID` | `bvd3wX0RlnicNDrv6Jmt` | anyone |
| `GHL_PIPELINE_NAME` | optional, default `Marketing Pipeline` | anyone |
| `GHL_STAGE_DISPATCH` / `GHL_STAGE_NEW` | optional, default `Hot Lead` / `New Lead` | anyone |
| `GHL_CONVERSATION_PROVIDER_ID` | the Call-type Conversation Provider registered by the ByTomorrow marketplace app and installed on this sub-account. **Does not exist yet.** Without it GHL refuses a timeline Call (`400 CONVERSATIONS_MSG_PROVIDER_ID_REQUIRED`, reproduced 2026-09-12), so the contact gets no native Play button; the recording URL and transcript still land in the note and the custom fields | Jake, once the app exists |

Until `RETELL_API_KEY` is set the function answers 503 and Retell records a failed delivery;
until `GHL_PIT` is set it answers 200 with `ghl: "not_configured"` and logs the dropped call id.
Both are loud on purpose.

## How to know it works

Place one call to (480) 999-3339, hang up after the disclaimer, then open the GWF sub-account →
Contacts and find your number: a contact, a note starting `Inbound call call_…`, and a Call in
the timeline. Netlify → Functions → retell-webhook → Logs shows one line per call ending
`ghl=written`.
