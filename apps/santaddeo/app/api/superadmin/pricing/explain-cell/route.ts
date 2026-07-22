import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { calculatePriceWithDiagnostics } from "@/lib/pricing/calculate-with-diagnostics"
import type { PricingContext } from "@/lib/pricing/calculate-suggested-price"

export const maxDuration = 60

/**
 * Endpoint admin/superadmin DIAGNOSTICO.
 *
 * Risponde alla domanda: "perche' questa cella ha quel prezzo?"
 *
 * Input (POST JSON):
 *   {
 *     hotelId: string
 *     roomTypeId: string
 *     rateId: string
 *     occupancy: number
 *     date: string (YYYY-MM-DD)
 *   }
 *
 * Output: breakdown completo del calcolo step-by-step + valore in pricing_grid
 * + ultima entry price_change_log per la cella.
 *
 * REGOLA ARCHITETTURALE: questo endpoint NON modifica nulla. Solo READ.
 * Non triggera autopilot, non aggiorna pricing_grid, non chiama PMS.
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sb = await createServiceRoleClient()
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { hotelId, roomTypeId, rateId, occupancy, date } = body
    if (!hotelId || !roomTypeId || !rateId || !occupancy || !date) {
      return NextResponse.json(
        { error: "Missing required: hotelId, roomTypeId, rateId, occupancy, date" },
        { status: 400 }
      )
    }

    // Carica tutto il PricingContext per l'hotel (mirror di recalculate-queued-prices)
    const ctx = await loadPricingContext(sb, hotelId, date)
    if (!ctx) {
      return NextResponse.json({ error: "Could not load pricing context" }, { status: 500 })
    }

    // Calcola con diagnostics
    const breakdown = calculatePriceWithDiagnostics(ctx, roomTypeId, date, occupancy, rateId)
    breakdown.hotel_id = hotelId

    // Leggi valore corrente in pricing_grid
    const { data: gridRow } = await sb
      .from("pricing_grid")
      .select("price, is_manual, last_change_source, updated_at")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", occupancy)
      .eq("date", date)
      .maybeSingle()

    // Leggi ultima entry price_change_log
    const { data: lastLog } = await sb
      .from("price_change_log")
      .select("old_price, new_price, action_taken, source, changed_at, changed_by")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", occupancy)
      .eq("target_date", date)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Leggi ultimo prezzo pushato a PMS
    const { data: lastSent } = await sb
      .from("last_sent_prices")
      .select("last_price, last_sent_at")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", occupancy)
      .eq("target_date", date)
      .maybeSingle()

    // Confronto consistency: pricing_grid vs final_price calcolato live
    const gridPrice = gridRow?.price ?? null
    const calculated = breakdown.final_price_rounded
    const drift =
      gridPrice !== null && calculated !== null
        ? Math.abs(Number(gridPrice) - Number(calculated))
        : null

    return NextResponse.json({
      breakdown,
      pricing_grid: gridRow,
      last_price_change_log: lastLog,
      last_sent_to_pms: lastSent,
      consistency_check: {
        pricing_grid_price: gridPrice,
        calculated_live: calculated,
        drift_eur: drift,
        in_sync: drift !== null ? drift <= 0.5 : null,
        warning: drift !== null && drift > 0.5
          ? "DRIFT detected: pricing_grid differs from live calculation"
          : null,
      },
    })
  } catch (e) {
    console.error("[explain-cell] error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * Carica il PricingContext completo per un hotel.
 * Replica essenziale di recalculate-queued-prices.ts ma solo per la singola data.
 */
