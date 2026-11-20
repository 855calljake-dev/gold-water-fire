import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { SMS_VERBAL_TAG, callStatus, customFieldValues, isLead, keepEarlierSmsConsent, noteFor, saidYesToTexts, shapeCall, stageFor, tagsFor, toE164, transferOutcome, verifyRetellSignature } from './retell-call.mjs'

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

// ---------------------------------------------------------------------------
// The spoken yes to the phone agent's text question (post-call field
// sms_text_consent). Jake's ruling 2026-11-07.
// ---------------------------------------------------------------------------

const answered = (value, extra = {}) => {
  const data = { call_type: 'dispatch', caller_name: 'Mary Hines', callback_phone: '4805550101' }
  if (value !== MISSING) data.sms_text_consent = value
  return shapeCall({ ...base, start_timestamp: 1789000000000, call_analysis: { call_summary: 'Leak.', custom_analysis_data: data }, ...extra })
}
const MISSING = Symbol('field absent')
const TODAY_TAGS = ['phone-lead', 'line:480-999-3339', 'call:dispatch', 'consent:verbal-call']

// Everything that is not exactly the string 'yes'. A refusal adds no tag and no note line.
const REFUSED = [
  ['no', 'no'], ['not_asked', 'not_asked'], ['a missing field', MISSING], ['null', null], ['an empty string', ''],
  ['capital Yes', 'Yes'], ['all caps', 'YES'], ['spaces around it', ' yes '], ['the string true', 'true'],
  ['boolean true', true], ['the number 1', 1], ['a list', ['yes']], ['an object', { answer: 'yes' }], ['y', 'y'], ['yes please', 'yes please'],
]

test('a yes adds the tag, and the note records the time, the call id, the number and the recording', () => {
  const c = answered('yes')
  assert.equal(saidYesToTexts(c), true)
  assert.deepEqual(tagsFor(c), [...TODAY_TAGS, 'consent:sms-verbal'])
  const line = noteFor(c).split('\n').find((l) => l.startsWith('SMS consent:'))
  assert.ok(line, 'no SMS consent line in the note')
  assert.match(line, /Call time: 2026-09-10T00:26:40\.000Z\./)
  assert.match(line, /Call id: call_x\./)
  assert.match(line, /Number on this contact: \+14805550101\./)
  assert.match(line, /Recording: https:\/\/rec\/x\.wav\./)
  assert.doesNotMatch(line, /—/, 'no em dash in a line a person reads')
})

test('a yes still carries the tag and note every call carries, unchanged', () => {
  const c = answered('yes')
  assert.ok(tagsFor(c).includes('consent:verbal-call'))
  assert.match(noteFor(c), /Consent: verbal, on a recorded call\. Not express written SMS consent\./)
})

test('a yes with no recording or start time says so rather than dropping the line', () => {
  const c = answered('yes', { recording_url: undefined, start_timestamp: undefined })
  const line = noteFor(c).split('\n').find((l) => l.startsWith('SMS consent:'))
  assert.match(line, /Call time: not recorded\./)
  assert.match(line, /Recording: none on this call\./)
  assert.deepEqual(tagsFor(c), [...TODAY_TAGS, SMS_VERBAL_TAG])
})

for (const [label, value] of REFUSED) {
  test(`refused, ${label}: no tag and no note line, the same record as a call with no field`, () => {
    const c = answered(value)
    assert.equal(saidYesToTexts(c), false)
    assert.deepEqual(tagsFor(c), TODAY_TAGS)
    assert.ok(!noteFor(c).includes('SMS consent:'))
    assert.equal(noteFor(c), noteFor(answered(MISSING)))
  })
}

test('a yes on its own does not make a call a lead or change its stage', () => {
  const quiet = (v) => shapeCall({ ...base, call_analysis: { custom_analysis_data: { sms_text_consent: v } } })
  assert.equal(isLead(quiet('yes')), false)
  assert.equal(isLead(quiet('yes')), isLead(shapeCall({ ...base, call_analysis: {} })))
  assert.equal(stageFor(quiet('yes'), {}), 'New Lead')
})

