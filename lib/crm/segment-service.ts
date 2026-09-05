import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import {
  SYSTEM_SEGMENT_PRESETS,
  matchesSegment,
  normalizeSegmentConditions,
  type SegmentConditions,
} from "@/lib/crm/segment-engine"

type ServiceClient = ReturnType<typeof createServiceClient>

export interface ContactSegmentRow {
  id: string
  property_id: string
  name: string
  description: string | null
  segment_type: string | null
  conditions: unknown
  contact_count: number | null
  last_computed_at: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface SegmentContactSnapshot extends Record<string, unknown> {
  id: string
}

const SEGMENT_CONTACT_COLUMNS = [
  "id",
  "email",
  "phone",
  "language",
  "tags",
  "created_at",
  "source",
  "company",
  "country",
  "city",
  "birthday",
  "anniversary",
  "marketing_consent",
  "unsubscribed",
  "total_bookings",
  "total_revenue_cents",
  "first_booking_date",
  "last_booking_date",
  "avg_stay_nights",
  "preferred_room_type",
  "preferred_season",
  "interests",
  "vip_level",
  "lead_score",
  "email_opens_count",
  "email_clicks_count",
].join(",")

const PAGE_SIZE = 1000
const MEMBER_INSERT_BATCH = 500
export const SEGMENT_REFRESH_TTL_MS = 10 * 60 * 1000

export function isSystemSegment(segment: Pick<ContactSegmentRow, "conditions">): boolean {
  return Boolean(normalizeSegmentConditions(segment.conditions).preset)
}

export function segmentNeedsRefresh(
  segment: Pick<ContactSegmentRow, "segment_type" | "last_computed_at">,
  now = Date.now(),
): boolean {
  if ((segment.segment_type ?? "dynamic") === "static") return false
  if (!segment.last_computed_at) return true
  const computedAt = new Date(segment.last_computed_at).getTime()
  return Number.isNaN(computedAt) || now - computedAt >= SEGMENT_REFRESH_TTL_MS
}

export async function ensureSystemSegments(
  supabase: ServiceClient,
  propertyId: string,
  existingSegments?: ContactSegmentRow[],
): Promise<ContactSegmentRow[]> {
  let existing = existingSegments
  if (!existing) {
    const { data, error } = await supabase
      .from("contact_segments")
      .select("*")
      .eq("property_id", propertyId)
      .order("name")
    if (error) throw error
    existing = (data ?? []) as ContactSegmentRow[]
  }

  const knownPresets = new Set(
    existing
      .map((segment) => normalizeSegmentConditions(segment.conditions).preset)
      .filter((preset): preset is string => Boolean(preset)),
  )
  const knownNames = new Set(existing.map((segment) => segment.name.trim().toLocaleLowerCase("it-IT")))

  const missing = SYSTEM_SEGMENT_PRESETS.filter(
    (preset) =>
      !knownPresets.has(preset.conditions.preset ?? "") &&
      !knownNames.has(preset.name.trim().toLocaleLowerCase("it-IT")),
  )

  if (missing.length === 0) return existing

  const { data, error } = await supabase
    .from("contact_segments")
    .insert(
      missing.map((preset) => ({
        property_id: propertyId,
        name: preset.name,
        description: preset.description,
        segment_type: preset.segment_type,
        conditions: preset.conditions,
        contact_count: 0,
        last_computed_at: null,
      })),
    )
    .select("*")

  if (error) {
    if (error.code !== "23505") throw error
    const { data: refreshed, error: refreshedError } = await supabase
      .from("contact_segments")
      .select("*")
      .eq("property_id", propertyId)
      .order("name")
    if (refreshedError) throw refreshedError
    return (refreshed ?? []) as ContactSegmentRow[]
  }

  return [...existing, ...((data ?? []) as ContactSegmentRow[])].sort((a, b) => a.name.localeCompare(b.name, "it"))
}

export async function fetchSegmentContactSnapshot(
  supabase: ServiceClient,
  propertyId: string,
): Promise<SegmentContactSnapshot[]> {
  const rows: SegmentContactSnapshot[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select(SEGMENT_CONTACT_COLUMNS)
      .eq("property_id", propertyId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as SegmentContactSnapshot[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function replaceSegmentMembers(
  supabase: ServiceClient,
  segmentId: string,
  contactIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase.from("contact_segment_members").delete().eq("segment_id", segmentId)
  if (deleteError) throw deleteError

  for (let index = 0; index < contactIds.length; index += MEMBER_INSERT_BATCH) {
    const batch = contactIds.slice(index, index + MEMBER_INSERT_BATCH)
    const { error: insertError } = await supabase.from("contact_segment_members").insert(
      batch.map((contactId) => ({
        segment_id: segmentId,
        contact_id: contactId,
      })),
    )
    if (insertError) throw insertError
  }
}

export async function recomputeSegments(
  supabase: ServiceClient,
  propertyId: string,
  segments: ContactSegmentRow[],
  options: { force?: boolean; segmentIds?: string[] } = {},
): Promise<ContactSegmentRow[]> {
  const selectedIds = options.segmentIds ? new Set(options.segmentIds) : null
  const now = Date.now()
  const dynamicTargets = segments.filter((segment) => {
    if (selectedIds && !selectedIds.has(segment.id)) return false
    if ((segment.segment_type ?? "dynamic") === "static") return false
    return options.force || segmentNeedsRefresh(segment, now)
  })

  const staticTargets = segments.filter((segment) => {
    if (selectedIds && !selectedIds.has(segment.id)) return false
    return (segment.segment_type ?? "dynamic") === "static"
  })

  const updates = new Map<string, ContactSegmentRow>()

  if (dynamicTargets.length > 0) {
    const contacts = await fetchSegmentContactSnapshot(supabase, propertyId)
    const computedAt = new Date().toISOString()

    for (const segment of dynamicTargets) {
      const conditions = normalizeSegmentConditions(segment.conditions)
      const matchedIds = contacts.filter((contact) => matchesSegment(contact, conditions)).map((contact) => contact.id)

      await replaceSegmentMembers(supabase, segment.id, matchedIds)
      const { data, error } = await supabase
        .from("contact_segments")
        .update({
          contact_count: matchedIds.length,
          last_computed_at: computedAt,
          updated_at: computedAt,
        })
        .eq("id", segment.id)
        .eq("property_id", propertyId)
        .select("*")
        .single()
      if (error) throw error
      updates.set(segment.id, data as ContactSegmentRow)
    }
  }

  for (const segment of staticTargets) {
    const { count, error } = await supabase
      .from("contact_segment_members")
      .select("id", { count: "exact", head: true })
      .eq("segment_id", segment.id)
    if (error) throw error

    const computedAt = new Date().toISOString()
    const { data, error: updateError } = await supabase
      .from("contact_segments")
      .update({
        contact_count: count ?? 0,
        last_computed_at: computedAt,
        updated_at: computedAt,
      })
      .eq("id", segment.id)
      .eq("property_id", propertyId)
      .select("*")
      .single()
    if (updateError) throw updateError
    updates.set(segment.id, data as ContactSegmentRow)
  }

  return segments.map((segment) => updates.get(segment.id) ?? segment)
}

export async function computePreviewCount(
  supabase: ServiceClient,
  propertyId: string,
  conditions: SegmentConditions,
): Promise<number> {
  const contacts = await fetchSegmentContactSnapshot(supabase, propertyId)
  return contacts.reduce((count, contact) => count + (matchesSegment(contact, conditions) ? 1 : 0), 0)
}

export async function getSegmentForProperty(
  supabase: ServiceClient,
  propertyId: string,
  segmentId: string,
): Promise<ContactSegmentRow | null> {
  const { data, error } = await supabase
    .from("contact_segments")
    .select("*")
    .eq("id", segmentId)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (error) throw error
  return (data as ContactSegmentRow | null) ?? null
}

export async function invalidateDynamicSegments(supabase: ServiceClient, propertyId: string): Promise<void> {
  const { error } = await supabase
    .from("contact_segments")
    .update({ last_computed_at: null })
    .eq("property_id", propertyId)
    .neq("segment_type", "static")
  if (error) console.error("Unable to invalidate CRM segment cache:", error)
}