async function loadPricingContext(
  sb: Awaited<ReturnType<typeof createServiceRoleClient>>,
  hotelId: string,
  dateStr: string
): Promise<PricingContext | null> {
  const [
    roomTypesRes,
    ratesRes,
    bandGroupsRes,
    bandsRes,
    lastMinuteLevelsRes,
    hotelOccBandsRes,
    lastMinuteLevelDiscountsRes,
    algoParamsRes,
    rateLimitsRes,
    occupancyRes,
    settingsRes,
    pricingVarsRes,
    // FIX 12/05/2026 (Architettura Ufficiale): carichiamo algorithm_type per
    // applicare lo stesso gate UI/server al replay debugger.
    subscriptionRes,
    kIntensityRulesRes,
  ] = await Promise.all([
    sb.from("room_types").select("*").eq("hotel_id", hotelId).eq("is_active", true).order("sort_order"),
    sb.from("rates").select("*").eq("hotel_id", hotelId).eq("is_active", true),
    sb.from("band_groups").select("*").eq("hotel_id", hotelId).order("sort_order"),
    sb.from("occupancy_bands").select("*").eq("hotel_id", hotelId).order("band_index"),
    sb.from("last_minute_levels").select("*").eq("hotel_id", hotelId).order("sort_order"),
    sb.from("hotel_occupancy_bands").select("*").eq("hotel_id", hotelId).order("sort_order"),
    sb.from("last_minute_level_discounts").select("*").eq("hotel_id", hotelId),
    sb.from("algo_params").select("*").eq("hotel_id", hotelId).eq("date", dateStr),
    sb.from("rate_limits").select("*").eq("hotel_id", hotelId),
    sb.from("daily_availability").select("*").eq("hotel_id", hotelId).eq("date", dateStr),
    sb.from("hotel_pricing_settings").select("*").eq("hotel_id", hotelId).maybeSingle(),
    sb.from("pricing_variables").select("*").eq("hotel_id", hotelId).eq("is_active", true),
    sb.from("hotel_subscriptions").select("algorithm_type, is_active").eq("hotel_id", hotelId).eq("is_active", true).maybeSingle(),
    // INTENSIFICATORE K (30/06/2026): regole intensita' per coerenza del replay diagnostico.
    sb.from("hotel_k_intensity_rules").select("scope, date_from, date_to, increment_intensity, base_intensity, is_active").eq("hotel_id", hotelId).eq("is_active", true),
  ])
  const kIntensityRules = (kIntensityRulesRes?.data ?? []) as any[]

  const algorithmType: "basic" | "advanced" =
    subscriptionRes.data?.algorithm_type === "advanced" ? "advanced" : "basic"

  const roomTypes = (roomTypesRes.data ?? []) as any[]
  if (roomTypes.length === 0) return null

  // Build algoParams map
  const algoParams: Record<string, Record<string, string>> = {}
  for (const ap of algoParamsRes.data ?? []) {
    if (!algoParams[ap.param_key]) algoParams[ap.param_key] = {}
    algoParams[ap.param_key][ap.date] = ap.param_value
  }

  // Build occupancy data
  const occupancyData: Record<string, Record<string, { available: number; total: number }>> = {}
  for (const occ of occupancyRes.data ?? []) {
    if (!occupancyData[occ.room_type_id]) occupancyData[occ.room_type_id] = {}
    occupancyData[occ.room_type_id][occ.date] = {
      available: occ.available_rooms ?? 0,
      total: occ.total_rooms ?? 0,
    }
  }

  // Build bandGroups with nested bands
  const bandsByGroup: Record<string, any[]> = {}
  for (const b of bandsRes.data ?? []) {
    if (!bandsByGroup[b.group_id]) bandsByGroup[b.group_id] = []
    bandsByGroup[b.group_id].push(b)
  }
  const bandGroups = (bandGroupsRes.data ?? []).map((g: any) => ({
    ...g,
    bands: (bandsByGroup[g.id] ?? []).sort((a: any, b: any) => a.band_index - b.band_index),
  }))

  // Build lastMinuteLevels with shared_bands
  const hotelOccBands = hotelOccBandsRes.data ?? []
  const lmDiscounts = lastMinuteLevelDiscountsRes.data ?? []
  const lastMinuteLevels = (lastMinuteLevelsRes.data ?? []).map((level: any) => {
    const discountsForLevel = lmDiscounts.filter((d: any) => d.level_id === level.id)
    const shared_bands = hotelOccBands
      .map((band: any) => {
        const d = discountsForLevel.find((x: any) => x.band_id === band.id)
        return {
          band_id: band.id,
          min_rooms: band.min_rooms,
          max_rooms: band.max_rooms,
          sort_order: band.sort_order,
          discount_pct: d ? Number(d.discount_pct) : 0,
          discount_eur: d?.discount_eur ? Number(d.discount_eur) : null,
          discount_mode: d?.discount_mode || "pct",
        }
      })
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
    return { ...level, shared_bands }
  })

  const settings = settingsRes.data
  return {
    roomTypes,
    referenceRoomTypeIndex: settings?.reference_room_type_index ?? 0,
    referenceRateId: settings?.reference_rate_id ?? (ratesRes.data?.[0]?.id ?? ""),
    adjustmentUnit: settings?.adjustment_unit ?? "EUR",
    baseOccupancy: settings?.base_occupancy ?? 2,
    bandGroups,
    lastMinuteLevels,
    rateLimits: (rateLimitsRes.data ?? []) as any[],
    algoParams,
    occupancyData,
    occThresholdLow: settings?.occ_threshold_low ?? 0,
    occThresholdHigh: settings?.occ_threshold_high ?? 0,
    prevYearData: {},
    pricingVariables: (pricingVarsRes.data ?? []) as any[],
    algorithmType,
    kIntensityRules,
  }
}