test('an earlier yes is carried only when this call says nothing new about texts', () => {
  const earlier = ['phone-lead', SMS_VERBAL_TAG]
  assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, earlier, answered(MISSING)), [...TODAY_TAGS, SMS_VERBAL_TAG])
  assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, earlier, answered(null)), [...TODAY_TAGS, SMS_VERBAL_TAG])
  assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, earlier, answered('not_asked')), [...TODAY_TAGS, SMS_VERBAL_TAG])
  for (const value of ['no', 'Yes', 'unsure', '', true]) {
    assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, earlier, answered(value)), TODAY_TAGS, `carried on ${value}`)
  }
  assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, ['phone-lead'], answered(MISSING)), TODAY_TAGS, 'nothing earlier, nothing added')
  assert.deepEqual(keepEarlierSmsConsent(TODAY_TAGS, [], answered(MISSING)), TODAY_TAGS)
  const once = tagsFor(answered('yes'))
  assert.deepEqual(keepEarlierSmsConsent(once, earlier, answered('yes')), once, 'never twice')
})

// The whole webhook, with fetch stubbed: what actually goes to GHL. No network.
async function deliver(call, { duplicate = () => ({ contact: null }) } = {}) {
  const { default: handler } = await import('../functions/retell-webhook.mjs')
  const { CANONICAL_FIELDS } = await import('./retell-call.mjs')
  const testEnv = { RETELL_API_KEY: KEY, GHL_PIT: 'pit_test', GHL_LOCATION_ID: 'loc_test', GHL_CONVERSATION_PROVIDER_ID: undefined }
  const saved = { fetch: globalThis.fetch, error: console.error, log: console.log, env: Object.fromEntries(Object.keys(testEnv).map((k) => [k, process.env[k]])) }
  const setEnv = (vars) => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
  const sent = { upsert: null, notes: [], lookups: [], errors: [] }
  setEnv(testEnv)
  console.log = () => {}
  console.error = (...a) => sent.errors.push(a.map(String).join(' '))
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url)
    const json = (body) => new Response(JSON.stringify(body), { status: 200 })
    if (u.pathname === '/contacts/search/duplicate') {
      sent.lookups.push(Object.fromEntries(u.searchParams))
      const answer = duplicate(u.searchParams)
      if (answer === 'hang') {
        // AbortSignal.timeout's timer does not hold the process open; a real socket would, so this does.
        const open = setTimeout(() => {}, 6000)
        return new Promise((_, reject) => init.signal?.addEventListener('abort', () => { clearTimeout(open); reject(init.signal.reason) }))
      }
      return answer === 'fail' ? new Response('nope', { status: 500 }) : json(answer)
    }
    if (u.pathname === '/contacts/upsert') { sent.upsert = JSON.parse(init.body); return json({ contact: { id: 'c1' } }) }
    if (u.pathname === '/contacts/c1/notes') { sent.notes.push(JSON.parse(init.body).body); return json({}) }
    if (u.pathname.endsWith('/customFields')) return json({ customFields: CANONICAL_FIELDS.map((f, i) => ({ id: `f${i}`, name: f.name })) })
    if (u.pathname === '/opportunities/pipelines') return json({ pipelines: [{ id: 'p', name: 'Marketing Pipeline', stages: [{ id: 's1', name: 'Hot Lead' }, { id: 's2', name: 'New Lead' }] }] })
    if (u.pathname === '/opportunities/upsert') return json({})
    throw new Error(`unexpected request: ${init.method ?? 'GET'} ${u.pathname}`)
  }
  try {
    const raw = JSON.stringify({ event: 'call_analyzed', call })
    const res = await handler(new Request('https://x.test/', {
      method: 'POST', body: raw, headers: { 'x-retell-signature': sign(raw, Date.now()) },
    }))
    sent.status = res.status
    sent.result = await res.json()
    return sent
  } finally {
    globalThis.fetch = saved.fetch
    console.error = saved.error
    console.log = saved.log
    setEnv(saved.env)
  }
}

const callWith = (value) => {
  const data = { call_type: 'dispatch', caller_name: 'Mary Hines', callback_phone: '4805550101', email: 'mary@example.com' }
  if (value !== MISSING) data.sms_text_consent = value
  return { ...base, start_timestamp: 1789000000000, call_analysis: { call_summary: 'Leak.', custom_analysis_data: data } }
}
const haveYesOnFile = () => ({ contact: { id: 'c1', tags: ['phone-lead', SMS_VERBAL_TAG] } })

test('webhook, today with no field: same tags and note as before, no consent setting sent', async () => {
  const s = await deliver(callWith(MISSING))
  assert.equal(s.result.ghl, 'written')
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
  assert.ok(!s.notes[0].includes('SMS consent:'))
  assert.ok(!('dndSettings' in s.upsert))
  assert.ok(!s.errors.some((e) => e.includes('existing tags')), 'a working read logs no tag error')
})

