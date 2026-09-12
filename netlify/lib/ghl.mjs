/**
 * GoHighLevel client, tenant agnostic on purpose. Ported from
 * jaketaylor-home-loans netlify/lib/ghl.mts (e5ecbad, 2026-09-05) per
 * SOP-CROSS-TENANT-FIX-PROPAGATION.md: same names, same behaviour, plain ESM
 * because this repo has no TypeScript toolchain and no dependencies.
 *
 * Jake's rulings: GHL is the CRM of record for every ByTomorrow tenant
 * (2026-09-04), and for GWF "use GHL, not Airtable, for call handling and
 * reporting" (2026-09-09). Nothing here names a pipeline, a stage or a field id;
 * those come from env or are resolved BY NAME at runtime, because a pinned id
 * goes stale the moment someone renames a stage in the UI and fails as a 4xx on
 * one write while everything else succeeds.
 *
 * Env, read in this order:
 *   GHL_PIT or GHL_GWF_PIT   Private Integration Token for the location
 *   GHL_LOCATION_ID          the sub-account to write into
 */

const GHL_API = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

/** Returns null when GHL is not configured; the caller reports that loudly. */
export function ghlEnv(env = process.env) {
  const token = env.GHL_PIT || env.GHL_GWF_PIT
  const locationId = env.GHL_LOCATION_ID
  if (!token || !locationId) return null
  return { token, locationId }
}

function ghlHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    version: GHL_VERSION,
    accept: 'application/json',
    'content-type': 'application/json',
  }
}

export async function ghl({ token }, path, opts = {}) {
  const res = await fetch(GHL_API + path, {
    method: opts.method ?? 'GET',
    headers: ghlHeaders(token),
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GHL ${opts.method ?? 'GET'} ${path} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Upsert by phone/email; GHL decides the match under the location's own
 * duplicate setting. A phone call is verbal contact, never express written
 * consent for SMS, so `consent` (create only) sets channel DND accordingly.
 * Never pass consent for an existing contact: it would revoke consent a past
 * customer already gave in writing.
 */
export async function upsertContact(env, input) {
  const body = {
    locationId: env.locationId,
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.lastName ? { lastName: input.lastName } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.address1 ? { address1: input.address1 } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.customFields?.length ? { customFields: input.customFields } : {}),
    ...(input.consent
      ? {
          dndSettings: {
            SMS: {
              status: input.consent.sms ? 'inactive' : 'active',
              message: 'No express written SMS consent on file',
            },
            Email: {
              status: input.consent.email ? 'inactive' : 'active',
              message: 'No email consent on file',
            },
          },
        }
      : {}),
  }
  const data = await ghl(env, '/contacts/upsert', { method: 'POST', body })
  const contactId = data?.contact?.id ?? data?.id
  if (!contactId) throw new Error(`GHL upsert returned no contact id: ${JSON.stringify(data).slice(0, 300)}`)
  return { contactId }
}

/** null on any lookup failure: the conservative direction never widens consent. */
export async function findContactId(env, input) {
  const qs = new URLSearchParams({ locationId: env.locationId })
  if (input.email) qs.set('email', input.email)
  else if (input.phone) qs.set('number', input.phone)
  else return null
  try {
    const data = await ghl(env, `/contacts/search/duplicate?${qs.toString()}`)
    return data?.contact?.id ?? null
  } catch {
    return null
  }
}

export async function createNote(env, contactId, body) {
  return ghl(env, `/contacts/${contactId}/notes`, { method: 'POST', body: { body } })
}

// ---------------------------------------------------------------------------
// Conversations: the call lands in the contact's timeline as a real call.
// ---------------------------------------------------------------------------

/**
 * A timeline Call needs a `conversationProviderId`. GHL answers
 * 400 CONVERSATIONS_MSG_PROVIDER_ID_REQUIRED without one (reproduced against
 * the GWF sub-account 2026-09-12), and a Conversation Provider only exists
 * once a marketplace app registers one and is installed on the location. So
 * the id comes from env, and without it the caller skips this write and says
 * so, instead of paying a 400 on every call. Returns null when skipped.
 */
export function conversationProviderId(env = process.env) {
  return env.GHL_CONVERSATION_PROVIDER_ID || null
}

export async function addCallMessage(env, input) {
  const providerId = input.conversationProviderId ?? conversationProviderId()
  if (!providerId) return { messageId: undefined, skipped: 'no_conversation_provider' }
  const path = input.direction === 'inbound'
    ? '/conversations/messages/inbound'
    : '/conversations/messages/outbound'
  const data = await ghl(env, path, {
    method: 'POST',
    body: {
      type: 'Call',
      contactId: input.contactId,
      conversationProviderId: providerId,
      direction: input.direction,
      ...(input.date ? { date: input.date } : {}),
      call: {
        ...(input.to ? { to: input.to } : {}),
        ...(input.from ? { from: input.from } : {}),
        status: input.status ?? 'completed',
      },
    },
  })
  return { messageId: data?.messageId ?? data?.id }
}

/** Recording lives as an attachment on the call message. Max 5 URLs per GHL. */
export async function attachRecording(env, messageId, url) {
  return ghl(env, `/conversations/messages/${messageId}/attachments`, {
    method: 'PUT',
    body: { attachmentUrls: [url] },
  })
}

// ---------------------------------------------------------------------------
// Pipelines and custom fields, resolved by NAME.
// ---------------------------------------------------------------------------

let pipelineCache = null

export async function resolveStage(env, pipelineName, stageName) {
  if (!pipelineCache) {
    const data = await ghl(env, `/opportunities/pipelines?locationId=${env.locationId}`)
    pipelineCache = data?.pipelines ?? []
  }
  const norm = (s) => String(s).trim().toLowerCase()
  const pipeline = pipelineCache.find((p) => norm(p.name) === norm(pipelineName))
  if (!pipeline) return null
  const stage = (pipeline.stages ?? []).find((s) => norm(s.name) === norm(stageName))
  if (!stage) return null
  return { pipelineId: pipeline.id, stageId: stage.id }
}

export async function upsertOpportunity(env, input) {
  return ghl(env, '/opportunities/upsert', {
    method: 'POST',
    body: {
      locationId: env.locationId,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      pipelineStageId: input.stageId,
      name: input.name,
      status: 'open',
      ...(input.monetaryValue ? { monetaryValue: input.monetaryValue } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
  })
}

let fieldCache = null

export async function customFieldIds(env) {
  if (fieldCache) return fieldCache
  const data = await ghl(env, `/locations/${env.locationId}/customFields?model=contact`)
  const map = new Map()
  for (const f of data?.customFields ?? []) {
    if (f?.name && f?.id) map.set(String(f.name).trim().toLowerCase(), f.id)
  }
  fieldCache = map
  return map
}

/** Skips anything the tenant has not provisioned; the caller reports `missing`. */
export async function buildCustomFields(env, values) {
  const ids = await customFieldIds(env)
  const fields = []
  const missing = []
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    const id = ids.get(name.trim().toLowerCase())
    if (!id) {
      missing.push(name)
      continue
    }
    fields.push({ id, value })
  }
  return { fields, missing }
}
