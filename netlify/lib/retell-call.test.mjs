import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { callStatus, customFieldValues, isLead, noteFor, shapeCall, stageFor, tagsFor, toE164, transferOutcome, verifyRetellSignature } from './retell-call.mjs'

const KEY = 'key_test_0000'
const sign = (body, ts) => `v=${ts},d=${createHmac('sha256', KEY).update(body + ts).digest('hex')}`

test('signature: accepts a fresh, correctly signed body', () => {
  const now = 1_789_000_000_000
  assert.equal(verifyRetellSignature('{"a":1}', KEY, sign('{"a":1}', now - 1000), now), true)
})

test('signature: rejects a stale timestamp, a wrong key, and a tampered body', () => {
  const now = 1_789_000_000_000
  assert.equal(verifyRetellSignature('{"a":1}', KEY, sign('{"a":1}', now - 6 * 60 * 1000), now), false)
  assert.equal(verifyRetellSignature('{"a":1}', 'other', sign('{"a":1}', now), now), false)
  assert.equal(verifyRetellSignature('{"a":2}', KEY, sign('{"a":1}', now), now), false)
  assert.equal(verifyRetellSignature('{"a":1}', KEY, null, now), false)
})

test('toE164 normalises ten and eleven digit numbers', () => {
  assert.equal(toE164('(480) 999-3339'), '+14809993339')
  assert.equal(toE164('1 480 999 3339'), '+14809993339')
  assert.equal(toE164(''), undefined)
})

const base = {
  call_id: 'call_x',
  direction: 'inbound',
  from_number: '+16025550100',
  to_number: '+14809993339',
  duration_ms: 137_000,
  disconnection_reason: 'agent_hangup',
  recording_url: 'https://rec/x.wav',
}

test('shapeCall: tool arguments win over extraction, caller id is the phone fallback', () => {
  const c = shapeCall({
    ...base,
    call_analysis: {
      call_summary: 'Leak in kitchen ceiling.',
      custom_analysis_data: { caller_name: 'Extracted Name', call_type: 'dispatch', wants_human: 'true' },
    },
    transcript_with_tool_calls: [
      { role: 'agent', content: 'hi' },
      { role: 'tool_call_invocation', name: 'create_lead_record', arguments: '{"caller_name":"Mary Hines","phone_number":"480-555-0101","call_type":"Dispatch","property_address":"1 Main St"}' },
      { role: 'tool_call_invocation', name: 'transfer_to_dispatch', arguments: '{}' },
    ],
  })
  assert.equal(c.fullName, 'Mary Hines')
  assert.equal(c.phone, '+14805550101')
  assert.equal(c.phoneCaptured, true)
  assert.equal(c.callType, 'dispatch')
  assert.equal(c.propertyAddress, '1 Main St')
  assert.equal(c.line, '480-999-3339')
  assert.equal(c.transferAttempted, true)
  assert.equal(c.wantsHuman, true)
  assert.equal(c.durationSec, 137)

  const noTool = shapeCall({ ...base, call_analysis: { custom_analysis_data: { caller_name: 'Extracted Name' } } })
  assert.equal(noTool.fullName, 'Extracted Name')
  assert.equal(noTool.phone, '+16025550100')
  assert.equal(noTool.phoneCaptured, false)
})

test('isLead: hangups, spam and wrong numbers stay out of the pipeline', () => {
  assert.equal(isLead(shapeCall({ ...base, call_analysis: {} })), false)
  assert.equal(isLead(shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'spam', caller_name: 'Robo' } } })), false)
  assert.equal(isLead(shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'wrong_number' } } })), false)
  assert.equal(isLead(shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'general_inquiry' } } })), true)
  assert.equal(isLead(shapeCall({ ...base, call_analysis: { custom_analysis_data: { wants_human: true } } })), true)
})

test('stageFor: dispatch or a transfer attempt goes hot, the rest is new', () => {
  const env = {}
  assert.equal(stageFor(shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'dispatch' } } }), env), 'Hot Lead')
  assert.equal(stageFor(shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'general_inquiry' } } }), env), 'New Lead')
  assert.equal(stageFor(shapeCall({ ...base, call_analysis: {} }), { GHL_STAGE_NEW: 'Initial Inquiry' }), 'Initial Inquiry')
})

