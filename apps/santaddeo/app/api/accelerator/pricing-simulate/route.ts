/**
 * POST /api/accelerator/pricing-simulate
 *
 * Endpoint server-side per il SIMULATORE pricing.
 *
 * Obiettivo: il simulatore deve restituire ESATTAMENTE i prezzi che la
 * produzione (cron + autopilot) calcolerebbe per quel hotel/data/parametri.
 * Niente reimplementazioni client-side semplificate. Importa il motore vero
 * `calculateSuggestedPrice` da `lib/pricing/calculate-suggested-price.ts` e
 * usa il context loader condiviso `loadPricingContext` per costruire tutti
 * gli input nello stesso identico modo di `recalculate-queued-prices.ts`.
 *
 * Body JSON:
 * {
 *   hotel_id: string                                  // obbligatorio
 *   month_start: "yyyy-MM-dd"                         // obbligatorio
 *   month_end:   "yyyy-MM-dd"                         // obbligatorio
 *   targets?: Array<{                                 // facoltativo - se omesso usa tutte le coppie (date×room×occ×rate)
 *     date: string,
 *     room_type_id: string,
 *     occupancy: number,
 *     rate_id?: string
 *   }>
 *   overrides?: {                                     // override per simulazione "what-if"
 *     algoParams?: Record<paramKey, Record<dateStr, string>>,
 *     occupancyData?: Record<dateStr, Record<roomTypeId, { capacity, available, occupied }>>,
 *     forOccupancyHotelPct?: number                   // forza occupazione hotel-level (per curva chart)
 *   }
 * }
 *
 * Response:
 * {
 *   results: Array<{ date, room_type_id, occupancy, rate_id, suggested_price }>,
 *   context_meta: { algorithm_type, k_vars_active, weight_overrides_loaded, room_types, rates }
 * }
 */

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { calculateSuggestedPrice } from "@/lib/pricing/calculate-suggested-price"
import { loadPricingContext } from "@/lib/pricing/load-pricing-context"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type Target = {
  date: string
  room_type_id: string
  occupancy: number
  rate_id?: string
}

type Override = {
  algoParams?: Record<string, Record<string, string>>
  // OccupancyEntry shape (vedi lib/pricing/calculate-suggested-price.ts): { available, total }
  occupancyData?: Record<string, Record<string, { available: number; total: number }>>
  forOccupancyHotelPct?: number
}

