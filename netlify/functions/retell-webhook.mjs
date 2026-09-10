/**
 * Retell post-call webhook for the Gold Water Fire dispatch line, (480) 999-3339.
 *
 * Jake's ruling 2026-09-09: "Use GHL, not Airtable, for call handling and
 * reporting. Build the GHL webhook." On `call_analyzed` every call becomes, in
 * the GWF sub-account: a contact (created or updated), a note with the summary
 * and recording link, a Call entry on the contact's timeline with the recording
 * attached, and, when the call shows intent, an opportunity in the pipeline.
 *
 * This runs on EVERY call because Retell fires it deterministically. The
 * agent's own create_lead_record tool depends on the model deciding to call
 * it, which is how 15 attempts became 4 Airtable rows in the 30 days to
 * 2026-09-09. When this is proven on live calls the Airtable tool comes out.
 *
 * Point the Retell agent's webhook_url at /.netlify/functions/retell-webhook.
 *
 * Env (Netlify site settings, never in the repo):
 *   RETELL_API_KEY        verifies x-retell-signature; also the key Retell uses to sign
 *   GHL_PIT               location Private Integration Token for the GWF sub-account
 *   GHL_LOCATION_ID       bvd3wX0RlnicNDrv6Jmt
 *   GHL_PIPELINE_NAME     default "Marketing Pipeline" (the stock pipeline in the sub-account)
 *   GHL_STAGE_DISPATCH    default "Hot Lead"
 *   GHL_STAGE_NEW         default "New Lead"
 *   GHL_OPPORTUNITY_VALUE default 0 (no standing per-job figure is ruled for GWF)
 *
 * Responses: 401 bad signature, 400 bad payload, 503 not configured. A GHL
 * failure after a valid payload returns 200 with `ghl: "failed"` and logs the
 * reason: Retell retries non-2xx, and a retry would duplicate the note and the
 * timeline call. Failures are recorded, never swallowed: the log line names
 * the call id and the GHL error, and the daily worker health check reads
 * Netlify function logs.
 */

import {
  addCallMessage,
  attachRecording,
  buildCustomFields,
  createNote,
  findContactId,
  ghlEnv,
  resolveStage,
  upsertContact,
  upsertOpportunity,
} from '../lib/ghl.mjs'
import { isLead, noteFor, shapeCall, stageFor, verifyRetellSignature } from '../lib/retell-call.mjs'

async function writeCallToGhl(c) {
  const env = ghlEnv()
  if (!env) {
    console.error(`retell-webhook: GHL_PIT/GHL_LOCATION_ID not set, call ${c.callId} NOT written to GHL`)
    return 'not_configured'
  }
  try {
    const yesNo = (v) => (v ? 'Yes' : 'No')
    const { fields, missing } = await buildCustomFields(env, {
      'Call Type': c.callType,
      'Damage Type': c.damageType,
      'Property Address': c.propertyAddress,
      'Wants Human': yesNo(c.wantsHuman),
      'Transfer Attempted': yesNo(c.transferAttempted),
      'Transfer Connected': yesNo(c.transferConnected),
      'Follow Up Needed': yesNo(c.followUpNeeded),
      'Last Call ID': c.callId,
      'Last Call Line': c.line,
      'Last Call Summary': c.summary,
      'Last Call Recording': c.recordingUrl,
      'Last Call Duration Sec': c.durationSec,
      'Last Call Disconnect Reason': c.disconnectReason,
      'Last Call Sentiment': c.sentiment,
      'Consent Basis': 'Inbound call',
      'Consent Captured Date': new Date().toISOString().slice(0, 10),
    })
    if (missing.length) {
      console.error(`retell-webhook: GHL custom fields not provisioned in this location, values dropped: ${missing.join(', ')}`)
    }

    const [firstName, ...rest] = (c.fullName ?? '').split(' ').filter(Boolean)
    const already = await findContactId(env, {
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
    })

    const { contactId } = await upsertContact(env, {
      ...(firstName ? { firstName } : {}),
      ...(rest.length ? { lastName: rest.join(' ') } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.propertyAddress ? { address1: c.propertyAddress } : {}),
      source: `phone ${c.line}`,
      tags: [
        'phone-lead',
        `line:${c.line}`,
        ...(c.callType ? [`call:${c.callType}`] : []),
        ...(c.wantsHuman ? ['wants-human'] : []),
      ],
      customFields: fields,
      // A phone call is verbal contact, never express written SMS consent.
      ...(already ? {} : { consent: { sms: false, email: false } }),
    })

    await createNote(env, contactId, noteFor(c))

    try {
      const { messageId } = await addCallMessage(env, {
        contactId,
        direction: c.direction,
        ...(c.durationSec ? { durationSec: c.durationSec } : {}),
      })
      if (messageId && c.recordingUrl) await attachRecording(env, messageId, c.recordingUrl)
    } catch (err) {
      // The note already carries the recording link; a timeline failure costs
      // presentation, not data. Reported, not fatal.
      console.error(`retell-webhook: GHL call-message/attachment failed for ${c.callId} (note written) -`, err)
    }

    if (!isLead(c)) {
      console.log(`retell-webhook: contact written, no opportunity (no intent) for ${c.callId}`)
      return 'written'
    }
    const pipelineName = process.env.GHL_PIPELINE_NAME || 'Marketing Pipeline'
    const stageName = stageFor(c)
    const stage = await resolveStage(env, pipelineName, stageName)
    if (!stage) {
      console.error(`retell-webhook: stage "${stageName}" not found in pipeline "${pipelineName}", opportunity SKIPPED for ${c.callId}. Create the stage in GHL; this resolves by name, no redeploy.`)
      return 'written_no_opportunity'
    }
    await upsertOpportunity(env, {
      contactId,
      pipelineId: stage.pipelineId,
      stageId: stage.stageId,
      name: `${c.fullName ?? c.phone ?? 'Inbound caller'} (${c.callType ?? 'call'}, ${c.line})`,
      monetaryValue: Number(process.env.GHL_OPPORTUNITY_VALUE || 0),
      source: `phone ${c.line}`,
    })
    return 'written'
  } catch (err) {
    console.error(`retell-webhook: GHL write FAILED for ${c.callId} -`, err)
    return 'failed'
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const retellKey = process.env.RETELL_API_KEY
  if (!retellKey) {
    console.error('retell-webhook: RETELL_API_KEY not set, call NOT captured')
    return Response.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  const raw = await req.text()
  if (!verifyRetellSignature(raw, retellKey, req.headers.get('x-retell-signature'))) {
    return Response.json({ ok: false, error: 'bad_signature' }, { status: 401 })
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return Response.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  // call_started / call_ended get a 200; only the analyzed call is data.
  if (payload.event !== 'call_analyzed' || !payload.call) return Response.json({ ok: true })
  if (!payload.call.call_id) return Response.json({ ok: false, error: 'no_call_id' }, { status: 400 })

  const call = shapeCall(payload.call)
  const ghl = await writeCallToGhl(call)
  console.log(`retell-webhook: ${call.callId} line=${call.line} type=${call.callType ?? '-'} lead=${isLead(call)} ghl=${ghl}`)
  return Response.json({ ok: true, callId: call.callId, ghl })
}
