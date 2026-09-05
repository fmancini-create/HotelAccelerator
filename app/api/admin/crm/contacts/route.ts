import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
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
}: {
  supabase: ReturnType<typeof createServiceClient>
  propertyId: string
  segmentId: string
  vip: string | null
  search: string | null
  limit: number
  offset: number
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

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
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
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json(result.contacts)
    }

    let query = supabase
      .from("contacts")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

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
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const body = await request.json()

    const requestedSource = String(body.source || "manual").toLowerCase()
    const source = requestedSource === "apollo" ? "scout" : requestedSource

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        ...body,
        property_id: propertyId,
        source,
      })
      .select()
      .single()

    if (error) throw error
    await invalidateDynamicSegments(supabase, propertyId)

    return NextResponse.json(whiteLabelSource(data))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error creating contact:", error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