export async function POST(req: Request) {
  try {
    // ---- 1. Auth (rispetta dev-auth bypass su localhost) ----
    const { user } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const hotelId: string | undefined = body.hotel_id
    const monthStart: string | undefined = body.month_start
    const monthEnd: string | undefined = body.month_end
    const targets: Target[] | undefined = Array.isArray(body.targets) ? body.targets : undefined
    const overrides: Override = (body.overrides && typeof body.overrides === "object") ? body.overrides : {}

    if (!hotelId || !monthStart || !monthEnd) {
      return NextResponse.json(
        { error: "missing_required_params", details: "hotel_id, month_start, month_end" },
        { status: 400 },
      )
    }

    // ---- 2. Hotel access validation ----
    // Schema reale (vedi app/api/auth/me/route.ts): tabella `profiles`,
    // colonne (role, organization_id, first_name, last_name, email).
    // Per dev-auth bypass su localhost, super_admin e' garantito; saltiamo i check.
    const admin = await createServiceRoleClient()
    const { data: profileRow } = await admin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .maybeSingle()

    const role = profileRow?.role || ""
    const isSuperadmin = role === "super_admin"
    const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]

    if (!isSuperadmin && !allowedRoles.includes(role)) {
      return NextResponse.json({ error: "forbidden_role", role }, { status: 403 })
    }

    if (!isSuperadmin) {
      // Per non-super_admin, hotel access deve essere esplicito.
      // Hotel ha organization_id; controlliamo che l'utente abbia accesso via
      // user_hotel_access oppure tramite la sua organization.
      const { data: access } = await admin
        .from("user_hotel_access")
        .select("hotel_id")
        .eq("user_id", user.id)
        .eq("hotel_id", hotelId)
        .maybeSingle()
      if (!access) {
        // fallback: stesso organization_id
        const { data: hotelRow } = await admin
          .from("hotels")
          .select("organization_id")
          .eq("id", hotelId)
          .maybeSingle()
        const sameOrg = hotelRow?.organization_id && hotelRow.organization_id === profileRow?.organization_id
        if (!sameOrg) {
          return NextResponse.json({ error: "forbidden_hotel" }, { status: 403 })
        }
      }
    }

    // ---- 3. Carica context (motore vero + dati identici a recalculate-queued-prices) ----
    const loaded = await loadPricingContext(admin, hotelId, monthStart, monthEnd)
    const baseCtx = loaded.ctx

    // ---- 4. Applica overrides al context ----
    // Shallow-merge: override per data/param, fallback al reale.
    const effectiveAlgoParams: typeof baseCtx.algoParams = { ...baseCtx.algoParams }
    if (overrides.algoParams) {
      for (const [paramKey, dateMap] of Object.entries(overrides.algoParams)) {
        effectiveAlgoParams[paramKey] = {
          ...(effectiveAlgoParams[paramKey] ?? {}),
          ...dateMap,
        }
      }
    }

    // occupancyData: SHAPE CORRETTA: occupancyData[room_type_id][date] = {available, total}
    // (NON [date][room_type_id] come si potrebbe pensare - vedi load-pricing-context.ts riga 170)
    // Deep clone per non mutare baseCtx (riferimenti annidati condivisi).
    const effectiveOccupancyData: typeof baseCtx.occupancyData = {}
    for (const [rtId, dateMap] of Object.entries(baseCtx.occupancyData)) {
      effectiveOccupancyData[rtId] = { ...dateMap }
    }
    if (overrides.occupancyData) {
      // L'API accetta override nella shape "utente-friendly" [date][rtId]
      // ma scriviamo nella shape corretta [rtId][date].
      for (const [dateStr, perRoom] of Object.entries(overrides.occupancyData)) {
        for (const [rtId, entry] of Object.entries(perRoom)) {
          if (!effectiveOccupancyData[rtId]) effectiveOccupancyData[rtId] = {}
          effectiveOccupancyData[rtId][dateStr] = entry
        }
      }
    }

    // forOccupancyHotelPct: forza occupazione hotel-level su tutte le date del range
    // Distribuisce proporzionalmente sulle room_types (priorita': camere standard prima)
    if (typeof overrides.forOccupancyHotelPct === "number" && Number.isFinite(overrides.forOccupancyHotelPct)) {
      const pct = Math.max(0, Math.min(100, overrides.forOccupancyHotelPct))
      // Date range
      const dates: string[] = []
      const start = new Date(monthStart)
      const end = new Date(monthEnd)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10))
      }
      for (const dateStr of dates) {
        for (const rt of loaded.roomTypes) {
          const cap = Number(rt.total_rooms || 0)
          if (cap <= 0) continue
          const occupied = Math.round(cap * (pct / 100))
          const available = Math.max(0, cap - occupied)
          if (!effectiveOccupancyData[rt.id]) effectiveOccupancyData[rt.id] = {}
          effectiveOccupancyData[rt.id][dateStr] = { available, total: cap }
        }
      }
    }

    // Costruisce il context effettivo (shallow copy con override applicati)
    const effectiveCtx: typeof baseCtx = {
      ...baseCtx,
      algoParams: effectiveAlgoParams,
      occupancyData: effectiveOccupancyData,
    }

    // ---- 5. Costruisce lista target ----
    let actualTargets: Target[] = []
    if (targets && targets.length > 0) {
      actualTargets = targets
    } else {
      const dates: string[] = []
      const start = new Date(monthStart)
      const end = new Date(monthEnd)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10))
      }
      for (const date of dates) {
        for (const rt of loaded.roomTypes) {
          const maxOcc = rt.capacity_default || rt.capacity || 2
          for (const rate of loaded.rates) {
            for (let occ = 1; occ <= maxOcc; occ++) {
              actualTargets.push({
                date,
                room_type_id: rt.id,
                occupancy: occ,
                rate_id: rate.id,
              })
            }
          }
        }
      }
      if (actualTargets.length > 3000) {
        return NextResponse.json(
          {
            error: "too_many_targets",
            details: `Generated ${actualTargets.length} cells. Pass explicit targets[] to filter.`,
          },
          { status: 400 },
        )
      }
    }

    // ---- 6. Calcola per ogni target col motore VERO ----
    const results: Array<Record<string, unknown>> = []
    for (const t of actualTargets) {
      try {
        const price = calculateSuggestedPrice(
          effectiveCtx,
          t.room_type_id,
          t.date,
          t.occupancy,
          t.rate_id,
        )
        results.push({
          date: t.date,
          room_type_id: t.room_type_id,
          occupancy: t.occupancy,
          rate_id: t.rate_id ?? null,
          suggested_price: price,
        })
      } catch (e) {
        results.push({
          date: t.date,
          room_type_id: t.room_type_id,
          occupancy: t.occupancy,
          rate_id: t.rate_id ?? null,
          suggested_price: null,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return NextResponse.json({
      results,
      context_meta: {
        algorithm_type: loaded.algorithmType,
        k_vars_active: loaded.diagnostics.pricingVariablesCount,
        weight_overrides_loaded: loaded.diagnostics.weightOverridesLoaded,
        room_types: loaded.roomTypes.length,
        rates: loaded.rates.length,
        bands_total: loaded.diagnostics.bandsTotal,
        last_minute_levels: loaded.diagnostics.lastMinuteLevelsCount,
      },
      // Debug minimale - utile per troubleshooting senza appesantire payload.
      // Riporta occupazione hotel-level vista dal motore per la prima data del range.
      _debug: {
        first_date: monthStart,
        hotel_occ_seen_by_engine: (() => {
          let totalSold = 0, totalCap = 0
          for (const rt of loaded.roomTypes) {
            const d = effectiveOccupancyData[rt.id]?.[monthStart]
            if (d && d.total > 0) {
              totalSold += d.total - d.available
              totalCap += d.total
            }
          }
          return { totalSold, totalCap, pct: totalCap > 0 ? Math.round(totalSold/totalCap*100) : null }
        })(),
      },
    })
  } catch (e) {
    console.error("[pricing-simulate] fatal:", e)
    return NextResponse.json(
      { error: "internal_error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
