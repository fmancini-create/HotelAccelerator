import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Resets processed flag for scidoo_raw_availability records
 * that were stuck (processed with errors or for missing room types).
 * After calling this, the next ETL run will pick up these records.
 * 
 * Also directly inserts missing data into rms_availability_daily
 * and daily_availability for immediate visibility.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Step 1: Get all active room types for this hotel
    const { data: roomTypes, error: rtError } = await supabase
      .from("room_types")
      .select("id, scidoo_room_type_id, name, total_rooms")
      .eq("hotel_id", hotel_id)
      .eq("is_active", true)

    if (rtError) {
      return NextResponse.json({ error: rtError.message }, { status: 500 })
    }

    const scidooToUuid: Record<string, string> = {}
    const scidooToTotalRooms: Record<string, number> = {}
    for (const rt of roomTypes || []) {
      if (rt.scidoo_room_type_id) {
        scidooToUuid[String(rt.scidoo_room_type_id)] = rt.id
        scidooToTotalRooms[String(rt.scidoo_room_type_id)] = rt.total_rooms || 0
      }
    }

    const allScidooIds = Object.keys(scidooToUuid)

    // Step 2: Check which room types are missing from rms_availability_daily
    const { data: existingIds } = await supabase
      .from("rms_availability_daily")
      .select("room_type_id")
      .eq("hotel_id", hotel_id)
      .limit(1000)

    const existingUuids = new Set((existingIds || []).map(r => r.room_type_id))
    const missingScidooIds = allScidooIds.filter(sid => !existingUuids.has(scidooToUuid[sid]))

    console.log("[v0] Fix ETL: hotel", hotel_id, "missing scidoo IDs:", missingScidooIds)

    if (missingScidooIds.length === 0) {
      return NextResponse.json({ 
        message: "All room types already have data in rms_availability_daily",
        roomTypes: allScidooIds
      })
    }

    // Step 3: Reset processed flag for missing room types
    const { data: resetResult, error: resetError } = await supabase
      .from("scidoo_raw_availability")
      .update({ processed: false, processing_error: null })
      .eq("hotel_id", hotel_id)
      .in("scidoo_room_type_id", missingScidooIds)
      .select("id")

    console.log("[v0] Fix ETL: reset", resetResult?.length || 0, "records")

    // Step 4: Also directly insert the data into both tables for immediate visibility
    let inserted = 0
    for (const scidooId of missingScidooIds) {
      const { data: rawRecords, error: rawErr } = await supabase
        .from("scidoo_raw_availability")
        .select("scidoo_room_type_id, date, rooms_available, raw_data")
        .eq("hotel_id", hotel_id)
        .eq("scidoo_room_type_id", scidooId)
        .order("date", { ascending: true })

      if (rawErr || !rawRecords) continue

      const roomTypeUuid = scidooToUuid[scidooId]
      const totalRooms = scidooToTotalRooms[scidooId] || 0

      // Process in batches
      const batchSize = 100
      for (let i = 0; i < rawRecords.length; i += batchSize) {
        const batch = rawRecords.slice(i, i + batchSize)
        
        // FIX (28/04/2026): hard guard contro orfani room_type_id=NULL.
        // Se per qualche regressione futura roomTypeUuid arriva qui falsy,
        // saltiamo l'intero batch: meglio non scrivere che inquinare le
        // tabelle canoniche con record orfani inutilizzabili (1377 orfani su
        // Massabò sono stati prodotti esattamente da questa via prima del
        // mapping definitivo delle room_types).
        if (!roomTypeUuid) {
          console.warn(`[v0] fix-room-type-etl: skipping batch — roomTypeUuid is falsy for scidoo_id=${scidooId}`)
          continue
        }

        const records = batch.map(raw => {
          const rawData = raw.raw_data as Record<string, any> || {}
          const roomsAvailable = raw.rooms_available ?? rawData.available_count ?? 0
          const roomsOos = Number(rawData.rooms_out_of_service) || 0

          return {
            hotel_id,
            date: raw.date,
            room_type_id: roomTypeUuid,
            total_rooms: totalRooms,
            rooms_available: Number(roomsAvailable),
            rooms_out_of_service: roomsOos,
            source: "scidoo",
          }
        })

        // Filtro record con room_type_id falsy (cintura+bretelle).
        const cleanRecords = records.filter(r => !!r.room_type_id)
        if (cleanRecords.length === 0) continue

        // Upsert into daily_availability
        await supabase
          .from("daily_availability")
          .upsert(cleanRecords, { onConflict: "hotel_id,date,room_type_id" })

        // Upsert into rms_availability_daily
        await supabase
          .from("rms_availability_daily")
          .upsert(cleanRecords, { onConflict: "hotel_id,date,room_type_id" })

        inserted += cleanRecords.length
      }

      // Mark as processed
      await supabase
        .from("scidoo_raw_availability")
        .update({ processed: true, processed_at: new Date().toISOString(), processing_error: null })
        .eq("hotel_id", hotel_id)
        .eq("scidoo_room_type_id", scidooId)
    }

    return NextResponse.json({
      success: true,
      missingRoomTypes: missingScidooIds,
      recordsReset: resetResult?.length || 0,
      recordsInserted: inserted,
    })
  } catch (error: any) {
    console.error("[v0] Fix ETL error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
