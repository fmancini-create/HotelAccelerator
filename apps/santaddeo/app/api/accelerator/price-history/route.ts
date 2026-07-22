import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/accelerator/price-history
 * Returns the price change log + occupancy context for a specific pricing grid cell.
 * Query params: hotel_id, room_type_id, rate_id, occupancy, target_date
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotel_id")
    const roomTypeId = sp.get("room_type_id")
    const rateId = sp.get("rate_id")
    const occupancy = sp.get("occupancy")
    const targetDate = sp.get("target_date")

    if (!hotelId || !roomTypeId || !rateId || !occupancy || !targetDate) {
      return NextResponse.json(
        { error: "hotel_id, room_type_id, rate_id, occupancy, target_date required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 1. Get the current price for this specific cell FIRST (needed for fallback)
    const { data: currentCellPrice } = await supabase
      .from("pricing_grid")
      .select("price, updated_at")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", Number(occupancy))
      .eq("date", targetDate)
      .maybeSingle()

    const currentPrice = currentCellPrice ? Number(currentCellPrice.price) : null

    // 1b. Get the price ACTUALLY sent to the PMS for this cell (source of truth
    // for "già pubblicato su Scidoo?"). Confrontare la griglia con questo valore
    // — invece che con l'action_taken dell'ultima riga di log — evita il falso
    // "Da pubblicare" quando l'ultima variazione è un semplice ricalcolo
    // (action='none') che ha prodotto lo stesso prezzo già presente sul PMS.
    const { data: lastSentRow } = await supabase
      .from("last_sent_prices")
      .select("last_price, sent_at")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", Number(occupancy))
      .eq("target_date", targetDate)
      .maybeSingle()

    const lastSentPrice = lastSentRow ? Number(lastSentRow.last_price) : null
    const lastSentAt = lastSentRow?.sent_at || null

    // 2. Price change history for this specific cell (ALL history, ordered chronologically)
    const { data: priceHistory, error: historyError } = await supabase
      .from("price_change_log")
      .select(`
        id, 
        old_price, 
        new_price, 
        changed_at, 
        source, 
        changed_by,
        action_taken
      `)
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", Number(occupancy))
      .eq("target_date", targetDate)
      .order("changed_at", { ascending: true })  // Chronological order from oldest to newest
    
    if (historyError) {
      console.error("[v0] PRICE-HISTORY: Query error:", historyError)
    }
    
    console.log("[v0] PRICE-HISTORY: Found", priceHistory?.length || 0, "history records")

    // FIX 21/07/2026 (log attribuiva "Sistema" all'utente reale): prima
    // `user_name` veniva derivato SOLO dal `source`, con default "Sistema", e
    // la colonna `changed_by` (userId realmente registrato da /pricing-grid su
    // ogni modifica utente: source 'algorithm'/'manual_grid'/... porta
    // changed_by = auth user id) veniva IGNORATA. Cosi' chi modificava il
    // "prezzo di partenza" (o qualunque cella) si vedeva stampare "Sistema"
    // invece del proprio nome. Ora: se la riga ha un changed_by reale lo
    // risolviamo in nome persona (profiles) e lo mostriamo; solo in assenza di
    // un utente (es. ricalcolo di background da ETL/cron, source
    // 'algo_param_change' con changed_by NULL) restano le etichette generiche.
    const changerIds = Array.from(
      new Set(
        (priceHistory || [])
          .map((e: any) => e.changed_by)
          .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
      ),
    )
    const nameById = new Map<string, string>()
    if (changerIds.length > 0) {
      // Service-role: i profili degli operatori non sono garantiti leggibili
      // sotto RLS user-scoped (stesso pattern gia' adottato per room_types).
      // Sola lettura dei nomi, nessuna scrittura.
      try {
        const admin = await createServiceRoleClient()
        const { data: profs } = await admin
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", changerIds)
        for (const p of profs || []) {
          const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
          const label = full || (p.email ? String(p.email) : "")
          if (label) nameById.set(p.id, label)
        }
      } catch (e) {
        console.error("[v0] PRICE-HISTORY: profiles lookup failed:", e)
      }
    }

    // Map history entries with resolved actor name
    const enrichedHistory = (priceHistory || []).map((entry: any) => {
      // 1) Persona reale che ha innescato il cambio (priorita' massima: e' il
      //    dato piu' veritiero).
      let userName = entry.changed_by ? nameById.get(entry.changed_by) ?? null : null
      // 2) Fallback su etichetta derivata dal source quando non c'e' un utente
      //    risolvibile.
      if (!userName) {
        if (entry.source === "manual_grid" || entry.source === "drag_fill" || entry.source === "bulk_fill") {
          userName = "Utente"
        } else if (entry.source === "autopilot_push" || entry.source === "autopilot_calculated") {
          userName = "Autopilot"
        } else if (entry.source === "publish_suggested") {
          userName = "Pubblicazione"
        } else {
          userName = "Sistema"
        }
      }
      return {
        ...entry,
        user_name: userName,
      }
    })

    console.log("[v0] PRICE-HISTORY: Fetched", enrichedHistory?.length || 0, "changes for cell", targetDate)

    // 3. Calculate starting price (first known price for this cell)
    let startingPrice: number | null = null
    if (enrichedHistory && enrichedHistory.length > 0) {
      const firstEntry = enrichedHistory[0]
      // If old_price is NULL, this is the creation event, so starting_price = new_price
      // Otherwise starting_price = old_price from first entry
      startingPrice = firstEntry.old_price != null ? Number(firstEntry.old_price) : Number(firstEntry.new_price)
      console.log("[v0] PRICE-HISTORY: Starting price calculated from history:", startingPrice)
    } else {
      // Fallback: if no history, use current price as starting price
      // This happens when price hasn't been modified yet (still at creation)
      startingPrice = currentPrice
      console.log("[v0] PRICE-HISTORY: No history found, using current price as starting:", startingPrice)
    }

    // 4. Build price evolution series for THIS CELL (for cell-specific sparkline)
    // IMPORTANT: Include starting price as first point, then all new_price values
    const priceEvolutionSeries: { timestamp: string; price: number }[] = []
    if (enrichedHistory && enrichedHistory.length > 0) {
      // Add starting price as FIRST point (use old_price of first entry, or new_price if old_price is null)
      const firstEntry = enrichedHistory[0]
      const firstTimestamp = firstEntry.changed_at
      // Calculate timestamp slightly before first change for the starting point
      const startTimestamp = new Date(new Date(firstTimestamp).getTime() - 1000).toISOString()
      
      if (firstEntry.old_price != null) {
        // There was a previous price - add it as starting point
        priceEvolutionSeries.push({
          timestamp: startTimestamp,
          price: Number(firstEntry.old_price),
        })
      }
      
      // Now add all new_price values from history
      for (const entry of enrichedHistory) {
        priceEvolutionSeries.push({
          timestamp: entry.changed_at,
          price: Number(entry.new_price),
        })
      }
      console.log("[v0] PRICE-HISTORY: Price evolution series built:", priceEvolutionSeries.length, "points (including starting price)")
    }

    // 5. Occupancy context: daily_availability or daily_production fallback
    let roomsSold: number | null = null
    let totalRoomsVal: number | null = null

    const { data: avail } = await supabase
      .from("daily_availability")
      .select("rooms_available, total_rooms")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", targetDate)
      .maybeSingle()

    if (avail) {
      totalRoomsVal = avail.total_rooms || null
      roomsSold = totalRoomsVal ? (totalRoomsVal - (avail.rooms_available || 0)) : null
    } else {
      const { data: dpRow } = await supabase
        .from("daily_production")
        .select("rooms_occupied, total_rooms")
        .eq("hotel_id", hotelId)
        .eq("date", targetDate)
        .maybeSingle()
      if (dpRow) {
        totalRoomsVal = dpRow.total_rooms || null
        roomsSold = dpRow.rooms_occupied || null
      }
    }

    // Determine lastUpdated: prefer pricing_grid.updated_at, fallback to last history entry
    let lastUpdated = currentCellPrice?.updated_at || null
    if (!lastUpdated && enrichedHistory && enrichedHistory.length > 0) {
      // Use the most recent history entry's changed_at
      lastUpdated = enrichedHistory[enrichedHistory.length - 1].changed_at
    }

    return NextResponse.json({
      enrichedHistory,                   // Full history with user names (chronological)
      priceEvolutionSeries,              // Series data for cell-specific chart
      startingPrice,                     // Starting price for this cell
      currentPrice,                      // Current price from pricing_grid
      lastSentPrice,                     // Price actually pushed to the PMS (source of truth)
      lastSentAt,                        // When that price was pushed to the PMS
      currentRoomsSold: roomsSold,
      totalRooms: totalRoomsVal,
      lastUpdated,                       // When the current price was set
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Price history API error:", msg)
    return NextResponse.json({ error: "Internal server error", details: msg }, { status: 500 })
  }
}
