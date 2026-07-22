import { createClient } from "@/lib/supabase/server"
import { supabaseRetry } from "@/lib/supabase/retry"
import { NextRequest, NextResponse } from "next/server"
import { RELIABLE_OPERATIONAL_SOURCE_KEYS } from "@/lib/services/production-metrics.service"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/dati/rooms-sold", handleGET)

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotel_id")
    const monthStart = searchParams.get("month_start")
    const monthEnd = searchParams.get("month_end")

    if (!hotelId || !monthStart || !monthEnd) {
      return NextResponse.json({ error: "hotel_id, month_start, and month_end required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get room types with display_order for client-side sorting/filtering
    const roomTypes = await supabaseRetry(() =>
      supabase
        .from("room_types")
        .select("id, name, scidoo_room_type_id, is_active, deactivated_at, total_rooms, display_order")
        .eq("hotel_id", hotelId)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name")
    )

    // Build maps from room_types
    const roomTypeIdToScidoo: Record<string, string> = {}
    const scidooToTotalRooms: Record<string, number> = {}
    // Only check ACTIVE room types for scidoo_room_type_id (inactive aggregates don't count)
    const hasScidooIds = (roomTypes || []).some(rt => rt.scidoo_room_type_id && rt.is_active !== false)

    // FIX 17/07/2026 — Escludi le righe delle tipologie disattivate, ma SOLO
    // per le date >= data di disattivazione (deactivated_at). Contesto: Barronci
    // (e altri hotel Scidoo) ha tipologie disattivate in Santaddeo (es.
    // "Appartamento Toscana Trilocale", "Over Barronci") che hanno ancora righe
    // FANTASMA stale (source=pms/vecchi sync) in rms_availability_daily. Se le
    // sommassimo gonfierebbero capacita'/vendute (es. luglio 25/25 invece di
    // 24/24, divergendo da Scidoo). MA una tipologia poteva essere realmente
    // sellable/venduta in PASSATO: escluderla del tutto falserebbe i periodi
    // storici. Quindi il taglio e' TEMPORALE: la tipologia conta fino al giorno
    // PRIMA di deactivated_at, e sparisce da li' in poi. Le tipologie attive
    // (deactivated_at NULL) non hanno cutoff. Le mappe includono TUTTE le
    // tipologie cosi' le date storiche delle disattivate mappano correttamente.
    const scidooIdToRoomTypeId: Record<string, string> = {}
    // roomTypeId -> data di disattivazione in formato 'YYYY-MM-DD' (confronto
    // stringa sicuro perche' le date di availability sono gia' 'YYYY-MM-DD').
    const deactivatedDateByRoomType: Record<string, string> = {}

    for (const rt of roomTypes || []) {
      if (rt.deactivated_at) {
        deactivatedDateByRoomType[rt.id] = String(rt.deactivated_at).slice(0, 10)
      }
      if (rt.scidoo_room_type_id) {
        roomTypeIdToScidoo[rt.id] = rt.scidoo_room_type_id
        scidooToTotalRooms[String(rt.scidoo_room_type_id)] = rt.total_rooms || 0
        scidooIdToRoomTypeId[String(rt.scidoo_room_type_id)] = rt.id
      }
    }

    // True se la riga (tipologia, data) va ESCLUSA perche' la tipologia era gia'
    // disattivata a quella data. NULL deactivated_at (tipologia attiva) => mai esclusa.
    const isDeactivatedOn = (roomTypeId: string | null | undefined, date: string): boolean => {
      if (!roomTypeId) return false
      const deact = deactivatedDateByRoomType[roomTypeId]
      return !!deact && date >= deact
    }

    const dailyRoomsSold: Record<string, Record<string, { sold: number, total: number, percentage: number }>> = {}
    const roomTypeTotals: Record<string, number> = {}
    let dataSource = "rms_availability_daily"

    // GSheets/Bedzzle: Try rms_availability_daily FIRST (has per-room-type data)
    // Only fallback to daily_production (aggregated) if rms_availability_daily is empty
    if (!hasScidooIds) {
      // First try rms_availability_daily which has per-room-type data
      const { data: rmsAvailData } = await supabase
        .from("rms_availability_daily")
        .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
        .eq("hotel_id", hotelId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
      
      if (rmsAvailData && rmsAvailData.length > 0) {
        dataSource = "rms_availability_daily"
        // Map room_type_id to room type for per-typology display
        const rtMap = new Map((roomTypes || []).map(rt => [rt.id, rt]))
        
        for (const avail of rmsAvailData) {
          const keyId = avail.room_type_id
          if (!keyId) continue
          // FIX 17/07/2026 — salta le righe delle tipologie disattivate a partire
          // dalla loro data di disattivazione (preserva lo storico precedente).
          if (isDeactivatedOn(keyId, avail.date)) continue
          
          if (!dailyRoomsSold[keyId]) {
            dailyRoomsSold[keyId] = {}
          }
          
          const totalRooms = avail.total_rooms || 0
          const roomsSold = Math.max(0, totalRooms - (avail.rooms_available || 0) - (avail.rooms_out_of_service || 0))
          const percentage = totalRooms > 0 ? Math.round((roomsSold / totalRooms) * 100) : 0
          
          dailyRoomsSold[keyId][avail.date] = { sold: roomsSold, total: totalRooms, percentage }
          if (!roomTypeTotals[keyId] || totalRooms > roomTypeTotals[keyId]) {
            roomTypeTotals[keyId] = totalRooms
          }
        }
        
        console.log("[v0] rooms-sold GSheets via rms_availability_daily:", {
          rmsAvailDataLen: rmsAvailData.length,
          dailyRoomsSoldKeys: Object.keys(dailyRoomsSold),
          roomTypesNames: (roomTypes || []).map(r => r.name),
        })
      } else {
        // Fallback to daily_production (aggregated) if no rms_availability_daily data
        dataSource = "daily_production"
        const aggRt = (roomTypes || []).find(r => r.is_active) || (roomTypes || [])[0]
        const aggKey = aggRt?.id || "aggregate"
        const totalRoomsHotel = (roomTypes || []).reduce((s, r) => s + (r.total_rooms || 0), 0) || 5

        // FIX 13/05/2026 (source-safety): escludi le righe fiscali da questo fallback.
        // Le source FISCAL_SOURCES (es. scidoo_fiscal) lasciano rooms_occupied=0 come
        // placeholder e total_rooms popolato -> userebbero il giorno fiscale come "0 camere
        // vendute" mascherando i dati reali. Vedi lib/services/production-metrics.service.ts.
        const { data: dpData } = await supabase
          .from("daily_production")
          .select("date, total_rooms, rooms_occupied, rooms_available, source")
          .eq("hotel_id", hotelId)
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS)

        if (dpData && dpData.length > 0) {
          dailyRoomsSold[aggKey] = {}
          for (const dp of dpData) {
            const total = dp.total_rooms || totalRoomsHotel
            const sold = dp.rooms_occupied || 0
            dailyRoomsSold[aggKey][dp.date] = {
              sold,
              total,
              percentage: total > 0 ? Math.round((sold / total) * 100) : 0,
            }
            if (!roomTypeTotals[aggKey] || total > roomTypeTotals[aggKey]) {
              roomTypeTotals[aggKey] = total
            }
          }
        }

        console.log("[v0] rooms-sold GSheets fallback to daily_production:", {
          aggKey, dpDataLen: (dpData || []).length, totalRoomsHotel,
          dailyRoomsSoldKeys: Object.keys(dailyRoomsSold),
        })
      }
      // FIX 21/05/2026 — non torno qui se il branch GSheets ha prodotto dati
      // (gestito sotto al fallback bookings). Fall-through al fallback bookings
      // se entrambe le tabelle (rms_availability_daily + daily_production) sono
      // vuote, tipico per BRiG che non popola nessuna delle due.
    } else {
      // Standard Scidoo path: read from rms_availability_daily
      const { data: availabilityData, error: availError } = await supabase
      .from("rms_availability_daily")
      .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .gte("date", monthStart)
      .lte("date", monthEnd)

    if (availError) {
      console.error("Error fetching availability:", availError)
      return NextResponse.json({ error: availError.message }, { status: 500 })
    }

    const scidooIdsWithData = new Set<string>()

    for (const avail of availabilityData || []) {
      // FIX 17/07/2026 — salta le righe delle tipologie disattivate a partire
      // dalla loro data di disattivazione (preserva lo storico precedente).
      if (isDeactivatedOn(avail.room_type_id, avail.date)) continue
      // Try scidoo mapping first, fallback to room_type_id directly (for GDocs/Bedzzle)
      const scidooId = roomTypeIdToScidoo[avail.room_type_id]
      const keyId = scidooId ? String(scidooId) : avail.room_type_id
      
      if (!keyId) continue

      scidooIdsWithData.add(keyId)
      if (!dailyRoomsSold[keyId]) {
        dailyRoomsSold[keyId] = {}
      }

      const totalRooms = avail.total_rooms || 0
      const roomsSold = Math.max(0,
        totalRooms - (avail.rooms_available || 0) - (avail.rooms_out_of_service || 0)
      )
      const percentage = totalRooms > 0 ? Math.round((roomsSold / totalRooms) * 100) : 0

      dailyRoomsSold[keyId][avail.date] = { sold: roomsSold, total: totalRooms, percentage }

      if (!roomTypeTotals[keyId] || totalRooms > roomTypeTotals[keyId]) {
        roomTypeTotals[keyId] = totalRooms
      }
    }

    // Fallback: for room types NOT found in rms_availability_daily, read from scidoo_raw_availability
    const allScidooIds = Object.values(roomTypeIdToScidoo).map(String)
    const missingScidooIds = allScidooIds.filter(id => !scidooIdsWithData.has(id))

    if (missingScidooIds.length > 0) {
      dataSource = "rms_availability_daily+scidoo_raw_availability"

      const { data: rawAvail, error: rawError } = await supabase
        .from("scidoo_raw_availability")
        .select("scidoo_room_type_id, date, rooms_available, raw_data")
        .eq("hotel_id", hotelId)
        .in("scidoo_room_type_id", missingScidooIds)
        .gte("date", monthStart)
        .lte("date", monthEnd)

      if (!rawError) {
        for (const raw of rawAvail || []) {
          const scidooIdStr = String(raw.scidoo_room_type_id)
          // FIX 17/07/2026 — taglio temporale anche nel fallback raw: salta le
          // date >= data di disattivazione della tipologia corrispondente.
          if (isDeactivatedOn(scidooIdToRoomTypeId[scidooIdStr], raw.date)) continue
          if (!dailyRoomsSold[scidooIdStr]) dailyRoomsSold[scidooIdStr] = {}

          const totalRooms = scidooToTotalRooms[scidooIdStr] || 0
          const rawData = raw.raw_data as Record<string, any> || {}
          const roomsAvailable = raw.rooms_available ?? rawData.available_count ?? 0
          const roomsSold = Math.max(0, totalRooms - Number(roomsAvailable))
          const percentage = totalRooms > 0 ? Math.round((roomsSold / totalRooms) * 100) : 0

          dailyRoomsSold[scidooIdStr][raw.date] = { sold: roomsSold, total: totalRooms, percentage }
          if (!roomTypeTotals[scidooIdStr] || totalRooms > roomTypeTotals[scidooIdStr]) {
            roomTypeTotals[scidooIdStr] = totalRooms
          }
        }
      }
    }
    } // end else (Standard Scidoo path)

    // FIX 21/05/2026 — Fallback PMS-agnostico da `public.bookings`.
    // Se nessuna delle tabelle Scidoo/RMS ha popolato dailyRoomsSold (caso
    // tipico BRiG e altri provider che non scrivono `rms_availability_daily`),
    // deriviamo "camere vendute per giorno per tipologia" direttamente dalla
    // tabella unificata `public.bookings`: per ogni booking attivo non
    // cancellato che copre il giorno D (check_in <= D < check_out) incrementiamo
    // di 1 il count della relativa room_type_id. `total_rooms` viene da
    // `room_types.total_rooms`. Vedi MEMORY.md "Dashboard hardcoded a Scidoo".
    const noneFromRmsOrScidoo = Object.keys(dailyRoomsSold).length === 0
    if (noneFromRmsOrScidoo) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("check_in_date, check_out_date, room_type_id, is_cancelled, is_room_booking")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .lte("check_in_date", monthEnd)
        .gt("check_out_date", monthStart)

      if (bks && bks.length > 0) {
        dataSource = "bookings_pmsagnostic"
        const start = new Date(monthStart)
        const end = new Date(monthEnd)
        // Inizializza struttura per ogni room_type attivo del periodo
        for (const rt of roomTypes || []) {
          if (rt.is_active === false) continue
          dailyRoomsSold[rt.id] = {}
          roomTypeTotals[rt.id] = rt.total_rooms || 0
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10)
            dailyRoomsSold[rt.id][key] = {
              sold: 0,
              total: rt.total_rooms || 0,
              percentage: 0,
            }
          }
        }
        for (const b of bks) {
          // Solo booking room (BRiG ha extras-only senza room_type_id, vanno saltati)
          if (b.is_room_booking === false) continue
          if (!b.room_type_id || !dailyRoomsSold[b.room_type_id]) continue
          const ci = new Date(b.check_in_date)
          const co = new Date(b.check_out_date)
          for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
            if (d < start || d > end) continue
            const key = d.toISOString().slice(0, 10)
            const cell = dailyRoomsSold[b.room_type_id][key]
            if (!cell) continue
            cell.sold += 1
            cell.percentage = cell.total > 0 ? Math.round((cell.sold / cell.total) * 100) : 0
          }
        }
      }
    }

    return NextResponse.json({ roomTypes: roomTypes || [], dailyRoomsSold, roomTypeTotals, dataSource })
  } catch (error: any) {
    console.error("Rooms sold API error:", error?.message || error)
    return NextResponse.json({
      error: "Internal server error",
      details: error?.message || String(error)
    }, { status: 500 })
  }
}
