import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

/**
 * GET /api/ui/pms-log
 * Returns PMS push log for the current user's hotel.
 * Tenant-facing: filters automatically by the user's hotel.
 * Query params: from?, to?, type? (all|changes|pushes), limit?
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Get user's hotel via profile -> organization -> hotel
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const isSuperAdmin = profile.role === "super_admin"

  // Find hotel: superadmin checks impersonation cookie first
  let hotelId: string | null = null

  if (isSuperAdmin) {
    const cookieStore = await cookies()
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
    if (impersonatedHotelId) {
      hotelId = impersonatedHotelId
    } else {
      const { data: firstHotel } = await supabase
        .from("hotels")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      hotelId = firstHotel?.id || null
    }
  } else {
    const { data: upm } = await supabase
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()

    if (upm?.hotel_id) {
      hotelId = upm.hotel_id
    } else if (profile.organization_id) {
      const { data: orgHotel } = await supabase
        .from("hotels")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .limit(1)
        .maybeSingle()
      hotelId = orgHotel?.id || null
    }
  }

  if (!hotelId) {
    return NextResponse.json({ error: "No hotel associated" }, { status: 404 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const type = url.searchParams.get("type") || "all"
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 300)

  const results: any[] = []

  // 1. Price changes (manual edits from pricing grid)
  if (type === "all" || type === "changes") {
    let q = supabase
      .from("price_change_log")
      .select(`
        id, hotel_id, room_type_id, rate_id, occupancy,
        target_date, old_price, new_price, changed_by, changed_at, source
      `)
      .eq("hotel_id", hotelId)
      .order("changed_at", { ascending: false })
      .limit(limit)

    if (from) q = q.gte("changed_at", from)
    if (to) q = q.lte("changed_at", to)

    const { data } = await q

    // Get room type names for display
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)

    const roomTypeMap: Record<string, string> = {}
    for (const rt of roomTypes || []) roomTypeMap[rt.id] = rt.name

    // Get rate names
    const { data: rates } = await supabase
      .from("rates")
      .select("id, name")
      .eq("hotel_id", hotelId)

    const rateMap: Record<string, string> = {}
    for (const r of rates || []) rateMap[r.id] = r.name

    for (const row of data || []) {
      const rtName = roomTypeMap[row.room_type_id] || row.room_type_id
      const rateName = rateMap[row.rate_id] || ""
      results.push({
        id: row.id,
        type: "price_change",
        timestamp: row.changed_at,
        summary: `${rtName}${rateName ? ` (${rateName})` : ""} - ${row.target_date}: ${row.old_price != null ? `${Number(row.old_price).toFixed(0)}` : "nuovo"} -> ${Number(row.new_price).toFixed(0)}`,
        detail: {
          roomTypeName: rtName,
          rateName,
          targetDate: row.target_date,
          oldPrice: row.old_price != null ? Number(row.old_price) : null,
          newPrice: Number(row.new_price),
          occupancy: row.occupancy,
          source: row.source,
        },
      })
    }
  }

  // 2. Push events (autopilot + manual pushes to PMS)
  if (type === "all" || type === "pushes") {
    let q = supabase
      .from("autopilot_price_changes")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("triggered_at", { ascending: false })
      .limit(limit)

    if (from) q = q.gte("triggered_at", from)
    if (to) q = q.lte("triggered_at", to)

    const { data } = await q
    for (const row of data || []) {
      const changes = row.changes as any[]
      const changesCount = changes?.length || 0
      const pushResult = row.push_result as any

      results.push({
        id: `push-${row.id}`,
        type: "push",
        timestamp: row.triggered_at,
        summary: `Invio PMS [${row.mode}]: ${pushResult?.success ? "Completato" : "Errore"} - ${changesCount} prezzi via ${pushResult?.method || "N/A"}`,
        detail: {
          mode: row.mode,
          changesCount,
          pushSent: row.push_sent,
          pushResult,
          notificationSent: row.notification_sent,
          changes: changes?.slice(0, 20),
        },
      })
    }
  }

  // Sort by timestamp descending
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({
    logs: results.slice(0, limit),
    total: results.length,
    hotelId,
  })
}
