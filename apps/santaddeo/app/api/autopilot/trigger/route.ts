import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashPriceChanges, type PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { pushPricesToPMS, type PushResult } from "@/lib/pricing/push-prices"
import { sendPriceChangeEmailGuarded } from "@/lib/pricing/autopilot-email"

/**
 * POST /api/autopilot/trigger
 *
 * Called whenever algo params/prices are saved. Calculates suggested prices
 * server-side and compares them to current PMS rates. If differences are found,
 * acts based on autopilot mode:
 *   - disabled: log only, no action
 *   - notify: send email notification to configured recipients
 *   - autopilot: automatically push prices to PMS
 *
 * Body: { hotelId: string, changes?: PriceChange[] }
 * If changes[] is provided, uses those directly (from manual UI).
 * If not, calculates them server-side.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  try {
    const body = await request.json()
    const { hotelId, changes: providedChanges } = body as {
      hotelId: string
      changes?: PriceChange[]
    }

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    // Get hotel name
    const { data: hotel } = await supabase
      .from("hotels")
      .select("name")
      .eq("id", hotelId)
      .maybeSingle()
    const hotelName = hotel?.name || "Hotel"

    // Use provided changes or empty array (in future: calculate server-side)
    const changes: PriceChange[] = providedChanges && providedChanges.length > 0
      ? providedChanges
      : []

    // Debug: log sample of incoming changes
    if (changes.length > 0) {
      console.log("[v0] [autopilot/trigger] Sample incoming change:", JSON.stringify(changes[0]))
      console.log("[v0] [autopilot/trigger] Sample change keys:", Object.keys(changes[0]))
    }

    if (changes.length === 0) {
      return NextResponse.json({ action: "none", reason: "no changes detected" })
    }

    // 1. Get autopilot config
    const { data: config } = await supabase
      .from("autopilot_configs")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    const mode = config?.mode || "disabled"

    // 2. Deduplication: check if we already processed these exact changes
    const changesHash = hashPriceChanges(changes)
    const { data: existingLog } = await supabase
      .from("autopilot_price_changes")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("changes_hash", changesHash)
      .gte("triggered_at", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()) // within last 3h
      .limit(1)
      .maybeSingle()

    if (existingLog) {
      return NextResponse.json({
        action: "deduplicated",
        reason: "Stesse variazioni gia processate nelle ultime 3 ore",
        mode,
      })
    }

    // 3. Log the change event
    const logEntry: Record<string, any> = {
      hotel_id: hotelId,
      mode,
      changes: changes,
      changes_hash: changesHash,
      notification_sent: false,
      push_sent: false,
    }

    // 4. Execute based on mode
    let action = "logged"
    let pushResult: PushResult | null = null

    // --- ALWAYS storicizza in price_change_log (indipendentemente dal modo) ---
    // rate_id is NOT NULL in the table, so filter out changes without a valid rateId
    const priceChangeLogEntries = changes
      .filter((c: PriceChange) => c.rateId)
      .map((c: PriceChange) => ({
        hotel_id: hotelId,
        room_type_id: c.roomTypeId,
        rate_id: c.rateId,
        occupancy: c.occupancy || 2,
        target_date: c.date,
        old_price: c.currentPrice || null,
        new_price: c.suggestedPrice,
        source: mode === "autopilot" ? "autopilot_push" : mode === "notify" ? "notify" : "calculated",
        action_taken: mode === "autopilot" ? "pms" : mode === "notify" ? "email" : "none",
      }))
    if (priceChangeLogEntries.length > 0) {
      for (let i = 0; i < priceChangeLogEntries.length; i += 100) {
        const batch = priceChangeLogEntries.slice(i, i + 100)
        const { error: logError } = await supabase.from("price_change_log").insert(batch)
        if (logError) console.error(`[autopilot/trigger] Error logging price changes:`, logError.message)
      }
      console.log(`[autopilot/trigger] Logged ${priceChangeLogEntries.length} price changes to price_change_log`)
    }

    if (mode === "disabled") {
      // Solo storicizzazione (gia' fatta sopra), nessuna azione
      action = "stored"
    } else if (mode === "notify") {
      // Send email notification — via guarded sender (kill-switch + debounce
      // 15min + cap cells). FIX storm 12/05/2026.
      const emailResult = await sendPriceChangeEmailGuarded({
        hotelId,
        hotelName: hotelName || "Hotel",
        changes,
        emails: config?.notify_emails || [],
        pushResult: null,
        sourceLabel: "salvataggio prezzi",
      })
      logEntry.notification_sent = emailResult.sent
      // last_notification_at è già aggiornato dal CAS dentro il guard se
      // l'invio è partito; non serve UPDATE qui.

      // Update last_sent_prices so incremental sync knows these were processed
      // Dedup per chiave composita: se changes ha duplicati, ON CONFLICT errora e l'intero batch fallisce.
      const lspMap = new Map<string, any>()
      for (const c of changes as PriceChange[]) {
        if (!c.rateId || !c.roomTypeId || !c.date) continue
        const key = `${c.roomTypeId}|${c.rateId}|${c.occupancy}|${c.date}`
        lspMap.set(key, {
          hotel_id: hotelId,
          room_type_id: c.roomTypeId,
          rate_id: c.rateId,
          occupancy: c.occupancy,
          target_date: c.date,
          last_price: c.suggestedPrice,
          sent_at: new Date().toISOString(),
          source: "notify",
        })
      }
      const lspUpserts = Array.from(lspMap.values())
      for (let i = 0; i < lspUpserts.length; i += 200) {
        const batch = lspUpserts.slice(i, i + 200)
        await supabase.from("last_sent_prices").upsert(batch, {
          onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date",
        })
      }

      action = "notified"
    } else if (mode === "autopilot") {
      // Push prices to PMS
      console.log(`[v0] [autopilot/trigger] Mode=autopilot, pushing ${changes.length} prices to PMS for hotel ${hotelId}`)
      pushResult = await executePricePush(hotelId, changes)
      console.log(`[v0] [autopilot/trigger] Push result:`, JSON.stringify(pushResult))
      logEntry.push_sent = pushResult.success
      logEntry.push_result = pushResult

      if (pushResult.success) {
        await supabase
          .from("autopilot_configs")
          .update({ last_push_at: new Date().toISOString() })
          .eq("hotel_id", hotelId)
      }
      
      // Update last_sent_prices snapshot after successful push
      if (pushResult.success) {
        // Dedup per chiave composita per evitare ON CONFLICT row-twice error.
        const lspMap = new Map<string, any>()
        for (const c of changes as PriceChange[]) {
          if (!c.rateId || !c.roomTypeId || !c.date) continue
          const key = `${c.roomTypeId}|${c.rateId}|${c.occupancy}|${c.date}`
          lspMap.set(key, {
            hotel_id: hotelId,
            room_type_id: c.roomTypeId,
            rate_id: c.rateId,
            occupancy: c.occupancy,
            target_date: c.date,
            last_price: c.suggestedPrice,
            sent_at: new Date().toISOString(),
            source: "autopilot",
          })
        }
        const lspUpserts = Array.from(lspMap.values())

        for (let i = 0; i < lspUpserts.length; i += 200) {
          const batch = lspUpserts.slice(i, i + 200)
          const { error: lspError } = await supabase
            .from("last_sent_prices")
            .upsert(batch, {
              onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date",
            })
          if (lspError) console.error("[autopilot/trigger] Error upserting last_sent_prices:", lspError.message)
        }
      }

      // Also send email notification for autopilot mode (so the user always
      // receives a recap when prices change, indipendentemente dal fatto che
      // sia stato lui a salvarli o il sync incrementale).
      // Via guarded sender per uniformità con notify mode.
      if (config?.notify_emails?.length > 0) {
        const emailResult = await sendPriceChangeEmailGuarded({
          hotelId,
          hotelName: hotelName || "Hotel",
          changes,
          emails: config.notify_emails,
          pushResult,
          sourceLabel: "salvataggio prezzi",
        })
        logEntry.notification_sent = emailResult.sent
      }
      action = "pushed"
    }

    // 5. Save log
    await supabase.from("autopilot_price_changes").insert(logEntry)

    return NextResponse.json({
      action,
      mode,
      changesCount: changes.length,
      pushResult: pushResult ? {
        success: pushResult.success,
        // deferred = push non eseguito perché un altro invio verso il PMS era
        // già in corso (lock di concorrenza per-hotel). NON è un errore: le
        // righe restano invariate e verranno ripushate al ciclo successivo.
        // Va propagato al client per mostrare un avviso "in coda", non un errore rosso.
        deferred: pushResult.deferred ?? false,
        method: pushResult.method,
        cellsOrRecords: pushResult.cellsOrRecords,
        errors: pushResult.errors,
      } : null,
    })
  } catch (err) {
    console.error("[autopilot/trigger] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

// -----------------------------------------------------------------------
// Execute price push to PMS
// -----------------------------------------------------------------------

async function executePricePush(
  hotelId: string,
  changes: PriceChange[]
): Promise<PushResult> {
  const supabase = await createClient()
  // Get PMS integration config
  const { data: pms } = await supabase
    .from("pms_integrations")
    .select("integration_mode, pms_name, api_key, endpoint_url, property_id, config, gsheet_spreadsheet_id")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .maybeSingle()

  if (!pms) {
    return {
      success: false,
      method: "none",
      cellsOrRecords: 0,
      errors: ["Nessuna integrazione PMS attiva per questo hotel"],
    }
  }

  // Get room type mappings (con range pax per filtro difensivo nel push)
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select(
      "id, code, name, scidoo_room_type_id, brig_room_code, slope_lodging_type_id, min_occupancy, max_occupancy",
    )
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  // Get rate mappings (for Scidoo)
  const { data: rates } = await supabase
    .from("rates")
    .select("id, name, scidoo_rate_id, brig_rate_code, slope_rate_plan_id, parent_rate_id")
    .eq("hotel_id", hotelId)

  return pushPricesToPMS(pms, changes, roomTypes || [], rates || [], {
    hotelId,
    source: "trigger",
  })
}
