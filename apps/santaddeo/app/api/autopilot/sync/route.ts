import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { pushPricesToPMS, type PushResult } from "@/lib/pricing/push-prices"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { sendPriceChangeEmailGuarded } from "@/lib/pricing/autopilot-email"

/**
 * POST /api/autopilot/sync
 *
 * Sync engine: distinguishes first sync vs incremental sync.
 *
 * First sync (last_full_sync_at IS NULL):
 *   - Reads ALL prices from pricing_grid (today + 15 months)
 *   - Pushes them ALL to PMS
 *   - Writes all to last_sent_prices
 *   - Sets last_full_sync_at
 *
 * Incremental sync (last_full_sync_at IS NOT NULL):
 *   - Compares pricing_grid vs last_sent_prices
 *   - Pushes ONLY cells where price differs
 *   - Updates last_sent_prices for changed cells
 *
 * Source of truth for final price: pricing_grid
 *
 * Body: { hotelId: string, force?: boolean }
 * force=true: treats as first sync regardless of last_full_sync_at
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotelId, force } = body as { hotelId: string; force?: boolean }

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Get autopilot config
    const { data: config } = await supabase
      .from("autopilot_configs")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (!config) {
      return NextResponse.json(
        { error: "Autopilot non configurato per questo hotel" },
        { status: 404 }
      )
    }

    if (config.mode === "disabled") {
      return NextResponse.json({
        action: "skipped",
        reason: "Autopilot disabilitato",
      })
    }

    const isFirstSync = force || !config.last_full_sync_at

    // 2. Calculate date range: today + 15 months
    const today = new Date()
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 15)
    const todayStr = today.toISOString().split("T")[0]
    const endStr = endDate.toISOString().split("T")[0]

    // 3. Get current prices from pricing_grid (SOURCE OF TRUTH)
    const { data: currentPrices, error: pgError } = await supabase
      .from("pricing_grid")
      .select("room_type_id, rate_id, occupancy, date, price")
      .eq("hotel_id", hotelId)
      .gte("date", todayStr)
      .lte("date", endStr)
      .gt("price", 0)

    if (pgError) {
      return NextResponse.json(
        { error: `Errore lettura pricing_grid: ${pgError.message}` },
        { status: 500 }
      )
    }

    if (!currentPrices || currentPrices.length === 0) {
      return NextResponse.json({
        action: "skipped",
        reason: "Nessun prezzo in pricing_grid per il periodo selezionato",
      })
    }

    // 4. Determine which cells to push
    let changesToPush: {
      room_type_id: string
      rate_id: string
      occupancy: number
      date: string
      new_price: number
      old_price: number | null
    }[] = []

    if (isFirstSync) {
      // FIRST SYNC: push everything
      changesToPush = currentPrices.map((p) => ({
        room_type_id: p.room_type_id,
        rate_id: p.rate_id,
        occupancy: p.occupancy,
        date: p.date,
        new_price: p.price,
        old_price: null,
      }))
    } else {
      // INCREMENTAL SYNC: compare with last_sent_prices
      const { data: lastSent } = await supabase
        .from("last_sent_prices")
        .select("room_type_id, rate_id, occupancy, target_date, last_price")
        .eq("hotel_id", hotelId)
        .gte("target_date", todayStr)
        .lte("target_date", endStr)

      // Build lookup map for fast comparison
      const sentMap = new Map<string, number>()
      for (const s of lastSent || []) {
        const key = `${s.room_type_id}_${s.rate_id}_${s.occupancy}_${s.target_date}`
        sentMap.set(key, s.last_price)
      }

      // Find cells where pricing_grid differs from last_sent_prices
      for (const p of currentPrices) {
        const key = `${p.room_type_id}_${p.rate_id}_${p.occupancy}_${p.date}`
        const lastPrice = sentMap.get(key)

        if (lastPrice === undefined || lastPrice !== p.price) {
          changesToPush.push({
            room_type_id: p.room_type_id,
            rate_id: p.rate_id,
            occupancy: p.occupancy,
            date: p.date,
            new_price: p.price,
            old_price: lastPrice ?? null,
          })
        }
      }
    }

    if (changesToPush.length === 0) {
      return NextResponse.json({
        action: "no_changes",
        syncType: isFirstSync ? "first_sync" : "incremental",
        reason: "Nessuna variazione rispetto all'ultimo invio",
      })
    }

    // 5. Get room type and rate names for PriceChange format (incluso range pax)
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select(
        "id, code, name, scidoo_room_type_id, brig_room_code, slope_lodging_type_id, min_occupancy, max_occupancy",
      )
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    const { data: rates } = await supabase
      .from("rates")
      .select("id, name, scidoo_rate_id, brig_rate_code, slope_rate_plan_id, parent_rate_id")
      .eq("hotel_id", hotelId)

    const rtMap = new Map((roomTypes || []).map((r) => [r.id, r]))
    const rateMap = new Map((rates || []).map((r) => [r.id, r]))

    // Convert to PriceChange format used by push-prices
    const priceChanges: PriceChange[] = changesToPush.map((c) => ({
      roomTypeId: c.room_type_id,
      roomTypeName: rtMap.get(c.room_type_id)?.name || "N/D",
      rateId: c.rate_id,
      occupancy: c.occupancy,
      date: c.date,
      currentPrice: c.old_price,
      suggestedPrice: c.new_price,
    }))

    // 6. Execute based on mode
    let pushResult: PushResult | null = null
    let action = "logged"

    if (config.mode === "autopilot") {
      // Get PMS config
      const { data: pms } = await supabase
        .from("pms_integrations")
        .select("integration_mode, pms_name, api_key, endpoint_url, property_id, config, gsheet_spreadsheet_id")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .maybeSingle()

      if (!pms) {
        return NextResponse.json(
          { error: "Nessuna integrazione PMS attiva" },
          { status: 404 }
        )
      }

      pushResult = await pushPricesToPMS(pms, priceChanges, roomTypes || [], rates || [])
      action = pushResult.success ? "pushed" : "push_failed"

      // Invia email di notifica anche in modalita autopilot, se l'utente
      // ha configurato indirizzi in notify_emails. Cosi riceve sempre un
      // recap delle variazioni applicate (sia dal sync incrementale che dal
      // first/full sync). Best-effort: errori non bloccano il sync.
      if (priceChanges.length > 0 && config.notify_emails?.length > 0) {
        try {
          // Recupera nome hotel per il subject
          const { data: hotelRow } = await supabase
            .from("hotels")
            .select("name")
            .eq("id", hotelId)
            .maybeSingle()

          // Via guarded sender per debounce 15min cross-path (FIX storm 12/05/2026)
          await sendPriceChangeEmailGuarded({
            hotelId,
            hotelName: hotelRow?.name || "Hotel",
            changes: priceChanges,
            emails: config.notify_emails,
            pushResult,
            sourceLabel: isFirstSync ? "primo sync completo" : "sync incrementale",
          })
        } catch (emailErr) {
          console.error("[autopilot/sync] Email notification error:", emailErr)
        }
      }
    } else if (config.mode === "notify") {
      // For notify mode: just log, email handled by trigger
      action = "notify_logged"
    }

    // 7. Update last_sent_prices (ONLY if push succeeded or mode=notify)
    if (config.mode === "notify" || (pushResult && pushResult.success)) {
      const upserts = changesToPush.map((c) => ({
        hotel_id: hotelId,
        room_type_id: c.room_type_id,
        rate_id: c.rate_id,
        occupancy: c.occupancy,
        target_date: c.date,
        last_price: c.new_price,
        sent_at: new Date().toISOString(),
        source: isFirstSync ? "first_sync" : config.mode === "autopilot" ? "autopilot" : "notify",
      }))

      // Upsert in batches of 200
      for (let i = 0; i < upserts.length; i += 200) {
        const batch = upserts.slice(i, i + 200)
        const { error: upsertError } = await supabase
          .from("last_sent_prices")
          .upsert(batch, {
            onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date",
          })

        if (upsertError) {
          console.error("[autopilot/sync] Error upserting last_sent_prices:", upsertError.message)
        }
      }
    }

    // 8. Update autopilot_configs
    const configUpdate: Record<string, any> = {}
    if (isFirstSync) {
      configUpdate.last_full_sync_at = new Date().toISOString()
    }
    if (pushResult?.success) {
      configUpdate.last_push_at = new Date().toISOString()
    }
    if (Object.keys(configUpdate).length > 0) {
      await supabase
        .from("autopilot_configs")
        .update(configUpdate)
        .eq("hotel_id", hotelId)
    }

    // 9. Deduplication check: avoid writing to price_change_log if trigger
    //    already processed these exact changes in the last 30 minutes
    const syncTimestamp = new Date().toISOString()
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    // Write price_change_log for history tracking (PMS log page)
    // Per-cell dedup: fetch all recent logs for this hotel, then filter locally
    if (config.mode === "notify" || (pushResult && pushResult.success)) {
      // Fetch all recent price_change_log entries for this hotel (last 30 min)
      const { data: recentLogs } = await supabase
        .from("price_change_log")
        .select("room_type_id, rate_id, occupancy, target_date, old_price, new_price")
        .eq("hotel_id", hotelId)
        .gte("changed_at", thirtyMinAgo)

      // Build a Set of already-logged cell keys for O(1) lookup
      // Key includes old_price + new_price to distinguish oscillations (150→170 vs 170→150→170)
      const loggedKeys = new Set(
        (recentLogs || []).map(
          (r: { room_type_id: string; rate_id: string; occupancy: number; target_date: string; old_price: number | null; new_price: number }) =>
            `${r.room_type_id}_${r.rate_id}_${r.occupancy}_${r.target_date}_${r.old_price ?? "null"}_${r.new_price}`
        )
      )

      // Filter: only write cells that are NOT already logged with same old_price+new_price transition
      const source = isFirstSync ? "first_sync" : config.mode === "autopilot" ? "autopilot_sync" : "notify_sync"
      const newLogs = changesToPush
        .filter((c) => {
          const key = `${c.room_type_id}_${c.rate_id}_${c.occupancy}_${c.date}_${c.old_price ?? "null"}_${c.new_price}`
          return !loggedKeys.has(key)
        })
        .map((c) => ({
          hotel_id: hotelId,
          room_type_id: c.room_type_id,
          rate_id: c.rate_id,
          occupancy: c.occupancy,
          target_date: c.date,
          old_price: c.old_price,
          new_price: c.new_price,
          source,
          changed_at: syncTimestamp,
        }))

      if (newLogs.length > 0) {
        for (let i = 0; i < newLogs.length; i += 100) {
          const batch = newLogs.slice(i, i + 100)
          const { error: logError } = await supabase.from("price_change_log").insert(batch)
          if (logError) console.error("[autopilot/sync] Error logging price changes:", logError.message)
        }
      }
    }

    // 10. Log to autopilot_price_changes (with REAL hash for dedup).
    // FIX 12/05/2026: il vecchio hash `sync_${hotelId}_${count}_${timestamp}`
    // includeva il timestamp → sempre unico → mai dedup-abile. Ora usiamo
    // hashPriceChanges() consistente con tutti gli altri path.
    const { hashPriceChanges } = await import("@/lib/pricing/calculate-suggested-price")
    await supabase.from("autopilot_price_changes").insert({
      hotel_id: hotelId,
      mode: config.mode,
      changes: priceChanges,
      changes_hash: hashPriceChanges(priceChanges),
      notification_sent: false,
      push_sent: pushResult?.success || false,
      push_result: pushResult,
    })

    return NextResponse.json({
      action,
      syncType: isFirstSync ? "first_sync" : "incremental",
      totalCells: currentPrices.length,
      changedCells: changesToPush.length,
      pushResult: pushResult
        ? {
            success: pushResult.success,
            method: pushResult.method,
            cellsOrRecords: pushResult.cellsOrRecords,
            errors: pushResult.errors,
          }
        : null,
    })
  } catch (err) {
    console.error("[autopilot/sync] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}
