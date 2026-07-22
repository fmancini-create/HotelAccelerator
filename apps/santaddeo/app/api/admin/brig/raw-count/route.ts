// GET /api/admin/brig/raw-count?hotelId=...
//
// Diagnostica: ritorna i conteggi delle 3 tabelle BRiG end-to-end per
// capire dove si ferma la pipeline:
//   1. connectors.brig_raw_bookings (totale, processed=true, processed=false)
//   2. public.bookings filtrate per source='brig'
//   3. ultimo sync_log con sync_type='reservations'
//
// Aggiunto 20/05/2026: in dashboard /superadmin/connectors-health Cavallino
// appare con RAW=0 RMS=0 dopo che il sync dichiara "scaricati N record".
// Senza questo endpoint era un mistero capire se i raw c'erano davvero o no.

import { NextResponse, type NextRequest } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const hotelId = url.searchParams.get("hotelId") || url.searchParams.get("hotel_id")
  if (!hotelId) {
    return NextResponse.json({ error: "missing_hotel_id" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Schema "connectors" potrebbe non essere esposto in dev.
  let rawTotal = 0
  let rawProcessed = 0
  let rawUnprocessed = 0
  let lastRawSyncedAt: string | null = null
  let rawError: string | null = null

  try {
    const { count: total, error: e1 } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
    if (e1) throw e1
    rawTotal = total ?? 0

    const { count: proc } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("processed", true)
    rawProcessed = proc ?? 0
    rawUnprocessed = rawTotal - rawProcessed

    const { data: last } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .select("synced_at")
      .eq("hotel_id", hotelId)
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    lastRawSyncedAt = last?.synced_at ?? null
  } catch (e) {
    rawError = e instanceof Error ? e.message : String(e)
  }

  // Bookings normalizzate
  const { count: bookingsTotal } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("source", "brig")

  const { count: bookingsActive } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("source", "brig")
    .eq("is_cancelled", false)

  // Ultimo sync log
  const { data: lastLog } = await supabase
    .from("sync_logs")
    .select("status, started_at, completed_at, records_inserted, records_updated, records_failed, error_message")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "brig")
    .eq("sync_type", "reservations")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    hotelId,
    raw: {
      total: rawTotal,
      processed: rawProcessed,
      unprocessed: rawUnprocessed,
      lastSyncedAt: lastRawSyncedAt,
      error: rawError,
    },
    bookings: {
      total: bookingsTotal ?? 0,
      active: bookingsActive ?? 0,
    },
    lastSyncLog: lastLog,
    diagnosis: diagnose({
      rawTotal,
      rawUnprocessed,
      bookingsTotal: bookingsTotal ?? 0,
      lastLog,
    }),
  })
}

function diagnose(s: {
  rawTotal: number
  rawUnprocessed: number
  bookingsTotal: number
  lastLog: { status?: string | null; error_message?: string | null } | null
}): string {
  if (s.rawTotal === 0 && !s.lastLog) {
    return "Nessun sync mai eseguito o nessun raw scritto. Lancia il sync prenotazioni dal pannello /settings/pms."
  }
  if (s.rawTotal === 0 && s.lastLog?.status === "error") {
    return `Sync eseguito ma fallito: ${s.lastLog.error_message ?? "(nessun messaggio)"}`
  }
  if (s.rawTotal === 0 && s.lastLog?.status === "success") {
    return "Sync ha riportato successo ma 0 raw scritti. BRiG ritorna risposta vuota: verifica structureId e date filter."
  }
  if (s.rawTotal > 0 && s.bookingsTotal === 0) {
    return `${s.rawTotal} raw presenti ma 0 bookings normalizzate: ETL mai eseguito. Lancia POST /api/admin/brig/etl o re-sync (ora include ETL automatico).`
  }
  if (s.rawUnprocessed > 0) {
    return `${s.rawUnprocessed} raw in attesa di ETL. Lancia POST /api/admin/brig/etl.`
  }
  return `OK: ${s.rawTotal} raw, ${s.bookingsTotal} bookings normalizzate.`
}
