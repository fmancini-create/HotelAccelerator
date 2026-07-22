// Reusable runner for pricing_recalc_queue.
//
// Originally this lived only inside the GET handler at
// /api/accelerator/process-pricing-queue. That endpoint was meant to be
// invoked by a Vercel cron declared as `* * * * *` in vercel.json, but on
// a Pro plan the per-minute schedule gets silently dropped at cron
// registration time, so the queue was never processed automatically.
//
// Exporting the work as a plain function lets us call it from:
//   - the GET handler above (unchanged external contract)
//   - the sync-and-etl cron (every 15 minutes) so queued recalcs run
//     shortly after the ETL that enqueued them.
//
// Keep this purely async / returns a summary. Do not re-export types
// from the route so the route can continue to live in app/api/*.

import { createServiceRoleClient } from "@/lib/supabase/server"
import { compactSupabaseErrorMessage, logSupabaseError } from "@/lib/supabase/error-utils"
import { recalculatePricesForQueuedItem } from "@/lib/pricing/recalculate-queued-prices"
import { executeAutopilotAction } from "@/lib/pricing/auto-trigger"

export interface ProcessQueueResult {
  processed: number
  succeeded: number
  failed: number
  items: Array<{
    id: string
    status: "completed" | "failed" | "skipped"
    affected_price_changes?: number
    reason?: string
    error?: string
  }>
  message?: string
}

export interface ProcessQueueOptions {
  /** Max items to fetch in one run (default 10, hard cap 50 to respect lambda budget). */
  maxItems?: number
  /** Restrict to a single hotel. Useful to run inline after an ETL cycle. */
  hotelId?: string
}

export async function processPendingPricingQueue(
  opts: ProcessQueueOptions = {},
): Promise<ProcessQueueResult> {
  const limit = Math.max(1, Math.min(opts.maxItems ?? 10, 50))
  // FIX 06/05/2026 sera tardi: questa funzione viene chiamata SOLO da cron
  // lambda (Vercel Cron `process-pricing-queue` e fallback in `sync-and-etl`),
  // mai con cookie utente. Prima usavamo `createClient()` cookie-bound, che
  // funzionava perche' RLS su `pricing_recalc_queue` non era abilitata.
  // Dopo il fix RLS Fase 1 (linter Supabase del 06/05 sera) la tabella ha
  // RLS=ON con sola policy `service_role_full_access`. Risultato: il cron
  // arriva senza session -> client agisce da anon -> SELECT/UPDATE ritornano
  // 0 righe SILENZIOSAMENTE. Le 5 entries pending Massabo/Casanova/Moriano/
  // Barronci/Rondini delle 10:30-13:31 non venivano mai drenate, autopilot
  // non pushava i nuovi prezzi al PMS. Switch a service-role: la function
  // ora ha accesso pieno indipendentemente dalla sessione.
  const supabase = await createServiceRoleClient()

  let query = supabase
    .from("pricing_recalc_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (opts.hotelId) {
    query = query.eq("hotel_id", opts.hotelId)
  }

  const { data: pendingItems, error: fetchError } = await query

  if (fetchError) {
    // FIX 31/05/2026: outage Supabase (gateway Cloudflare 5xx -> HTML).
    // Logga compatto (mai il blob HTML) invece del console.error grezzo.
    logSupabaseError("PRECIO: fetch pending items", fetchError)
    throw new Error(compactSupabaseErrorMessage(fetchError))
  }

  if (!pendingItems || pendingItems.length === 0) {
    console.log("[v0] PRECIO: No pending items to process")
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      items: [],
      message: "No pending items",
    }
  }

  console.log("[v0] PRECIO: Found", pendingItems.length, "pending items")

  const results: ProcessQueueResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    items: [],
  }

  for (const item of pendingItems) {
    try {
      results.processed++

      // Atomic CAS: acquire the lock by moving status pending -> processing
      const { data: acquired, error: updateError } = await supabase
        .from("pricing_recalc_queue")
        .update({
          status: "processing",
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "pending")
        .select()

      if (updateError) {
        console.error("[v0] PRECIO: Error acquiring lock:", updateError)
        results.items.push({ id: item.id, status: "failed", reason: "Lock acquisition error" })
        results.failed++
        continue
      }

      if (!acquired || acquired.length === 0) {
        console.log("[v0] PRECIO: Item already being processed, skipping:", item.id)
        results.items.push({ id: item.id, status: "skipped", reason: "Already processing" })
        continue
      }

      const result = await recalculatePricesForQueuedItem(item)

      if (result.success) {
        results.succeeded++
        results.items.push({
          id: item.id,
          status: "completed",
          affected_price_changes: result.affected_price_changes,
        })
      } else {
        results.failed++
        results.items.push({
          id: item.id,
          status: "failed",
          error: result.error,
        })
      }
    } catch (err) {
      console.error("[v0] PRECIO: Unexpected error processing item:", err)
      results.failed++
      results.items.push({
        id: item.id,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  console.log("[v0] PRECIO: Process complete:", {
    processed: results.processed,
    succeeded: results.succeeded,
    failed: results.failed,
  })

  // After processing, fire autopilot actions per hotel (email / push to PMS)
  if (results.succeeded > 0) {
    const hotelsWithChanges = new Map<string, number>()
    for (const item of pendingItems) {
      const resultItem = results.items.find((r) => r.id === item.id)
      if (resultItem?.status === "completed" && (resultItem.affected_price_changes ?? 0) > 0) {
        const current = hotelsWithChanges.get(item.hotel_id) || 0
        hotelsWithChanges.set(item.hotel_id, current + (resultItem.affected_price_changes ?? 0))
      }
    }

    for (const [hotelId, changesCount] of hotelsWithChanges) {
      try {
        console.log(
          "[v0] PRECIO: Executing autopilot action for hotel:",
          hotelId,
          "with",
          changesCount,
          "changes",
        )
        // FIX 08/05/2026: passare TUTTI i source notificabili, non solo "algo_param_change".
        // Le variazioni possono avere source="algorithm" (cron ricalcolo) o altri source.
        // Se passiamo solo "algo_param_change", le righe con source diverso restano
        // action_taken='none' per sempre → alert pricing-health "Pendenti 1000+".
        const NOTIFIABLE_SOURCES = ["algorithm", "algo_param_change", "manual_grid", "notify"]
        const actionResult = await executeAutopilotAction(hotelId, changesCount, NOTIFIABLE_SOURCES)
        console.log(
          "[v0] PRECIO: Autopilot action result for",
          hotelId,
          ":",
          actionResult.reason,
          "mode:",
          actionResult.mode,
        )
      } catch (err) {
        // Autopilot failure should not break the queue processing
        console.error("[v0] PRECIO: Autopilot action error for hotel:", hotelId, err)
      }
    }
  }

  return results
}
