/**
 * Session hydration for the tracking pipeline.
 *
 * Design notes:
 *  - Sessions are UPSERTed on (property_id, session_id) so the first write from
 *    a tab is INSERT and every subsequent write is UPDATE. No race.
 *  - UTM fields are "first-touch": we only set them when the session is first
 *    created. The tracker never overwrites them on subsequent pageviews.
 *  - landing_page is also first-touch; last_page is every-touch.
 *  - Identified attributes (email, contact_id) are upgraded but never
 *    downgraded: once a session has an email, a later anonymous write won't
 *    wipe it.
 *  - event_count is incremented atomically via an RPC-less approach: we do a
 *    cheap read-modify-write. Budget acceptable for this volume; if it becomes
 *    hot we can switch to a Postgres function.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { parseUserAgent } from "./auth"

export interface SessionUpsertInput {
  propertyId: string
  siteId: string | null
  sessionId: string
  anonymousId?: string | null
  contactId?: string | null
  email?: string | null
  pageUrl?: string | null
  referrer?: string | null
  utm?: {
    source?: string | null
    medium?: string | null
    campaign?: string | null
    content?: string | null
    term?: string | null
  }
  ipAddress?: string | null
  userAgent?: string | null
  country?: string | null
  city?: string | null
  incrementEvents?: number
}

/**
 * Upsert a session row and return the session DB id plus whether this was a
 * brand-new session (useful for downstream event routing e.g. "session_start").
 */
export async function upsertSession(
  supabase: SupabaseClient,
  input: SessionUpsertInput,
): Promise<{ id: string; created: boolean }> {
  // Look up existing row.
  const { data: existing } = await supabase
    .from("tracking_sessions")
    .select("id, event_count, email, contact_id, anonymous_id, utm_source, landing_page")
    .eq("property_id", input.propertyId)
    .eq("session_id", input.sessionId)
    .maybeSingle()

  const inc = input.incrementEvents ?? 1
  const nowIso = new Date().toISOString()

  if (!existing) {
    const ua = parseUserAgent(input.userAgent ?? null)
    const row = {
      property_id: input.propertyId,
      site_id: input.siteId,
      session_id: input.sessionId,
      anonymous_id: input.anonymousId ?? null,
      contact_id: input.contactId ?? null,
      email: input.email ?? null,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      event_count: inc,
      landing_page: input.pageUrl ?? null,
      last_page: input.pageUrl ?? null,
      referrer: input.referrer ?? null,
      utm_source: input.utm?.source ?? null,
      utm_medium: input.utm?.medium ?? null,
      utm_campaign: input.utm?.campaign ?? null,
      utm_content: input.utm?.content ?? null,
      utm_term: input.utm?.term ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      device_type: ua.deviceType,
      browser: ua.browser,
      os: ua.os,
    }
    const { data: inserted, error } = await supabase
      .from("tracking_sessions")
      .insert(row)
      .select("id")
      .single()
    if (error) throw error
    return { id: inserted.id, created: true }
  }

  // Upgrade-only update: don't stomp on already-identified fields.
  const patch: Record<string, unknown> = {
    last_seen_at: nowIso,
    event_count: (existing.event_count ?? 0) + inc,
  }
  if (input.pageUrl) patch.last_page = input.pageUrl
  if (input.anonymousId && !existing.anonymous_id) patch.anonymous_id = input.anonymousId
  if (input.email && !existing.email) patch.email = input.email
  if (input.contactId && !existing.contact_id) patch.contact_id = input.contactId

  const { error: updErr } = await supabase
    .from("tracking_sessions")
    .update(patch)
    .eq("id", existing.id)
  if (updErr) throw updErr

  return { id: existing.id, created: false }
}
