/**
 * Pure helpers for the Retell post-call webhook: signature check, payload
 * shaping, and the two decisions (is this a lead, which stage) kept out of the
 * handler so they can be tested without a network.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const FIVE_MINUTES = 5 * 60 * 1000

/**
 * Retell signs `body + timestamp` with HMAC-SHA256 keyed by the API key and
 * sends `x-retell-signature: v=<ms>,d=<hex>`. Same algorithm as retell-sdk's
 * Retell.verify (lib/webhook_auth.js), inlined so this repo stays dependency
 * free. A stale timestamp (>5 min) fails, which is what stops a replay.
 */
export function verifyRetellSignature(rawBody, apiKey, signature, now = Date.now()) {
  const match = /^v=(\d+),d=([0-9a-f]{64})$/i.exec(signature ?? '')
  if (!match) return false
  const stamp = Number(match[1])
  if (!Number.isSafeInteger(stamp) || Math.abs(now - stamp) > FIVE_MINUTES) return false
  const expected = createHmac('sha256', apiKey).update(rawBody + stamp).digest()
  const given = Buffer.from(match[2], 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const text = (v, max = 10000) => {
  if (v == null) return undefined
  const s = (Array.isArray(v) ? v.join('\n') : String(v)).trim().slice(0, max)
  return s || undefined
}

export const truthy = (v) => v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === 1

export function toE164(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return d ? `+${d}` : undefined
}

export function lineFor(number) {
  const d = String(number ?? '').replace(/\D/g, '')
  if (d.endsWith('4809993339')) return '480-999-3339'
  return d ? d.slice(-10) : 'unknown'
}

const CALL_TYPES = new Set(['dispatch', 'general_inquiry', 'wrong_number', 'spam', 'vendor', 'other'])

/**
 * Where the caller's details come from, in order:
 *   1. the agent's own create_lead_record tool call, when it fired (the
 *      arguments are exactly what the caller confirmed on the call);
 *   2. Retell's post-call extraction (custom_analysis_data), which runs on
 *      every call whether or not the tool fired;
 *   3. caller ID for the phone, so a contact is always reachable.
 * Tool arguments win over extraction because they were read back to the caller.
 */
export function shapeCall(call) {
  const analysis = call.call_analysis ?? {}
  const extracted = analysis.custom_analysis_data ?? {}
  const tool = leadToolArgs(call)

  const direction = call.direction === 'outbound' ? 'outbound' : 'inbound'
  const callerId = direction === 'inbound' ? call.from_number : call.to_number
  const agentNumber = direction === 'inbound' ? call.to_number : call.from_number

  const fullName = text(tool.caller_name ?? extracted.caller_name, 120)
  const phone = toE164(text(tool.phone_number ?? extracted.callback_phone, 40)) ?? undefined
  const email = text(tool.email ?? extracted.email, 120)?.toLowerCase()
  const propertyAddress = text(tool.property_address ?? extracted.property_address, 200)
  const rawType = text(tool.call_type ?? extracted.call_type, 40)?.toLowerCase().replace(/\s+/g, '_')
  const callType = rawType && CALL_TYPES.has(rawType) ? rawType : undefined
  const reason = text(tool.reason_notes ?? extracted.reason, 600)

  const transfer = transferOutcome(call)
  const transferAttempted = transfer.attempted || truthy(extracted.transfer_attempted)

  return {
    callId: call.call_id,
    direction,
    line: lineFor(agentNumber),
    callerId,
    agentNumber,
    startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : undefined,
    fullName,
    phone: phone ?? callerId,
    phoneCaptured: Boolean(phone),
    email,
    propertyAddress,
    callType,
    reason,
    damageType: text(extracted.damage_type, 60),
    wantsHuman: truthy(extracted.wants_human),
    transferAttempted,
    transferConnected: transfer.connected || truthy(extracted.transfer_connected),
    transferRung: transfer.rung,
    followUpNeeded: truthy(extracted.follow_up_needed),
    summary: text(analysis.call_summary, 4000),
    sentiment: text(analysis.user_sentiment, 40),
    inVoicemail: Boolean(analysis.in_voicemail),
    disconnectReason: text(call.disconnection_reason, 80),
    durationSec: call.duration_ms ? Math.round(call.duration_ms / 1000) : undefined,
    recordingUrl: text(call.recording_url, 500),
    transcript: text(call.transcript, 20000),
    insuranceCarrier: text(extracted.insurance_carrier, 80),
    claimNumber: text(extracted.claim_number, 60),
  }
}

/**
 * Values for the custom fields the GWF sub-account ALREADY has (created
 * 2026-08-27 in its "Phone Agent" folder, read back 2026-09-10). Picklist
 * fields get exactly their option strings, including the em dashes in
 * Transfer Status, which are stored values, not prose (Hard Rule 7). Anything
 * the picklists cannot express goes to the note and to tags instead.
 */
export function customFieldValues(c) {
  const callType = c.callType === 'dispatch' ? 'Dispatch'
    : c.callType === 'general_inquiry' ? 'General Inquiry' : undefined
  const damage = c.damageType
    ? c.damageType.charAt(0).toUpperCase() + c.damageType.slice(1).toLowerCase() : undefined
  const damageType = ['Water', 'Fire', 'Smoke', 'Mold', 'Storm', 'Sewage', 'Other'].includes(damage) ? damage : undefined
  const transferStatus = c.transferConnected ? 'Transferred \u2014 Connected'
    : c.transferAttempted ? 'Transferred \u2014 No Answer' : 'N/A'
  // Called In From: the number that actually rang, from Retell's from_number.
  // The contact's phone is what the caller SAID; this is what the carrier saw.
  // Never spoken, texted or emailed back (Hard Rule 11).
  return {
    'Call Type': callType,
    'Damage Type': damageType,
    'Property Address (Loss Location)': c.propertyAddress,
    'Transfer Status': transferStatus,
    'Reason / Notes': c.reason,
    'Call Recording URL': c.recordingUrl,
    'Call Transcript': c.transcript,
    'Insurance Carrier': c.insuranceCarrier,
    'Claim Number': c.claimNumber,
    'Called In From': c.callerId,
  }
}

export function tagsFor(c) {
  return [
    'phone-lead',
    `line:${c.line}`,
    ...(c.callType ? [`call:${c.callType}`] : []),
    ...(c.wantsHuman ? ['wants-human'] : []),
    ...(c.followUpNeeded ? ['follow-up-needed'] : []),
    // Verbal contact on a recorded line; not express written SMS consent.
    'consent:verbal-call',
  ]
}

export function toolInvocations(call) {
  const turns = call.transcript_with_tool_calls ?? []
  return turns
    .filter((t) => t?.role === 'tool_call_invocation' && t.name)
    .map((t) => ({ name: t.name, id: t.tool_call_id, args: parseArgs(t.arguments) }))
}

/** Pair each tool_call_result with its invocation by tool_call_id. */
export function toolResults(call) {
  const turns = call.transcript_with_tool_calls ?? []
  const byId = new Map(toolInvocations(call).map((t) => [t.id, t.name]))
  return turns
    .filter((t) => t?.role === 'tool_call_result')
    .map((t) => ({ name: byId.get(t.tool_call_id) ?? t.name, content: String(t.content ?? '') }))
}

/**
 * The transfer ladder outcome, derived from the call record with no new agent
 * tool (HANDOFF-GWF-GHL-CALL-RECORD.md, "The ladder outcome goes here too").
 * Connected when the main call ended in call_transfer or any transfer_to_*
 * tool reported success; the rung is the tool that succeeded.
 */
export function transferOutcome(call) {
  const attempts = toolInvocations(call).filter((t) => t.name?.startsWith('transfer_to'))
  const results = toolResults(call).filter((r) => r.name?.startsWith('transfer_to'))
  const ok = results.find((r) => /transferred successfully|transfer_bridged|success/i.test(r.content))
  const connected = call.disconnection_reason === 'call_transfer' || Boolean(ok)
  return {
    attempted: attempts.length > 0,
    connected,
    rung: ok?.name ?? (connected ? attempts[attempts.length - 1]?.name : undefined),
  }
}

/** GHL call.status enum from Retell's disconnection reason and the ladder outcome. */
export function callStatus(c) {
  const r = c.disconnectReason ?? ''
  if (c.transferConnected) return 'completed'
  if (c.transferAttempted) return 'no-answer'
  if (r === 'voicemail_reached') return 'voicemail'
  if (r === 'dial_busy') return 'busy'
  if (r === 'dial_no_answer' || r === 'registered_call_timeout') return 'no-answer'
  if (r === 'no_valid_payment' || r === 'dial_failed' || r.startsWith('error')) return 'failed'
  return 'completed'
}

function leadToolArgs(call) {
  const hits = toolInvocations(call).filter((t) => t.name === 'create_lead_record')
  return hits.length ? hits[hits.length - 1].args : {}
}

function parseArgs(a) {
  if (!a) return {}
  if (typeof a === 'object') return a
  try { return JSON.parse(a) } catch { return {} }
}

/**
 * OPPORTUNITY GATE. Not every call is a lead. A hangup, a wrong number, a
 * vendor or a silent dialer must not land in the pipeline; that is how a board
 * becomes noise nobody trusts. Caller ID alone is not intent, because it is
 * always there. The contact and the call are still written for every call.
 */
export function isLead(c) {
  if (c.callType === 'spam' || c.callType === 'wrong_number' || c.callType === 'vendor') return false
  if (c.callType === 'dispatch' || c.callType === 'general_inquiry') return true
  return Boolean(c.fullName || c.phoneCaptured || c.email || c.wantsHuman || c.followUpNeeded || c.transferAttempted)
}

/** Dispatch is urgent and goes to the hot stage; everything else is a new lead. */
export function stageFor(c, env = process.env) {
  if (c.callType === 'dispatch' || c.transferAttempted) return env.GHL_STAGE_DISPATCH || 'Hot Lead'
  return env.GHL_STAGE_NEW || 'New Lead'
}

export function noteFor(c) {
  return [
    `Inbound call ${c.callId} on ${c.line}${c.durationSec ? ` (${c.durationSec}s)` : ''}`,
    c.callType ? `Type: ${c.callType}` : '',
    c.damageType ? `Damage: ${c.damageType}` : '',
    c.reason ? `Reason: ${c.reason}` : '',
    c.summary ? `Summary: ${c.summary}` : '',
    c.propertyAddress ? `Property: ${c.propertyAddress}` : '',
    `Asked for a person: ${c.wantsHuman ? 'yes' : 'no'}. Transfer attempted: ${c.transferAttempted ? 'yes' : 'no'}. Connected: ${c.transferConnected ? 'yes' : 'no'}${c.transferRung ? ` via ${c.transferRung}` : ''}.`,
    c.followUpNeeded ? 'FOLLOW-UP NEEDED' : '',
    c.disconnectReason ? `Ended: ${c.disconnectReason}` : '',
    'Consent: verbal, on a recorded call. Not express written SMS consent. DND left off per Jake 2026-09-12 so the caller can receive their own call details.',
    c.recordingUrl ? `Recording: ${c.recordingUrl}` : '',
    c.transcript ? `\nTranscript:\n${c.transcript}` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Canonical definitions of the contact custom fields this webhook writes, for
 * runtime creation under Jake's 2026-09-12 ruling (bytomorrow-bos 242919d).
 * Names match the live GWF sub-account exactly; GHL derives fieldKey from the
 * name, so an improvised name would split a field in two.
 */
export const CANONICAL_FIELDS = [
  { name: 'Call Type', dataType: 'SINGLE_OPTIONS', placeholder: 'Which path the phone agent took', options: ['Dispatch', 'General Inquiry'] },
  { name: 'Damage Type', dataType: 'SINGLE_OPTIONS', placeholder: 'The loss category driving the job', options: ['Water', 'Fire', 'Smoke', 'Mold', 'Storm', 'Sewage', 'Other'] },
  { name: 'Property Address (Loss Location)', dataType: 'TEXT', placeholder: 'Where the damage is. Often not the caller\'s billing address.' },
  { name: 'Transfer Status', dataType: 'SINGLE_OPTIONS', placeholder: 'Only meaningful on the Dispatch path', options: ['Transferred \u2014 Connected', 'Transferred \u2014 No Answer', 'N/A'] },
  { name: 'Reason / Notes', dataType: 'LARGE_TEXT', placeholder: 'The caller\'s stated reason' },
  { name: 'Call Recording URL', dataType: 'TEXT', placeholder: 'Most recent call. Populated post-call.' },
  { name: 'Call Transcript', dataType: 'LARGE_TEXT', placeholder: 'Most recent call. Populated post-call.' },
  { name: 'Insurance Carrier', dataType: 'TEXT', placeholder: 'Carrier handling the claim, if any' },
  { name: 'Claim Number', dataType: 'TEXT', placeholder: 'Insurer\'s claim reference' },
  { name: 'Called In From', dataType: 'TEXT', placeholder: 'The number that actually rang, from the carrier. Never sent back to the caller.' },
]
