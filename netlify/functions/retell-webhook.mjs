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
 *   (no DND is written at creation: Jake's ruling 2026-09-12, see writeCallToGhl)
 *   GHL_CONVERSATION_PROVIDER_ID  the Call provider registered by the ByTomorrow marketplace app,
 *                         once it exists; without it the timeline Call (and its Play button) is
 *                         skipped and logged on every call, never silently
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
  ensureCustomFields,
  ghlEnv,
  recordingStatus,
  resolveStage,
  upsertContact,
  upsertOpportunity,
} from '../lib/ghl.mjs'
import { CANONICAL_FIELDS, callStatus, customFieldValues, isLead, noteFor, shapeCall, stageFor, tagsFor, verifyRetellSignature } from '../lib/retell-call.mjs'

async function writeCallToGhl(c) {
  const env = ghlEnv()
  if (!env) {
    console.error(`retell-webhook: GHL_PIT/GHL_LOCATION_ID not set, call ${c.callId} NOT written to GHL`)
    return 'not_configured'
  }
  try {
    // Missing fields are created from the canonical definition, never invented
    // (Jake, 2026-09-12). A failure here must not drop the call: log and go on.
    try { await ensureCustomFields(env, CANONICAL_FIELDS) } catch (err) {
      console.error(`retell-webhook: ensureCustomFields failed for ${c.callId} (continuing) -`, err)
    }
    const { fields, missing } = await buildCustomFields(env, customFieldValues(c))
    if (missing.length) {
      console.error(`retell-webhook: GHL custom fields not provisioned in this location, values dropped: ${missing.join(', ')}`)
    }

    const [firstName, ...rest] = (c.fullName ?? '').split(' ').filter(Boolean)
    const { contactId } = await upsertContact(env, {
      ...(firstName ? { firstName } : {}),
      ...(rest.length ? { lastName: rest.join(' ') } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.propertyAddress ? { address1: c.propertyAddress } : {}),
      source: `phone ${c.line}`,
      tags: tagsFor(c),
      customFields: fields,
      // Jake's ruling 2026-09-12 ("keep DND off for new calls coming in"):
      // contacts the phone agent creates carry NO DND block, so the caller CC
      // that Hard Rule 11 permits can be delivered by text and email. This is
      // not marketing consent: a phone call is verbal contact, never express
      // written SMS consent, and that fact travels as the tag and the note
      // line below rather than as a DND flag. Existing contacts are never
      // touched either way. HANDOFF-GWF-GHL-CALL-RECORD.md, bytomorrow-bos 6bc1914.
    })

    await createNote(env, contactId, noteFor(c))

    // The timeline Call is the per-call record Jake asked for in Conversations:
    // summary as the body, recording as the attachment (the player), the
    // caller's real number in call.from, the ladder outcome in call.status.
    // Gated on GHL_CONVERSATION_PROVIDER_ID (see ghl.mjs).
    let timeline = 'skipped'
    try {
      const { messageId, skipped } = await addCallMessage(env, {
        contactId,
        direction: c.direction,
        to: c.direction === 'inbound' ? c.agentNumber : c.callerId,
        from: c.direction === 'inbound' ? c.callerId : c.agentNumber,
        date: c.startedAt,
        status: callStatus(c),
        message: c.summary,
        recordingUrl: c.recordingUrl,
      })
      if (skipped) {
        console.error(`retell-webhook: timeline Call SKIPPED for ${c.callId}: GHL_CONVERSATION_PROVIDER_ID not set. Note and custom fields still written.`)
      } else if (messageId) {
        timeline = `written:${messageId}`
        if (c.recordingUrl) {
          // Belt and braces: the inline attachments array plus the explicit PUT,
          // then read the recording back so the player is verified, not assumed.
          try { await attachRecording(env, messageId, c.recordingUrl) } catch (err) {
            console.error(`retell-webhook: attachRecording failed for ${c.callId} (inline attachment may still render) -`, err)
          }
          const status = await recordingStatus(env, messageId)
          timeline += status === 200 ? ':recording-ok' : `:recording-${status}`
          if (status !== 200) console.error(`retell-webhook: recording read-back for ${c.callId} returned ${status}; no player on the Call yet`)
        }
      }
    } catch (err) {
      // The note and the Call Recording URL field already carry the recording,
      // so a timeline failure costs the player, not the data. Reported.
      timeline = 'failed'
      console.error(`retell-webhook: GHL timeline Call FAILED for ${c.callId} (note and fields written) -`, err)
    }
    console.log(`retell-webhook: ${c.callId} timeline=${timeline} status=${callStatus(c)} rung=${c.transferRung ?? '-'}`)

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
