import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { syncSlopeForHotel } from "@/lib/connectors/slope/sync"
import { SlopeBookingsProcessor } from "@/lib/etl/processors/slope-bookings-processor"
import { SlopeAvailabilityProcessor } from "@/lib/etl/processors/slope-availability-processor"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/admin/slope/sync
 *
 * Lancia un sync Slope manualmente per un hotel. Solo super_admin.
 * Stesso flusso di `processSlopeModule` nel cron sync-modules e del ramo
 * slope in /api/superadmin/sync: delta sync su `lastUpdateDate` (cursore in
 * pms_integrations.config.slopeLastSyncAt) + ETL SlopeBookingsProcessor solo
 * se sono state scritte righe raw.
 *
 * Perche' un endpoint dedicato (come /api/admin/brig/sync) e non solo il ramo
 * in /api/superadmin/sync: il pannello Slope in Impostazioni > PMS ha bisogno
 * di un report strutturato (esaminate/inserite/aggiornate) per il feedback,
 * speculare a BrigSyncPanel. Slope espone SOLO le prenotazioni: niente moduli
 * availability/room_types/rates separati (la disponibilita' e' derivata).
 *
 * Body JSON: { "hotelId": "uuid", "forceFullSync"?: boolean }
 */
export async function POST(request: Request) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: { hotelId?: string; forceFullSync?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const hotelId = body.hotelId
  if (!hotelId) {
    return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
  }

  try {
    const report = await syncSlopeForHotel({ hotelId, forceFullSync: body.forceFullSync === true })
    const totalWritten = report.inserted + report.updated + report.deletedMarked

    // ETL solo se il sync ha scritto righe raw (stesso gate del cron): senza
    // scritture non c'e' nulla da normalizzare in public.bookings.
    let etlError: string | null = null
    if (totalWritten > 0) {
      try {
        const processor = new SlopeBookingsProcessor(hotelId, `manual-slope-${Date.now()}`)
        await processor.process()
      } catch (e) {
        etlError = e instanceof Error ? e.message : String(e)
        console.error("[slope-sync] ETL failed for", hotelId, etlError)
      }
    }

    // Availability derivata dalle prenotazioni (sempre, anche senza nuove
    // scritture): senza questo daily_availability resta vuota per gli hotel
    // Slope e la dashboard mostra occupancy 0%. Non-fatal.
    let availError: string | null = null
    try {
      const availProcessor = new SlopeAvailabilityProcessor(hotelId, `manual-slope-avail-${Date.now()}`)
      await availProcessor.process()
    } catch (e) {
      availError = e instanceof Error ? e.message : String(e)
      console.error("[slope-sync] availability derivation failed for", hotelId, availError)
    }

    const errors = [...report.errors, etlError, availError].filter(Boolean) as string[]
    return NextResponse.json({
      success: errors.length === 0,
      report: {
        pagesFetched: report.pagesFetched,
        recordsExamined: report.recordsExamined,
        inserted: report.inserted,
        updated: report.updated,
        unchanged: report.unchanged,
        deletedMarked: report.deletedMarked,
        usedCursor: report.usedCursor,
        newCursor: report.newCursor,
      },
      errors,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed"
    console.error("[slope-sync] error:", msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