test('customFieldValues: writes the picklist option strings the sub-account already has', () => {
  const c = shapeCall({ ...base, call_analysis: { custom_analysis_data: { call_type: 'dispatch', damage_type: 'water', transfer_connected: true, reason: 'ceiling leak' } },
    transcript: 'Agent: hello', transcript_with_tool_calls: [{ role: 'tool_call_invocation', name: 'transfer_to_dispatch', arguments: '{}' }] })
  const v = customFieldValues(c)
  assert.equal(v['Call Type'], 'Dispatch')
  assert.equal(v['Damage Type'], 'Water')
  assert.equal(v['Transfer Status'], 'Transferred \u2014 Connected')
  assert.equal(v['Reason / Notes'], 'ceiling leak')
  assert.equal(v['Call Transcript'], 'Agent: hello')
  const none = customFieldValues(shapeCall({ ...base, call_analysis: {} }))
  assert.equal(none['Call Type'], undefined)
  assert.equal(none['Transfer Status'], 'N/A')
  assert.deepEqual(tagsFor(c), ['phone-lead', 'line:480-999-3339', 'call:dispatch', 'consent:verbal-call'])
})

test('addCallMessage skips, and says so, when no conversation provider id is configured', async () => {
  const { addCallMessage } = await import('./ghl.mjs')
  const r = await addCallMessage({ token: 't', locationId: 'l' }, { contactId: 'c', direction: 'inbound' })
  assert.deepEqual(r, { messageId: undefined, skipped: 'no_conversation_provider' })
})

test('shapeCall carries the agent number and the start time for the timeline Call', () => {
  const c = shapeCall({ ...base, start_timestamp: 1789000000000, call_analysis: {} })
  assert.equal(c.agentNumber, '+14809993339')
  assert.equal(c.startedAt, '2026-09-10T00:26:40.000Z')
})

const ladder = (reason, tools) => ({
  ...base,
  disconnection_reason: reason,
  call_analysis: { call_summary: 'Leak.', custom_analysis_data: { call_type: 'dispatch' } },
  transcript_with_tool_calls: tools.flatMap(([name, id, result]) => [
    { role: 'tool_call_invocation', name, tool_call_id: id, arguments: '{}' },
    { role: 'tool_call_result', tool_call_id: id, content: result },
  ]),
})

test('ladder T-A: transfer connected on the first rung', () => {
  const c = shapeCall(ladder('call_transfer', [['transfer_to_jake', 'a', 'transferred successfully']]))
  assert.deepEqual([c.transferAttempted, c.transferConnected, c.transferRung], [true, true, 'transfer_to_jake'])
  assert.equal(callStatus(c), 'completed')
  assert.equal(customFieldValues(c)['Transfer Status'], 'Transferred \u2014 Connected')
})

test('ladder T-B: first rung failed, second connected; the rung is the tool that succeeded', () => {
  const c = shapeCall(ladder('call_transfer', [['transfer_to_jake', 'a', 'transfer failed'], ['transfer_to_jim', 'b', 'transferred successfully']]))
  assert.equal(c.transferRung, 'transfer_to_jim')
  assert.equal(callStatus(c), 'completed')
})

test('ladder T-C: every rung failed and the agent hung up', () => {
  const c = shapeCall(ladder('agent_hangup', [['transfer_to_jake', 'a', 'transfer failed'], ['transfer_to_jim', 'b', 'transfer failed']]))
  assert.deepEqual([c.transferAttempted, c.transferConnected], [true, false])
  assert.equal(callStatus(c), 'no-answer')
  assert.equal(customFieldValues(c)['Transfer Status'], 'Transferred \u2014 No Answer')
})

test('callStatus maps the non-transfer disconnection reasons', () => {
  const mk = (reason) => shapeCall({ ...base, disconnection_reason: reason, call_analysis: {} })
  assert.equal(callStatus(mk('user_hangup')), 'completed')
  assert.equal(callStatus(mk('voicemail_reached')), 'voicemail')
  assert.equal(callStatus(mk('dial_busy')), 'busy')
  assert.equal(callStatus(mk('no_valid_payment')), 'failed')
  assert.equal(callStatus(mk('error_llm_websocket_open')), 'failed')
})

test('Called In From is the carrier number; the note carries the transcript', () => {
  const c = shapeCall({ ...base, transcript: 'Agent: hi\nUser: leak', call_analysis: { call_summary: 'Leak.' } })
  assert.equal(customFieldValues(c)['Called In From'], '+16025550100')
  assert.match(noteFor(c), /Transcript:\nAgent: hi/)
  assert.equal(transferOutcome({ ...base }).attempted, false)
})
