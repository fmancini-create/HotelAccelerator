import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

export const maxDuration = 300

/**
 * Endpoint admin per drenare manualmente le email di notifica pricing
 * di un hotel specifico (o tutti gli hotel notify/autopilot). Utile
 * quando il backlog non si smaltisce automaticamente via cron.
 *
 * POST { hotelId?: string }
 * - se hotelId presente, drena solo quell'hotel
 * - se assente, drena tutti gli hotel con autopilot mode notify/autopilot
 *
 * Per ogni hotel chiama executeAutopilotAction senza changesCount perche'
 * il fix recente ha reso changesCount un mero hint di logging — il
 * processamento reale si basa su MAX_NOTIFY_BATCH=5000 / MAX_PUSH_BATCH=1000.
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sb = await createServiceRoleClient()
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const hotelId: string | undefined = body?.hotelId
    const resetDebounce: boolean = body?.resetDebounce === true

    // Carica gli hotel target
    let configsQuery = sb
      .from("autopilot_configs")
      .select("hotel_id, mode")
      .in("mode", ["notify", "autopilot"])
    if (hotelId) configsQuery = configsQuery.eq("hotel_id", hotelId)
    const { data: configs, error: configsErr } = await configsQuery
    if (configsErr) {
      return NextResponse.json({ error: configsErr.message }, { status: 500 })
    }
    if (!configs || configs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, results: [], note: "Nessun hotel target" })
    }

    // (Opzionale) reset debounce per forzare l'invio immediato bypassando
    // il check `last_notification_at > now()-60s`. Solo se richiesto.
    if (resetDebounce) {
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString()
      const targetIds = configs.map((c) => c.hotel_id)
      await sb
        .from("autopilot_configs")
        .update({ last_notification_at: cutoff })
        .in("hotel_id", targetIds)
      console.log("[v0] [DrainNotify] Debounce reset for hotels:", targetIds, "to", cutoff)
    }

    // Esegue la action per ogni hotel. Importiamo dinamicamente per evitare
    // di portarsi dietro il modulo se l'endpoint non viene chiamato.
    const { executeAutopilotAction } = await import("@/lib/pricing/auto-trigger")

    const results: Array<{ hotelId: string; mode: string; result: unknown; error?: string }> = []
    for (const cfg of configs) {
      try {
        // FIX 06/05/2026 sera: il drain manuale Barronci tornava
        // "No pending rows" nonostante 1176 righe pending nel DB. Causa:
        // tutte le 1176 righe avevano `source='algorithm'` (le variazioni
        // generate dal cron `recalculate-queued-prices` quando ETL/sync
        // produce nuovi prezzi), ma la lista hardcoded includeva solo
        // `algo_param_change` (variazioni generate quando l'admin tocca
        // un parametro algoritmico), `manual`, `import`, `channel_sync`.
        // Risultato: la SELECT escludeva `algorithm` dal filtro IN(...) e
        // pescava 0 righe → "No pending rows" fuorviante.
        // I source che possono finire in `action_taken='none'` come "vere
        // variazioni da notificare" sono (vedi distribuzione DB
        // 06/05/2026):
        //   - algorithm           (cron ricalcolo prezzi)
        //   - algo_param_change   (admin cambia param algoritmico)
        //   - manual_grid         (admin salva manualmente in pricing-grid)
        //   - notify              (legacy pre-fix, può comparire sui dati storici)
        // I source `*_push*` sono tracce di push al PMS, non variazioni
        // che richiedono notify, quindi restano fuori.
        const sources = ["algorithm", "algo_param_change", "manual_grid", "notify"]
        // changesCount = 0 e' OK: il fix recente non lo usa più come limite.
        const result = await executeAutopilotAction(cfg.hotel_id, 0, sources)
        results.push({ hotelId: cfg.hotel_id, mode: cfg.mode, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error("[v0] [DrainNotify] Failed for hotel", cfg.hotel_id, message)
        results.push({ hotelId: cfg.hotel_id, mode: cfg.mode, result: null, error: message })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      resetDebounce,
      results,
    })
  } catch (error) {
    console.error("[v0] [DrainNotify] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
