import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/superadmin/cleanup-pricing-grid-occ
 *
 * Rimuove da `pricing_grid` e `last_sent_prices` le righe con `occupancy`
 * fuori dal range della camera (`occupancy < min_occupancy` OR
 * `occupancy > max_occupancy`).
 *
 * Caso d'uso:
 *   - Una camera viene ridefinita nel PMS con un range piu' stretto (es.
 *     STANDARD da 1-6 a 1-2). Il sync aggiorna `room_types.min/max_occupancy`,
 *     ma le righe pricing_grid pre-esistenti per occ 3-6 restano e producono
 *     warning "skippati N prezzi per occupanza X (range camera Y-Z)" ad
 *     ogni push range.
 *   - Cleanup forensico dopo migrazioni / cleanup di tariffe duplicate.
 *
 * Idempotente: se eseguito due volte di seguito, la seconda elimina 0 righe.
 * Non tocca `price_change_log` (storico audit) ne' `bookings`.
 *
 * Body opzionale:
 *   - hotelId?: string — limita il cleanup a un singolo hotel.
 *   - dryRun?: boolean — true = ritorna solo i conteggi, non cancella.
 *
 * Solo super_admin.
 */
export async function POST(request: NextRequest) {
  // Auth: super_admin only — stesso pattern di backfill-rate-fields,
  // connectors-health/diagnose, force-etl. getAuthUserOrDev gestisce
  // correttamente i casi sandbox/dev senza cookies propagati.
  const { user, supabase: authClient } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: { hotelId?: string; dryRun?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const filterHotelId = body.hotelId || null
  const dryRun = body.dryRun === true

  const supabase = createServiceRoleClient()

  // Carico tutte le room_types target (filtrate per hotel se richiesto) con
  // il loro range. PostgREST non supporta JOIN nei DELETE, quindi facciamo
  // il match in JS: per ogni room_type cancelliamo le righe con occ fuori
  // range.
  let roomQuery = supabase
    .from("room_types")
    .select("id, name, hotel_id, min_occupancy, max_occupancy")
  if (filterHotelId) {
    roomQuery = roomQuery.eq("hotel_id", filterHotelId)
  }
  const { data: roomTypes, error: roomErr } = await roomQuery
  if (roomErr) {
    return NextResponse.json(
      { error: "Errore caricamento room_types", details: roomErr.message },
      { status: 500 },
    )
  }

  // Aggrego per hotel per il report finale.
  const reportByHotel = new Map<
    string,
    {
      hotel_id: string
      pricing_grid_deleted: number
      last_sent_prices_deleted: number
      room_types_processed: number
      details: Array<{ room_type: string; min: number; max: number; rows_grid: number; rows_sent: number }>
    }
  >()

  for (const rt of roomTypes ?? []) {
    if (rt.min_occupancy == null || rt.max_occupancy == null) continue

    const ensureBucket = (hid: string) => {
      let b = reportByHotel.get(hid)
      if (!b) {
        b = {
          hotel_id: hid,
          pricing_grid_deleted: 0,
          last_sent_prices_deleted: 0,
          room_types_processed: 0,
          details: [],
        }
        reportByHotel.set(hid, b)
      }
      return b
    }

    // Conto le righe target su pricing_grid prima di eliminare.
    const { count: gridCount } = await supabase
      .from("pricing_grid")
      .select("*", { count: "exact", head: true })
      .eq("room_type_id", rt.id)
      .or(`occupancy.lt.${rt.min_occupancy},occupancy.gt.${rt.max_occupancy}`)

    const { count: sentCount } = await supabase
      .from("last_sent_prices")
      .select("*", { count: "exact", head: true })
      .eq("room_type_id", rt.id)
      .or(`occupancy.lt.${rt.min_occupancy},occupancy.gt.${rt.max_occupancy}`)

    const rowsGrid = gridCount ?? 0
    const rowsSent = sentCount ?? 0

    if (!dryRun && rowsGrid > 0) {
      const { error: delGridErr } = await supabase
        .from("pricing_grid")
        .delete()
        .eq("room_type_id", rt.id)
        .or(`occupancy.lt.${rt.min_occupancy},occupancy.gt.${rt.max_occupancy}`)
      if (delGridErr) {
        console.error("[cleanup-pricing-grid-occ] delete pricing_grid err:", delGridErr.message)
      }
    }
    if (!dryRun && rowsSent > 0) {
      const { error: delSentErr } = await supabase
        .from("last_sent_prices")
        .delete()
        .eq("room_type_id", rt.id)
        .or(`occupancy.lt.${rt.min_occupancy},occupancy.gt.${rt.max_occupancy}`)
      if (delSentErr) {
        console.error("[cleanup-pricing-grid-occ] delete last_sent_prices err:", delSentErr.message)
      }
    }

    const bucket = ensureBucket(rt.hotel_id)
    bucket.room_types_processed += 1
    bucket.pricing_grid_deleted += rowsGrid
    bucket.last_sent_prices_deleted += rowsSent
    if (rowsGrid > 0 || rowsSent > 0) {
      bucket.details.push({
        room_type: rt.name,
        min: rt.min_occupancy,
        max: rt.max_occupancy,
        rows_grid: rowsGrid,
        rows_sent: rowsSent,
      })
    }
  }

  const hotels = Array.from(reportByHotel.values())
  const totals = hotels.reduce(
    (acc, h) => ({
      pricing_grid_deleted: acc.pricing_grid_deleted + h.pricing_grid_deleted,
      last_sent_prices_deleted: acc.last_sent_prices_deleted + h.last_sent_prices_deleted,
    }),
    { pricing_grid_deleted: 0, last_sent_prices_deleted: 0 },
  )

  return NextResponse.json({
    success: true,
    dryRun,
    totals,
    hotels: hotels.filter((h) => h.pricing_grid_deleted > 0 || h.last_sent_prices_deleted > 0),
  })
}
