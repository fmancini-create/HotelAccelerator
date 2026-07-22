import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

/**
 * GET /api/admin/brig/sync-logs?hotelId=...&limit=20
 *
 * Restituisce le ultime righe di sync_logs per i sync_type BRiG
 * (reservations, room_types, rates). Usato dal BrigSyncPanel su
 * /settings/pms per mostrare ultime esecuzioni e storico errori.
 *
 * Implementazione: usa il service role come fa /api/scidoo/sync-logs
 * (sync_logs ha RLS che blocca le SELECT cross-hotel ai utenti non
 * super_admin; il client passa solo l'hotelId del proprio scope, quindi
 * il filtro WHERE hotel_id e' sufficiente).
 *
 * SELECT * (non colonne specifiche): la tabella ha schema variabile
 * tra istanze (alcune hanno trigger_type, altre no), il pannello legge
 * solo i campi che esistono.
 */
export async function GET(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId") || searchParams.get("hotel_id")
  const limit = Math.min(Number(searchParams.get("limit") || 20), 100)

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId is required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from("sync_logs")
    .select("*")
    .eq("hotel_id", hotelId)
    .in("sync_type", ["reservations", "room_types", "rates", "bookings"])
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[brig/sync-logs] error:", error)
    return NextResponse.json({ logs: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data || [] })
}