test('webhook, yes: the tag and the note line reach GHL, and no SMS or DND setting is sent', async () => {
  const s = await deliver(callWith('yes'))
  assert.deepEqual(s.upsert.tags, [...TODAY_TAGS, SMS_VERBAL_TAG])
  assert.match(s.notes[0], /SMS consent: the caller said yes/)
  assert.ok(!('dndSettings' in s.upsert))
  assert.ok(!('dnd' in s.upsert))
})

test('webhook, no with nothing on file: nothing added', async () => {
  const s = await deliver(callWith('no'))
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
  assert.ok(!s.notes[0].includes('SMS consent:'))
})

test('webhook, a later call that never asked keeps an earlier yes through the overwrite', async () => {
  for (const value of [MISSING, 'not_asked']) {
    const s = await deliver(callWith(value), { duplicate: haveYesOnFile })
    assert.deepEqual(s.upsert.tags, [...TODAY_TAGS, SMS_VERBAL_TAG])
    assert.ok(!s.notes[0].includes('SMS consent:'), 'carrying the tag is not a new yes')
  }
})

test('webhook, a later no is not overridden by an earlier yes', async () => {
  const s = await deliver(callWith('no'), { duplicate: haveYesOnFile })
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
})

test('webhook looks up both email and phone, because the location decides which one upsert matches', async () => {
  const s = await deliver(callWith(MISSING))
  assert.deepEqual(s.lookups, [
    { locationId: 'loc_test', email: 'mary@example.com' },
    { locationId: 'loc_test', number: '+14805550101' },
  ])
})

test('webhook, a yes held on the phone match alone is still found when the email matches nobody', async () => {
  const s = await deliver(callWith(MISSING), { duplicate: (q) => (q.get('number') ? haveYesOnFile() : { contact: null }) })
  assert.deepEqual(s.upsert.tags, [...TODAY_TAGS, SMS_VERBAL_TAG])
})

test('webhook, a failed tag read still writes the call as it always was, and says so', async () => {
  const s = await deliver(callWith(MISSING), { duplicate: () => 'fail' })
  assert.equal(s.result.ghl, 'written')
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
  assert.ok(s.errors.some((e) => e.includes('could not read existing tags for call_x')), 'the failure must be logged')
})

test('webhook, a yes or a no needs no tag read at all, so a broken read cannot touch it', async () => {
  const yes = await deliver(callWith('yes'), { duplicate: () => 'fail' })
  assert.deepEqual(yes.lookups, [])
  assert.deepEqual(yes.upsert.tags, [...TODAY_TAGS, SMS_VERBAL_TAG])
  assert.match(yes.notes[0], /SMS consent: the caller said yes/)
  const no = await deliver(callWith('no'), { duplicate: () => 'fail' })
  assert.deepEqual(no.lookups, [])
  assert.deepEqual(no.upsert.tags, TODAY_TAGS)
  assert.ok(!no.errors.some((e) => e.includes('existing tags')))
})

test('webhook, a hung tag read gives up, still writes the call, and says so', async () => {
  const s = await deliver(callWith(MISSING), { duplicate: () => 'hang' })
  assert.equal(s.result.ghl, 'written')
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
  assert.ok(s.errors.some((e) => e.includes('could not read existing tags for call_x')), 'the timeout must be logged')
})

test('webhook, email and phone on two different people: one person\'s yes never lands on the other', async () => {
  const twoPeople = (q) => (q.get('email')
    ? { contact: { id: 'someone-else', tags: ['phone-lead'] } }
    : { contact: { id: 'said-yes', tags: ['phone-lead', SMS_VERBAL_TAG] } })
  const s = await deliver(callWith(MISSING), { duplicate: twoPeople })
  assert.equal(s.result.ghl, 'written')
  assert.deepEqual(s.upsert.tags, TODAY_TAGS)
  assert.ok(s.errors.some((e) => e.includes('could not read existing tags for call_x')), 'the mismatch must be logged')
})

test('webhook, email and phone on the same contact is one contact, and the yes is carried', async () => {
  const s = await deliver(callWith(MISSING), { duplicate: haveYesOnFile })
  assert.equal(s.lookups.length, 2)
  assert.deepEqual(s.upsert.tags, [...TODAY_TAGS, SMS_VERBAL_TAG])
  assert.ok(!s.errors.some((e) => e.includes('existing tags')))
})
