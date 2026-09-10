import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { customFieldValues, isLead, shapeCall, stageFor, tagsFor, toE164, verifyRetellSignature } from './retell-call.mjs'

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
  assert.deepEqual(tagsFor(c), ['phone-lead', 'line:480-999-3339', 'call:dispatch'])
})
