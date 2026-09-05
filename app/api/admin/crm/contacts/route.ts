import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import {
  applyContactAccess,
  canReadContactRecord,
  normalizeRequestedContactVisibility,
  resolveContactAccess,
  type ContactAccess,
} from "@/lib/crm/contact-access"
import {
  getSegmentForProperty,
  invalidateDynamicSegments,
  recomputeSegments,
  segmentNeedsRefresh,
} from "@/lib/crm/segment-service"

function whiteLabelSource<T extends Record<string, unknown>>(contact: T): T {
  if (String(contact.source ?? "").toLowerCase() !== "apollo") return contact
  return { ...contact, source: "scout" }
}

function matchesSearch(contact: Record<string, unknown>, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase("it-IT")
  if (!needle) return true
  return [contact.name, contact.email, contact.company].some((value) =>
    String(value ?? "").toLocaleLowerCase("it-IT").includes(needle),
  )
}

async function contactsFromSegment({
  supabase,
  propertyId,
  segmentId,
  vip,
  search,
  limit,
  offset,
  access,
}: {
  supabase: ReturnType<typeof createServiceClient>
  propertyId: string
  segmentId: string
  vip: string | null
  search: string | null
  limit: number
  offset: number
  access: ContactAccess
}) {
  const segment = await getSegmentForProperty(supabase, propertyId, segmentId)
  if (!segment) return { error: "Segmento non trovato.", status: 404 as const, contacts: [] }

  if (segmentNeedsRefresh(segment)) {
    await recomputeSegments(supabase, propertyId, [segment], { force: true })
  }

  const wanted = offset + limit
  const matching: Record<string, unknown>[] = []
  const pageSize = 500
  let from = 0

  while (matching.length < wanted) {
    const { data, error } = await supabase
      .from("contact_segment_members")
      .select("added_at, contact:contacts!inner(*)")
      .eq("segment_id", segmentId)
      .order("added_at", { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error
    const rows = data ?? []

    for (const row of rows as Array<{ contact?: Record<string, unknown> | Record<string, unknown>[] | null }>) {
      const nested = row.contact
      const contact = Array.isArray(nested) ? nested[0] : nested
      if (!contact || String(contact.property_id ?? "") !== propertyId) continue
      if (!canReadContactRecord(contact, access)) continue
      if (vip && vip !== "all" && String(contact.vip_level ?? "") !== vip) continue
      if (search && !matchesSearch(contact, search)) continue
      matching.push(whiteLabelSource(contact))
      if (matching.length >= wanted) break
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return { error: null, status: 200 as const, contacts: matching.slice(offset, offset + limit) }
}

async function context(request: NextRequest) {
  await requireAreaApi("crm", request)
  const propertyId = await getCurrentProperty(request)
  const identity = await getCallerIdentity(request)
  if (!propertyId || !identity) return null
  const supabase = createServiceClient()
  const access = await resolveContactAccess(supabase, { ...identity, propertyId })
  return { propertyId, identity, supabase, access }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await context(request)
    if (!ctx) return NextResponse.json({ error: "Property not found" }, { status: 404 })
    const { propertyId, supabase, access } = ctx
    const { searchParams } = new URL(request.url)

    const segment = searchParams.get("segment")
    const vip = searchParams.get("vip")
    const search = searchParams.get("search")
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "50")
    const parsedOffset = Number.parseInt(searchParams.get("offset") || "0")
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 250) : 50
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0

    if (segment && segment !== "all") {
      const result = await contactsFromSegment({
        supabase,
        propertyId,
        segmentId: segment,
        vip,
        search,
        limit,
        offset,
        access,
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json(result.contacts)
    }

    let query = applyContactAccess(
      supabase
        .from("contacts")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      access,
    )

    if (vip && vip !== "all") query = query.eq("vip_level", vip)

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim()
      if (safeSearch) {
        query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,company.ilike.%${safeSearch}%`)
      }
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json((data || []).map((contact: Record<string, unknown>) => whiteLabelSource(contact)))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching contacts:", error)
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await context(request)
    if (!ctx) return NextResponse.json({ error: "Property not found" }, { status: 404 })
    const { propertyId, identity, supabase } = ctx
    const body = await request.json()

    const requestedSource = String(body.source || "manual").toLowerCase()
    const source = requestedSource === "apollo" ? "scout" : requestedSource
    const ownerUserId = identity.adminUserId || null
    let visibilityScope = normalizeRequestedContactVisibility(source, body.visibility_scope, ownerUserId)

    const requestedGroupIds = Array.isArray(body.group_ids)
      ? [...new Set(body.group_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : []

    let validGroupIds: string[] = []
    if (visibilityScope === "groups" && requestedGroupIds.length > 0) {
      const { data: groups } = await supabase
        .from("user_groups")
        .select("id")
        .eq("property_id", propertyId)
        .in("id", requestedGroupIds)
      validGroupIds = (groups ?? []).map((g: any) => String(g.id))
    }
    if (visibilityScope === "groups" && validGroupIds.length === 0) visibilityScope = "private"

    const { group_ids: _groupIds, visibility_scope: _visibility, owner_user_id: _owner, property_id: _property, ...contactBody } = body
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        ...contactBody,
        property_id: propertyId,
        source,
        visibility_scope: visibilityScope,
        owner_user_id: visibilityScope === "tenant" ? null : ownerUserId,
      })
      .select()
      .single()

    if (error) throw error

    if (visibilityScope === "groups" && validGroupIds.length > 0) {
      const rows = validGroupIds.map((group_id) => ({ property_id: propertyId, contact_id: data.id, group_id }))
      const { error: sharingError } = await supabase.from("contact_visibility_groups").insert(rows)
      if (sharingError) throw sharingError
    }

    await invalidateDynamicSegments(supabase, propertyId)
    return NextResponse.json(whiteLabelSource({ ...data, group_ids: validGroupIds }))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error creating contact:", error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
