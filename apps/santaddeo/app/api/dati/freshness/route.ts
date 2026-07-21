/**
 * GET /api/dati/freshness?hotelId=...
 *
 * Ritorna eta' (in minuti) dell'ultimo sync per:
 *   - bookings
 *   - availability
 *   - pricing
 *   - rates
 *   - production
 *
 * Usato da:
 *  - dashboard tecnica /superadmin/freshness
 *  - debug "perche' availability vecchia?"
 *  - script di monitoring (alert se age > soglia)
 *
 * NON e' un endpoint sensibile: ritorna solo metadati osservazionali (timestamp e
 * minuti), nessun dato applicativo. Ma resta auth-protected per evitare scraping
 * cross-tenant.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDataFreshness } from "@/lib/sync/data-freshness"

const STALE_THRESHOLDS: Record<string, number> = {
  availability: 30, // minuti — oltre 30 min la pricing usa dati vecchi
  bookings: 60, // minuti — oltre 1h potrebbe esserci backlog
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    // Auth check: l'utente deve avere accesso a quell'hotel.
    const { data: membership } = await supabase
      .from("hotel_members")
      .select("hotel_id")
      .eq("hotel_id", hotelId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) {
      // Permettiamo a super_admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      if (profile?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const snapshot = await getDataFreshness(hotelId)

    // Aggiungiamo verdict stale per ogni type (utile per dashboard tecnica)
    const verdict: Record<string, "fresh" | "stale" | "unknown"> = {}
    for (const type of ["bookings", "availability", "pricing", "rates", "production"] as const) {
      const age = (snapshot as any)[`${type}_age_minutes`]
      const threshold = STALE_THRESHOLDS[type] ?? Number.MAX_SAFE_INTEGER
      if (age == null) verdict[type] = "unknown"
      else if (age > threshold) verdict[type] = "stale"
      else verdict[type] = "fresh"
    }

    return NextResponse.json({
      ...snapshot,
      verdict,
      thresholds: STALE_THRESHOLDS,
      checked_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
