import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/pricing-log
 * Returns unified pricing activity log: price changes + autopilot events + push results
 * Query params: hotelId?, from?, to?, type? (all|changes|triggers|pushes), limit?
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Auth check - allow superadmin + admin with accelerator access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { createServiceRoleClient } = await import("@/lib/supabase/server")
  const adminClient = await createServiceRoleClient()

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  
  const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"
  const isAdmin = profile?.role === "admin" || profile?.role === "property_admin"
  
  if (!profile || (!isSuperAdmin && !isAdmin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const hotelId = url.searchParams.get("hotelId")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const type = url.searchParams.get("type") || "all"
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500)

  const results: any[] = []

  // For admin (non-superadmin), restrict to their hotel(s)
  // Hotels are linked via profiles.organization_id -> hotels.organization_id
  let adminHotelIds: string[] | null = null
  if (isAdmin && !isSuperAdmin) {
    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()
    
    if (userProfile?.organization_id) {
      const { data: orgHotels } = await adminClient
        .from("hotels")
        .select("id")
        .eq("organization_id", userProfile.organization_id)
      adminHotelIds = orgHotels?.map(h => h.id) || []
    }
    
    if (!adminHotelIds || adminHotelIds.length === 0) {
      return NextResponse.json({ logs: [], total: 0, hotelMap: {} })
    }
  }

  // Use adminClient (service role) for all data queries to bypass RLS
  // 1. Price change log (manual edits from pricing grid)
  if (type === "all" || type === "changes") {
    let q = adminClient
      .from("price_change_log")
      .select(`
        id, hotel_id, room_type_id, rate_id, occupancy,
        target_date, old_price, new_price, changed_by, changed_at, source
      `)
      .order("changed_at", { ascending: false })
      .limit(limit)

    if (hotelId) q = q.eq("hotel_id", hotelId)
    else if (adminHotelIds) q = q.in("hotel_id", adminHotelIds)
    if (from) q = q.gte("changed_at", from)
    if (to) q = q.lte("changed_at", to)

    const { data } = await q
    for (const row of data || []) {
      results.push({
        id: row.id,
        type: "price_change",
        hotelId: row.hotel_id,
        timestamp: row.changed_at,
        summary: `Prezzo cambiato: ${row.old_price} -> ${row.new_price} per ${row.target_date}`,
        detail: {
          roomTypeId: row.room_type_id,
          rateId: row.rate_id,
          targetDate: row.target_date,
          oldPrice: Number(row.old_price),
          newPrice: Number(row.new_price),
          occupancy: row.occupancy,
          source: row.source,
          changedBy: row.changed_by,
        },
      })
    }
  }

  // 2. Autopilot triggers (notify / autopilot / manual push events)
  if (type === "all" || type === "triggers" || type === "pushes") {
    let q = adminClient
      .from("autopilot_price_changes")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(limit)

    if (hotelId) q = q.eq("hotel_id", hotelId)
    else if (adminHotelIds) q = q.in("hotel_id", adminHotelIds)
    if (from) q = q.gte("triggered_at", from)
    if (to) q = q.lte("triggered_at", to)

    const { data } = await q
    for (const row of data || []) {
      let changes = row.changes as any[]
      const changesCount = changes?.length || 0
      const uniqueRoomTypes = new Set(changes?.map((c: any) => c.roomTypeName) || [])

      // Enrich changes that have null/0 currentPrice by looking up price_change_log
      const needsEnrichment = changes?.some((c: any) => !c.currentPrice)
      if (needsEnrichment && changes) {
        // Get the most recent price for each room_type/rate/occ/date BEFORE the trigger time
        const enrichedChanges = await Promise.all(
          changes.slice(0, 10).map(async (c: any) => {
            if (c.currentPrice) return c
            // Look up the most recent price from price_change_log
            const { data: pcl } = await adminClient
              .from("price_change_log")
              .select("new_price")
              .eq("hotel_id", row.hotel_id)
              .eq("room_type_id", c.roomTypeId)
              .eq("occupancy", c.occupancy || 2)
              .eq("target_date", c.date)
              .lte("changed_at", row.triggered_at)
              .order("changed_at", { ascending: false })
              .limit(1)
              .maybeSingle()
            
            if (pcl?.new_price != null) {
              return { ...c, currentPrice: Number(pcl.new_price) }
            }
            // Try pricing_grid as last resort
            const { data: pg } = await adminClient
              .from("pricing_grid")
              .select("price")
              .eq("hotel_id", row.hotel_id)
              .eq("room_type_id", c.roomTypeId)
              .eq("occupancy", c.occupancy || 2)
              .eq("date", c.date)
              .limit(1)
              .maybeSingle()
            
            if (pg?.price != null) {
              return { ...c, currentPrice: Number(pg.price) }
            }
            return c
          })
        )
        changes = [...enrichedChanges, ...changes.slice(10)]
      }

      // Trigger event
      if (type === "all" || type === "triggers") {
        results.push({
          id: `trigger-${row.id}`,
          type: "autopilot_trigger",
          hotelId: row.hotel_id,
          timestamp: row.triggered_at,
          summary: `Autopilot [${row.mode}]: ${changesCount} variazioni rilevate (${[...uniqueRoomTypes].join(", ")})`,
          detail: {
            mode: row.mode,
            changesCount,
            roomTypes: [...uniqueRoomTypes],
            notificationSent: row.notification_sent,
            changes: changes?.slice(0, 10), // First 10 for preview
            changesHash: row.changes_hash,
          },
        })
      }

      // Push event (if push was attempted)
      if ((type === "all" || type === "pushes") && row.push_sent) {
        const pushResult = row.push_result as any
        results.push({
          id: `push-${row.id}`,
          type: "push_result",
          hotelId: row.hotel_id,
          timestamp: row.triggered_at,
          summary: `Push PMS [${pushResult?.method || "?"}]: ${pushResult?.success ? "OK" : "ERRORE"} - ${pushResult?.cellsOrRecords || 0} record`,
          detail: {
            mode: row.mode,
            pushResult,
            changesCount,
          },
        })
      }
    }
  }

  // Sort all results by timestamp descending
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Build hotel dropdown - for property_admin, show only their hotels
  const hotelMap: Record<string, string> = {}
  if (adminHotelIds) {
    // Admin: only show their organization's hotels
    const { data: adminHotels } = await adminClient
      .from("hotels")
      .select("id, name")
      .in("id", adminHotelIds)
    for (const h of adminHotels || []) hotelMap[h.id] = h.name
  } else {
    // Superadmin: show all hotels with accelerator subscription
    const { data: allSubHotels } = await adminClient
      .from("accelerator_subscriptions")
      .select("hotel_id, hotels!inner(id, name)")
      .eq("is_active", true)
    for (const sub of allSubHotels || []) {
      const hotel = sub.hotels as any
      if (hotel?.id && hotel?.name) hotelMap[hotel.id] = hotel.name
    }
    // Also include hotels from log entries that may not have active subscriptions
    const logHotelIds = [...new Set(results.map(r => r.hotelId))].filter(id => !hotelMap[id])
    if (logHotelIds.length > 0) {
      const { data: extraHotels } = await adminClient
        .from("hotels")
        .select("id, name")
        .in("id", logHotelIds)
      for (const h of extraHotels || []) hotelMap[h.id] = h.name
    }
  }

  return NextResponse.json({
    logs: results.slice(0, limit).map(r => ({
      ...r,
      hotelName: hotelMap[r.hotelId] || "Hotel sconosciuto",
    })),
    total: results.length,
    hotelMap,
  })
}
