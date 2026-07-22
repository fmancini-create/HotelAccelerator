import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { pushPricesToPMS } from "@/lib/pricing/push-prices"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"

export const maxDuration = 300

/**
 * GET /api/superadmin/push-prices-range?hotelId=xxx&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Returns a stato comparativo: quanti prezzi ci sono in pricing_grid per il range
 * vs quanti sono stati gia' inviati (last_sent_prices). Utile per capire se serve
 * lanciare il push o se e' tutto allineato.
 */
export async function GET(request: NextRequest) {
  // Auth check: superadmin only
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 })
  }

  const hotelId = request.nextUrl.searchParams.get("hotelId")
  const dateFrom = request.nextUrl.searchParams.get("dateFrom")
  const dateTo = request.nextUrl.searchParams.get("dateTo")

  if (!hotelId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "hotelId, dateFrom, dateTo required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Counts: pricing_grid (>0) vs last_sent_prices nel range
  const { count: gridCount } = await supabase
    .from("pricing_grid")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .gt("price", 0)

  const { count: sentCount } = await supabase
    .from("last_sent_prices")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .gte("target_date", dateFrom)
    .lte("target_date", dateTo)

  // Last push timestamp dall'autopilot_configs
  const { data: cfg } = await supabase
    .from("autopilot_configs")
    .select("mode, last_push_at, last_full_sync_at")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  // Hotel name + integration mode for display
  const { data: hotel } = await supabase.from("hotels").select("name").eq("id", hotelId).single()
  const { data: pms } = await supabase
    .from("pms_integrations")
    .select("pms_name, integration_mode, is_active")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .maybeSingle()

  return NextResponse.json({
    hotelName: hotel?.name || null,
    pms: pms || null,
    config: cfg || null,
    gridCount: gridCount || 0,
    sentCount: sentCount || 0,
    diff: (gridCount || 0) - (sentCount || 0),
  })
}

/**
 * POST /api/superadmin/push-prices-range
 *
 * Body: { hotelId, dateFrom, dateTo }
 *
 * Per Massabo' / qualsiasi hotel in Autopilot: forza l'invio al PMS di TUTTI i prezzi
 * presenti in pricing_grid per il range selezionato. Bypassa la dedup di
 * last_sent_prices: serve per casi in cui il push e' fallito parzialmente
 * o per recovery dopo un cambio configurazione.
 *
 * Esegue lo stesso flusso di /api/autopilot/sync (force=true) ma con date range
 * configurabili invece dei 15 mesi fissi.
 */
export async function POST(request: NextRequest) {
  // Auth check
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 })
  }

  let body: { hotelId?: string; dateFrom?: string; dateTo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { hotelId, dateFrom, dateTo } = body
  if (!hotelId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "hotelId, dateFrom, dateTo required" }, { status: 400 })
  }

  // Date validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "dateFrom and dateTo must be YYYY-MM-DD" }, { status: 400 })
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "dateFrom must be <= dateTo" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Get PMS integration
  const { data: pms } = await supabase
    .from("pms_integrations")
    .select("integration_mode, pms_name, api_key, endpoint_url, property_id, config, gsheet_spreadsheet_id")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .maybeSingle()

  if (!pms) {
    return NextResponse.json({ error: "Nessuna integrazione PMS attiva per questo hotel" }, { status: 404 })
  }

  // Get pricing_grid for range — paginate to avoid 1000-row default cap
  const PAGE = 1000
  const allPrices: { room_type_id: string; rate_id: string; occupancy: number; date: string; price: number }[] = []
  let from = 0
  while (true) {
    const { data: page, error } = await supabase
      .from("pricing_grid")
      .select("room_type_id, rate_id, occupancy, date, price")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .gt("price", 0)
      .range(from, from + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: `Errore lettura pricing_grid: ${error.message}` }, { status: 500 })
    }
    if (!page || page.length === 0) break
    allPrices.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }

  if (allPrices.length === 0) {
    return NextResponse.json({
      success: false,
      message: `Nessun prezzo in pricing_grid per il range ${dateFrom} -> ${dateTo}`,
      gridCount: 0,
    })
  }

  // Get room types and rates for mapping
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select(
      "id, code, name, scidoo_room_type_id, brig_room_code, slope_lodging_type_id, min_occupancy, max_occupancy",
    )
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  const { data: rates } = await supabase
    .from("rates")
    .select("id, name, scidoo_rate_id, brig_rate_code, slope_rate_plan_id, parent_rate_id")
    .eq("hotel_id", hotelId)

  const rtMap = new Map((roomTypes || []).map((r) => [r.id, r]))

  // Build PriceChange[] from pricing_grid rows
  const priceChanges: PriceChange[] = allPrices.map((p) => ({
    roomTypeId: p.room_type_id,
    roomTypeName: rtMap.get(p.room_type_id)?.name || "N/D",
    rateId: p.rate_id,
    occupancy: p.occupancy,
    date: p.date,
    currentPrice: null,
    suggestedPrice: p.price,
  }))

  console.log(`[v0] [superadmin/push-prices-range] Pushing ${priceChanges.length} prices for hotel ${hotelId} range ${dateFrom} -> ${dateTo}`)

  // Push in chunks to keep payloads small. push-prices.ts batchera' a 50 internamente.
  const pushResult = await pushPricesToPMS(pms, priceChanges, roomTypes || [], rates || [])

  console.log(`[v0] [superadmin/push-prices-range] Result: success=${pushResult.success}, records=${pushResult.cellsOrRecords}, errors=${pushResult.errors.length}`)

  // On success update last_sent_prices snapshot so future incremental sync stays aligned
  if (pushResult.success) {
    const upserts = allPrices.map((p) => ({
      hotel_id: hotelId,
      room_type_id: p.room_type_id,
      rate_id: p.rate_id,
      occupancy: p.occupancy,
      target_date: p.date,
      last_price: p.price,
      sent_at: new Date().toISOString(),
      source: "superadmin_push_range",
    }))
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200)
      const { error: lspError } = await supabase
        .from("last_sent_prices")
        .upsert(batch, { onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date" })
      if (lspError) {
        console.error(`[superadmin/push-prices-range] Error upserting last_sent_prices: ${lspError.message}`)
      }
    }

    // Stamp last_push_at on autopilot_configs
    await supabase
      .from("autopilot_configs")
      .update({ last_push_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
  }

  // Log every change in price_change_log
  const logs = allPrices
    .filter((p) => p.rate_id)
    .map((p) => ({
      hotel_id: hotelId,
      room_type_id: p.room_type_id,
      rate_id: p.rate_id,
      occupancy: p.occupancy,
      target_date: p.date,
      old_price: null,
      new_price: p.price,
      source: pushResult.success ? "superadmin_push_range" : "superadmin_push_range_failed",
      action_taken: pushResult.success ? "pms" : "none",
    }))
  if (logs.length > 0) {
    for (let i = 0; i < logs.length; i += 100) {
      const batch = logs.slice(i, i + 100)
      const { error } = await supabase.from("price_change_log").insert(batch)
      if (error) console.error(`[superadmin/push-prices-range] Error logging: ${error.message}`)
    }
  }

  return NextResponse.json({
    success: pushResult.success,
    method: pushResult.method,
    pushed: pushResult.cellsOrRecords,
    totalInGrid: allPrices.length,
    errors: pushResult.errors,
    range: { from: dateFrom, to: dateTo },
  })
}
