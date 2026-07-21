import { createServiceRoleClient } from "@/lib/supabase/server"
import { isServiceUnavailableError, logSupabaseError } from "@/lib/supabase/error-utils"
import { NextRequest, NextResponse } from "next/server"
import { computeOnTheBooksByNight } from "@/lib/pace/compute"

// Cron giornaliero: fotografa l'on-the-books (OTB) di OGGI per ogni hotel
// attivo e lo salva in pace_snapshots. Da qui in avanti il confronto pace
// vs anno scorso sara' ESATTO (lo storico ricostruito da booking_date e'
// solo un'approssimazione che sottostima le prenotazioni poi cancellate).
//
// Una riga per (hotel, snapshot_date=oggi, stay_date) per ogni notte futura
// entro l'orizzonte. snapshot_date e stay_date insieme danno il "lead time".

const HORIZON_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (process.env.VERCEL_ENV === "production" && process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    // Short-circuit per keep-warm (come le altre route): nessun lavoro pesante.
    if (request.nextUrl.searchParams.get("warm") === "1") {
      return NextResponse.json({ ok: true, warm: true })
    }

    console.log("[v0] pace-snapshot cron started")
    const supabase = await createServiceRoleClient()

    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("is_active", true)

    if (hotelsError) {
      logSupabaseError("pace-snapshot: fetch active hotels", hotelsError)
      const transient = isServiceUnavailableError(hotelsError)
      return NextResponse.json(
        { error: transient ? "Supabase temporarily unavailable" : hotelsError.message },
        { status: transient ? 503 : 500 },
      )
    }

    const today = new Date()
    const snapshotDate = today.toISOString().slice(0, 10)
    const horizonEnd = new Date(today)
    horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS)
    const horizonEndStr = horizonEnd.toISOString().slice(0, 10)

    let totalRows = 0
    const results: Record<string, number> = {}

    for (const hotel of hotels ?? []) {
      try {
        // OTB attuale per notte: prenotazioni gia' acquisite (booking_date <=
        // oggi) e non cancellate, che coprono ogni notte da oggi all'orizzonte.
        const otb = await computeOnTheBooksByNight(supabase, {
          hotelId: hotel.id,
          asOf: snapshotDate,
          nightFrom: snapshotDate,
          nightTo: horizonEndStr,
        })

        if (otb.length === 0) {
          results[hotel.name] = 0
          continue
        }

        const rows = otb.map((n) => ({
          hotel_id: hotel.id,
          snapshot_date: snapshotDate,
          stay_date: n.stayDate,
          rooms_otb: n.roomsOtb,
          revenue_otb: n.revenueOtb,
        }))

        // Idempotente: se il cron rigira lo stesso giorno, sovrascrive.
        const { error: upsertError } = await supabase
          .from("pace_snapshots")
          .upsert(rows, { onConflict: "hotel_id,snapshot_date,stay_date" })

        if (upsertError) {
          logSupabaseError(`pace-snapshot: upsert ${hotel.name}`, upsertError)
          results[hotel.name] = -1
          continue
        }

        totalRows += rows.length
        results[hotel.name] = rows.length
      } catch (err) {
        console.error(`[v0] pace-snapshot: errore hotel ${hotel.name}:`, err)
        results[hotel.name] = -1
      }
    }

    console.log("[v0] pace-snapshot cron done:", totalRows, "rows")
    return NextResponse.json({ ok: true, snapshotDate, totalRows, results })
  } catch (error) {
    console.error("[v0] pace-snapshot cron error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
