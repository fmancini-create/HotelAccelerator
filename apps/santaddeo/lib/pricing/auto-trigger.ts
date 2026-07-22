/**
 * Auto-trigger for price recalculation
 *
 * When external data changes (bookings, availability, parameters, manual
 * edits), this module orchestrates the full pricing → push pipeline.
 *
 * ## Flow diagram (29/04/2026)
 *
 *   T1 manual cell save (UI)         T2 algo param change
 *   T3 ETL bookings sync             T4 first sync activation
 *           |                                |
 *           |                                v
 *           |                    triggerPriceRecalculation()
 *           |                                |
 *           |                                v
 *           |                    pricing_recalc_queue (pending)
 *           |                                |
 *           |                                v
 *           |                    drained by /api/cron/sync-and-etl
 *           |                                |
 *           |                                v
 *           |                    recalculate-queued-prices.ts
 *           |                       upsert pricing_grid
 *           |                       insert price_change_log
 *           |                                |
 *           v                                v
 *           +------> executeAutopilotAction(hotel, count, source)
 *                                            |
 *                                            v
 *                       reads price_change_log WHERE source IN [...]
 *                                            |
 *                       +-------------+-------------+-------------+
 *                       v             v             v             v
 *                   mode=notify   mode=autopilot   mode=autopilot+   mode=disabled
 *                   send email    POST push        emails set        nessuna azione
 *                                                  push + email      MA marca come
 *                                                                    'disabled' per
 *                                                                    chiudere la riga
 *
 *                   action_taken='email'  /  ='pms'  /  ='pms' (priorita' azione finale,
 *                   l'email e' confirmation)  /  ='disabled'
 *
 *                   on push failure: retry_count+1, next_retry_at=now()+backoff
 *
 * ## Invariant
 * Every row in price_change_log MUST end up in one of these states:
 *   - action_taken='pms'      (autopilot pushed to PMS, eventualmente + email)
 *   - action_taken='email'    (notify branch sent email)
 *   - action_taken='disabled' (autopilot=disabled: salviamo i prezzi ma non
 *                              facciamo niente di automatico, l'utente li
 *                              spingera' a mano da /accelerator/pricing)
 *   - action_taken='none' AND retry_count<5   (retry pending)
 *   - action_taken='none' AND retry_count>=5 AND next_retry_at IS NULL
 *     (permanently failed, surfaced by /api/cron/pricing-health)
 *
 * Any row stuck at action_taken='none' for more than 6 hours without a
 * scheduled retry is an anomaly and triggers the daily superadmin alert.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { type PriceChange, hashPriceChanges } from "./calculate-suggested-price"
import { sendPriceChangeEmailGuarded } from "./autopilot-email"

/**
 * All source values that the autopilot pipeline considers "user/algo edits"
 * eligible for triggering a PMS push. Manual edits done from the pricing
 * grid UI use these source codes (set by upsert_prices_atomic RPC).
 */
export const MANUAL_EDIT_SOURCES = [
  "manual_grid",
  "drag_fill",
  "bulk_fill",
  "publish_suggested",
] as const

export const ALGO_EDIT_SOURCES = ["algo_param_change", "algorithm"] as const

console.log("[v0-diag] auto-trigger.ts LOADED", new Date().toISOString())

/**
 * Risolve l'app URL per fetch interne, garantendo lo schema https://.
 *
 * BUG FIX 30/04/2026 (pricing health email): l'env var NEXT_PUBLIC_APP_URL
 * su Vercel era impostata come `www.santaddeo.com` SENZA schema. fetch()
 * lancia "TypeError: Failed to parse URL from www.santaddeo.com/..." e
 * ogni push autopilot moriva alla prima riga, accumulando 107 fallimenti
 * permanenti su Tenuta Massabò prima che la mail di health li segnalasse.
 *
 * Logic:
 * 1. Se NEXT_PUBLIC_APP_URL e' valorizzata: aggiungi `https://` se manca.
 * 2. Altrimenti usa VERCEL_URL (sempre senza schema): aggiungi `https://`.
 * 3. Fallback a localhost.
 *
 * Inoltre: rimuove eventuale trailing slash, cosi' i caller possono
 * concatenare `${appUrl}/api/...` senza preoccupazioni.
 */
function resolveAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? process.env.VERCEL_URL.trim() : "") ||
    "http://localhost:3000"
  const withSchema = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withSchema.replace(/\/+$/, "")
}

/**
 * Aggiorna `action_taken` (e altri patch) di N righe `price_change_log`
 * in chunk piccoli, per evitare URL request troppo lunghi.
 *
 * BUG FIX 06/05/2026: PostgREST/Cloudflare ha un limite ~16KB per
 * query string. Un `.in("id", [N UUID])` con N=2000 produce URL di
 * ~80KB e fallisce silenziosamente (errore non lanciato dal client
 * Supabase, righe NON aggiornate). Sintomo concreto: il drain
 * manuale Barronci ha mandato 2 mail con 1000 cambi ciascuna ma
 * `pending_real` è rimasto 62.552 perché le 2000 righe non sono
 * mai state marcate `action_taken='email'` → loop infinito al
 * prossimo drain.
 *
 * Soluzione: chunk da 200 IDs ciascuno (URL ~9KB, safe). Logghiamo
 * ogni chunk e contiamo i fallimenti per non far apparire il successo
 * quando in realtà metà delle righe non sono state aggiornate.
 */
async function markRowsInChunks(
  supabase: any,
  rowIds: string[],
  patch: Record<string, any>,
  chunkSize = 200,
): Promise<{ updated: number; failed: number; firstError?: string }> {
  let updated = 0
  let failed = 0
  let firstError: string | undefined
  for (let i = 0; i < rowIds.length; i += chunkSize) {
    const chunk = rowIds.slice(i, i + chunkSize)
    const { error, count } = await supabase
      .from("price_change_log")
      .update(patch, { count: "exact" })
      .in("id", chunk)
    if (error) {
      failed += chunk.length
      if (!firstError) firstError = error.message
      console.error(
        "[v0] [markRowsInChunks] FAILED chunk",
        Math.floor(i / chunkSize),
        "size:",
        chunk.length,
        "error:",
        error.message,
      )
    } else {
      updated += count ?? chunk.length
    }
  }
  return { updated, failed, firstError }
}

export interface TriggerResult {
  triggered: boolean
  reason: string
  changesCount?: number
  mode?: string
}

/**
 * Trigger price recalculation for a hotel after external data changes.
 * Called by ETL orchestrator after bookings/availability sync.
 * 
 * This function:
 * 1. Checks if hotel has pricing subscription
 * 2. Determines affected date range (next 30 days by default)
 * 3. Inserts item into pricing_recalc_queue with status='pending'
 * 4. The cron job process-pricing-queue will pick it up within 1 minute
 */
export async function triggerPriceRecalculation(
  hotelId: string,
  reason: string = "data_sync",
  dateFrom?: string,
  dateTo?: string
): Promise<{ queued: boolean; queue_id?: string; reason?: string }> {
  console.log("[v0-diag] triggerPriceRecalculation called from .ts", { hotelId, reason, dateFrom, dateTo })
  const supabase = await createServiceRoleClient()

  console.log("[v0] AUTO-TRIGGER: Checking if price recalculation needed for hotel:", hotelId)

  // Check if hotel has active pricing subscription.
  // Schema: accelerator_subscriptions.is_active (boolean). The legacy
  // field name "status" was dropped. Use maybeSingle to tolerate zero rows.
  const { data: subscription, error: subError } = await supabase
    .from("accelerator_subscriptions")
    .select("id, is_active, algorithm_type")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subError) {
    console.error("[v0] AUTO-TRIGGER: subscription lookup error:", subError)
    return { queued: false, reason: "subscription_lookup_error" }
  }
  if (!subscription) {
    console.log("[v0] AUTO-TRIGGER: No active pricing subscription for hotel:", hotelId)
    return { queued: false, reason: "no_active_subscription" }
  }

  // FIX 04/05/2026 (incident "Massabò: prenotazione per 26/06 entrata stanotte
  // su Booking, prezzo correttamente calcolato a UI ma in attesa di invio,
  // autopilot non pusha al PMS, nessuna email"): la causa era qui. Il range
  // di default era solo 30 giorni (today → today+30gg), ma le prenotazioni
  // arrivano routinariamente fino a 12-18 mesi nel futuro. Per booking oltre
  // 30gg il recalc non era mai schedulato → pricing_grid restava al valore
  // vecchio → il push autopilot non scattava (niente da inviare) → nessuna
  // email di conferma.
  //
  // Allungo il default a 540gg (~18 mesi), che copre tutti gli scenari di
  // booking long-tail. Override env-var `PRICING_RECALC_RANGE_DAYS` per
  // emergenze. Il costo incrementale e' contenuto: la paginazione e' gia'
  // attrezzata per migliaia di righe (vedi memoria 01/05/2026), e
  // recalculate-queued-prices skippa le celle senza variazione.
  const RECALC_RANGE_DAYS = Number.parseInt(process.env.PRICING_RECALC_RANGE_DAYS ?? "540", 10) || 540
  const today = new Date()
  const defaultDateFrom = dateFrom || today.toISOString().split("T")[0]
  const defaultDateTo = dateTo || new Date(today.getTime() + RECALC_RANGE_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  // Dedup check. Schema: date_range_start / date_range_end. We avoid
  // enqueuing a new item if another pending one already covers any part
  // of the requested range.
  const { data: existingItems, error: existingErr } = await supabase
    .from("pricing_recalc_queue")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("status", "pending")
    .lte("date_range_start", defaultDateTo)
    .gte("date_range_end", defaultDateFrom)
    .limit(1)

  if (existingErr) {
    console.error("[v0] AUTO-TRIGGER: existing item lookup error:", existingErr)
    // Not fatal, continue to insert.
  }
  if (existingItems && existingItems.length > 0) {
    const existingId = existingItems[0].id
    console.log("[v0] AUTO-TRIGGER: Already pending item exists for hotel:", hotelId, "id:", existingId)
    return { queued: false, reason: "already_pending", queue_id: existingId }
  }

  // Insert new queue item. Schema: date_range_start, date_range_end,
  // trigger_type, trigger_date, status. No "created_at" override — the
  // column is defaulted by the DB, and trigger_date is what the queue
  // consumer orders on.
  const nowIso = new Date().toISOString()
  const { data: queueItem, error: insertError } = await supabase
    .from("pricing_recalc_queue")
    .insert({
      hotel_id: hotelId,
      date_range_start: defaultDateFrom,
      date_range_end: defaultDateTo,
      trigger_type: reason,
      trigger_date: nowIso,
      status: "pending",
    })
    .select("id")
    .single()

  if (insertError) {
    console.error("[v0] AUTO-TRIGGER: Failed to insert queue item:", insertError)
    return { queued: false, reason: "insert_error" }
  }

  console.log("[v0] AUTO-TRIGGER: Queued price recalculation for hotel:", hotelId, "queue_id:", queueItem.id)
  return { queued: true, queue_id: queueItem.id }
}

/**
 * Execute autopilot action (email or push) for a hotel with pre-calculated changes.
 * Called by process-pricing-queue after prices are recalculated and saved.
 * This avoids re-calculating prices and just executes the appropriate action.
 *
 * Based on hotel's autopilot_configs.mode:
 * - "disabled" = do nothing (prices are saved but not sent)
 * - "notify"   = send email notification to configured recipients
 * - "autopilot"= push prices to PMS automatically via /api/autopilot/push
 */
export async function executeAutopilotAction(
  hotelId: string,
  changesCount: number,
  source: string | string[] = "algo_param_change"
): Promise<TriggerResult> {
  const supabase = await createServiceRoleClient()

  // Accept either a single source string (legacy) or an array. Manual edits
  // from the pricing grid UI dispatch under multiple source values
  // (manual_grid, drag_fill, bulk_fill, publish_suggested), so we need to
  // filter price_change_log by IN(...) instead of equality.
  const sources = Array.isArray(source) ? source : [source]

  console.log(
    "[v0] [AutopilotAction] Executing action for hotel:",
    hotelId,
    "with",
    changesCount,
    "changes, sources:",
    sources,
  )

  try {
    // 1. Check autopilot config to determine action
    //
    // FIX 01/05/2026 (incident "due email Villa I Barronci a 14s di distanza"):
    // carichiamo anche `last_notification_at` per il debounce: se in
    // modalita' notify abbiamo gia' inviato un'email per questo hotel
    // negli ultimi 60s, skippiamo il secondo invio (chiusura righe lo
    // stesso). Cosi' gli storm di trigger ravvicinati (algo_param_change
    // dal cron drain queue + algorithm da page-side recalc) producono
    // UNA sola email invece di due.
    const { data: autopilotConfig } = await supabase
      .from("autopilot_configs")
      .select("mode, notify_emails, last_notification_at")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    const rawMode = autopilotConfig?.mode || "disabled"

    // FIX 30/04/2026 (incident Massabo' luglio/agosto 2026):
    // Le righe `manual_push_range_failed` / `manual_push_failed` rappresentano
    // un'azione utente esplicita dalla UI (pulsante "Push range" / "Push").
    // Se l'autopilot e' in modalita' `disabled`, prima il sweep marcava queste
    // righe come `action_taken='disabled'` invece di RIPROVARE il push reale,
    // lasciando i prezzi non consegnati al PMS senza segnalazione visibile.
    //
    // Ora: se TUTTI i sources sono manual_push_*, forziamo il branch
    // autopilot (push diretto) bypassando il mode check. Manual push e'
    // una decisione utente, non automatica: il mode dell'autopilot non si
    // applica.
    const isManualPushRetry =
      sources.length > 0 && sources.every((s) => s.startsWith("manual_push"))
    const mode = isManualPushRetry ? "autopilot" : rawMode

    if (isManualPushRetry) {
      console.log(
        "[v0] [AutopilotAction] Manual push retry detected — forcing push branch (rawMode=" +
          rawMode +
          ")",
      )
    }

    if (mode === "disabled") {
      // BUG FIX 30/04/2026 (Villa I Barronci 1000 pendenti, eta' 404h):
      // Prima questa branch ritornava subito senza toccare price_change_log.
      // Risultato: ogni modifica utente con autopilot disabilitato lasciava
      // una riga `action_taken='none'` per sempre. Si accumulavano in
      // /api/cron/pricing-health come "Modifiche in attesa da molto tempo"
      // e in retryFailedPushes come orfane. Erano FALSI positivi: l'hotel
      // ha autopilot off, l'utente NON vuole azioni automatiche.
      //
      // Ora chiudiamo la riga con `action_taken='disabled'`: lo storage e'
      // avvenuto, nessuna automazione e' richiesta, il monitoring e' pulito.
      // L'utente potra' poi pushare a mano da /accelerator/pricing senza
      // problemi (il push manuale insertira' nuove righe con source
      // 'autopilot_push' che skippano il trigger).
      console.log("[v0] [AutopilotAction] Autopilot disabled, marking rows action_taken='disabled'")

      // FIX 05/05/2026: anche qui via lo slice(0, changesCount), drena tutto.
      // Cap a 5000 (lo stesso del notify batch): mode=disabled non pusha né
      // invia mail, ma deve drenare il backlog il più velocemente possibile
      // per non far crescere a dismisura le righe `none`.
      const { data: rowsToClose } = await supabase
        .from("price_change_log")
        .select("id")
        .eq("hotel_id", hotelId)
        .in("source", sources)
        .eq("action_taken", "none")
        .order("changed_at", { ascending: false })
        .limit(5000)

      const idsToClose = (rowsToClose || []).map((r: any) => r.id as string)
      let closedCount = 0
      if (idsToClose.length > 0) {
        // FIX 10/05/2026: usare markRowsInChunks invece di .in() diretto
        // per evitare "Bad Request" con 1000+ IDs (URL troppo lungo)
        const { updated, failed, firstError } = await markRowsInChunks(
          supabase,
          idsToClose,
          { action_taken: "disabled" },
          200
        )
        if (failed > 0) {
          console.error("[v0] [AutopilotAction] Failed to mark 'disabled':", firstError, `(${failed}/${idsToClose.length} falliti)`)
        }
        closedCount = updated
      }

      return {
        triggered: false,
        reason: `Autopilot disabled (${closedCount} righe chiuse)`,
        mode,
        changesCount: closedCount,
      }
    }

    // FIX 06/05/2026 (incident "drain manuale Barronci dice No changes
    // nonostante 62k pending"): rimosso il guard `if (changesCount === 0)
    // return "No changes"`. Era residuo del vecchio contratto in cui
    // `changesCount` era il limite di processamento via slice(0, N): se 0
    // significava "niente da fare". Dopo il fix del 05/05 `changesCount` è
    // solo un hint del caller, e la VERITÀ è la SELECT più sotto. Il guard
    // early-return rendeva inerte tutto il path di drain manuale (quando
    // l'admin chiama l'endpoint /api/superadmin/pricing/drain-notify) e
    // potenzialmente anche path di sweep edge-case che chiamano la action
    // con count=0. Se la SELECT torna 0 righe, c'è già un return "No
    // changes" più sotto (vedi greenfield-only branch + meaningful empty
    // case). Il flusso giusto è SEMPRE: SELECT → branch in base alla size
    // delle righe pescate, mai uno short-circuit basato su un parametro
    // del caller.

    // 2. Get hotel name
    const { data: hotel } = await supabase
      .from("hotels")
      .select("name")
      .eq("id", hotelId)
      .single()

    const hotelName = hotel?.name || "Hotel"

    // 3. Get the actual changes from price_change_log (recently saved by the
    //    queue processor or by the pricing-grid POST atomic upsert).
    //    Filter `action_taken='none'` to avoid re-pushing rows we already
    //    delivered to PMS or emailed (idempotency for the retry sweep).
    //
    // FIX 01/05/2026 (incident pricing-health Massabò 250 push falliti
    // permanenti con retry_count fino a 39):
    // Escludiamo anche le righe con `retry_count >= 5`. Senza questo filtro
    // ogni nuovo trigger di `executeAutopilotAction` (es. ogni save manuale
    // dell'utente in pricing-grid) ri-pescava le righe failed permanenti,
    // ritentava il push verso il PMS (che restituiva 404 perchè
    // l'integrazione era inattiva al momento del fail originale), e
    // `markPushFailedForRetry` incrementava `retry_count` all'infinito —
    // ben oltre il budget di 5 dichiarato. Le righe permanently-failed
    // devono restare congelate in attesa di intervento manuale.
    //
    // FIX 04/05/2026 (incident "0 email Barronci nonostante 4 prenotazioni
    // con vere variazioni"): la SELECT prendeva top `changesCount + 100`
    // righe ordinate DESC, poi filtrava greenfield in memoria. Quando
    // l'ULTIMO batch del giorno era tutto greenfield (es. ricalcolo che
    // tocca date lontane senza pricing_grid esistente), `meaningfulChanges`
    // risultava vuoto e il branch "Greenfield-only" veniva attivato:
    // marcava le top changesCount come `email` e usciva senza inviare
    // email. Le 55.920 vere variazioni (avg delta +22€) generate prima
    // nello stesso giorno restavano sotto, mai pescate.
    //
    // Soluzione: prendiamo separatamente meaningful (`old_price IS NOT NULL`)
    // e greenfield (`old_price IS NULL`), entrambe ordinate DESC.
    //
    // FIX 05/05/2026 (incident "non arrivano email pricing per giorni
    // nonostante 59k variazioni Barronci pending"): `changesCount` viene
    // dal caller (save manuale pricing-grid, cron drain) ed è il numero
    // di righe NUOVE generate da quella operazione (tipicamente 4-50).
    // Era usato come limite di processamento con `slice(0, changesCount)`,
    // sotterrando l'intero backlog di righe `action_taken='none'`. Quando
    // il backlog cresce (algo_param_change tocca tante celle, push range
    // legacy, retry-fail orfani) le righe vecchie non vengono mai pescate
    // e il sistema sembra "muto" pur avendo migliaia di variazioni reali.
    //
    // FIX 05/05/2026 (parte 2, recovery Barronci 60k pending): separiamo
    // i due cap. Il cap "push Scidoo" (1000) è un vincolo del PMS, non
    // posso superarlo perché il transport rifiuta. Ma il cap "email
    // digest" può essere molto più alto: il template aggrega per data
    // + top 10 stanze, quindi anche 5000 cambi restano leggibili in una
    // tabella di ~540 righe (una per data). Con notify mode=Barronci
    // 60k/5000 = 12 mail in 3h invece di 60 mail in 15h. Per autopilot
    // mode (Massabò) restiamo a 1000 perché poi il push deve passare
    // da `pushPricesToPMS` che ha cap Scidoo 1000.
    const MAX_NOTIFY_BATCH = 5000
    const MAX_PUSH_BATCH = 1000
    const totalLimit = mode === "autopilot" ? MAX_PUSH_BATCH : MAX_NOTIFY_BATCH

    // FIX 06/05/2026: PostgREST/Supabase cappano ogni response a 1000 righe
    // per default (PGRST_DB_MAX_ROWS). Con `.limit(5000)` si ottengono comunque
    // solo 1000 righe. Per superare il cap dobbiamo paginare via `.range()`,
    // facendo round-trip multipli da 1000 finché non raggiungiamo `totalLimit`
    // o finché la pagina non è incompleta (= fine dei dati).
    // Sintomo del bug: drain Barronci con 62k righe pending pescava sempre
    // 1000 + 1000 = 2000 righe invece delle 5000 attese, generando 2 mail
    // identiche da 1000 cambi e poi smettendo nel ciclo successivo perché
    // le stesse 2000 righe restavano `none` (vedi anche fix `markRowsInChunks`).
    const PAGE_SIZE = 1000
    async function fetchPaginated(filter: "meaningful" | "greenfield"): Promise<{ rows: any[]; error: any }> {
      const rows: any[] = []
      let offset = 0
      while (rows.length < totalLimit) {
        const remaining = totalLimit - rows.length
        const pageEnd = offset + Math.min(PAGE_SIZE, remaining) - 1
        let q = supabase
          .from("price_change_log")
          .select(`
            id,
            room_type_id,
            rate_id,
            occupancy,
            target_date,
            old_price,
            new_price
          `)
          .eq("hotel_id", hotelId)
          .in("source", sources)
          .eq("action_taken", "none")
          .lt("retry_count", 5)
          // PAGINAZIONE STABILE (30/06/2026): `changed_at` NON e' univoco - un
          // recalc bulk (es. algo_param_change) inserisce molte righe con lo
          // stesso timestamp. Senza un tiebreaker univoco, ai confini di pagina
          // Postgres puo' riordinare le righe a pari `changed_at`, saltando o
          // duplicando record tra le pagine. Aggiungiamo `id` (PK univoca) come
          // secondo criterio => ordine totale deterministico tra i round-trip.
          .order("changed_at", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, pageEnd)
        q = filter === "meaningful"
          ? q.not("old_price", "is", null)
          : q.is("old_price", null)
        const { data, error } = await q
        // FASE 1 (12/05/2026): Difesa-in-profondità contro righe fantasma
        // (old_price = new_price). Il fix in recalculate-queued-prices.ts
        // previene la CREAZIONE di queste righe da ora in poi, ma residui
        // storici esistono ancora nel DB. Non devono entrare nel ciclo
        // autopilot: senza questo filtro creano loop infinito perché il
        // push al PMS non ha nulla da inviare (0 record) e le righe restano
        // action_taken='none' indefinitamente. Confronto numerico tollerante
        // ai decimali (es. 100.00 vs 100 sono uguali).
        const filteredData = filter === "meaningful" && data
          ? data.filter((r: any) => {
              if (r.old_price === null || r.new_price === null) return true
              return Math.abs(Number(r.old_price) - Number(r.new_price)) > 0.001
            })
          : data
        if (error) return { rows, error }
        if (!filteredData || filteredData.length === 0) break
        rows.push(...filteredData)
        if (!data || data.length < PAGE_SIZE) break // ultima pagina (incompleta)
        offset += data.length
      }
      return { rows, error: null }
    }

    const meaningfulRes = await fetchPaginated("meaningful")
    const meaningfulRows = meaningfulRes.rows
    const meaningfulErr = meaningfulRes.error
    const greenfieldRes = await fetchPaginated("greenfield")
    const greenfieldRows = greenfieldRes.rows
    const greenfieldErr = greenfieldRes.error

    // FIX 06/05/2026 (incident "ancora niente email Barronci dopo i fix
    // di ieri"): logging diagnostico esplicito per capire perche'
    // executeAutopilotAction in modalita' notify torna senza aver inviato
    // mail nonostante la sweep peschi 2000 righe Barronci ogni 15min.
    // Ricontrolliamo size + eventuali errori delle SELECT.
    console.log(
      "[v0] [AutopilotAction] DEBUG SELECT result hotel:",
      hotelId,
      "mode:",
      mode,
      "totalLimit:",
      totalLimit,
      "meaningfulRows.length:",
      meaningfulRows?.length ?? 0,
      "meaningfulErr:",
      meaningfulErr?.message,
      "greenfieldRows.length:",
      greenfieldRows?.length ?? 0,
      "greenfieldErr:",
      greenfieldErr?.message,
    )

    // Mantengo `recentChanges` come unione (meaningful prima, poi greenfield)
    // per non rompere il resto del flusso che si aspetta una sola lista.
    // L'ordine di mid-priority (meaningful first) garantisce che
    // `slice(0, changesCount)` non sotterri mai vere variazioni sotto
    // greenfield.
    const recentChanges = [...(meaningfulRows || []), ...(greenfieldRows || [])]

    // FIX 06/05/2026: guard "VERO" sul vuoto. Sostituisce il vecchio
    // `if (changesCount === 0) return` che era basato su un parametro del
    // caller invece che sul reale stato del DB. Ora se nessuna delle due
    // SELECT ha pescato righe (action_taken='none' E retry_count<5)
    // significa che davvero non c'è backlog né cambi nuovi → esci.
    if (recentChanges.length === 0) {
      console.log(
        "[v0] [AutopilotAction] No pending rows in price_change_log for hotel:",
        hotelId,
        "(SELECT meaningful+greenfield restituisce 0 righe)",
      )
      return { triggered: false, reason: "No pending rows", changesCount: 0, mode }
    }

    // Get room type names for better email display
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name")
      .eq("hotel_id", hotelId)

    const rtMap = new Map((roomTypes || []).map((rt: { id: string; name: string }) => [rt.id, rt.name]))

    // FIX 05/05/2026: niente più slice(0, changesCount). Processiamo tutto
    // il backlog pescato dalla SELECT (cap totalLimit=1000). `changesCount`
    // resta come hint del caller per logging.
    const changes: PriceChange[] = (recentChanges || []).map((c: any) => ({
      date: c.target_date,
      roomTypeId: c.room_type_id,
      roomTypeName: rtMap.get(c.room_type_id) || "",
      rateId: c.rate_id,
      occupancy: c.occupancy,
      currentPrice: c.old_price,
      suggestedPrice: c.new_price,
    }))

    console.log(
      "[v0] [AutopilotAction] Found",
      changes.length,
      "changes to process (caller hinted",
      changesCount,
      "new), mode:",
      mode,
    )

    // 4. Execute the action based on mode
    //
    // FEATURE 30/04/2026: "Tutte e due" supporta la combinazione
    //   mode='autopilot' + notify_emails.length > 0
    // → push al PMS + email di conferma con i prezzi inviati.
    // Il branch 'notify' resta dedicato a soli email senza push.
    if (mode === "notify" && autopilotConfig?.notify_emails && autopilotConfig.notify_emails.length > 0) {
      // FIX 01/05/2026: filtra le righe "greenfield" (currentPrice=null).
      // Sono prezzi calcolati per celle del pricing_grid che erano vuote:
      // tecnicamente non sono "variazioni tariffarie" ma creazioni iniziali.
      // Esempio incident Villa I Barronci 01/05: arrivata email "1000
      // variazioni" con TUTTE le righe Attuale="N/D" (pricing_grid era vuoto
      // dopo modifica algo param), seguita 14s dopo da una "250 variazioni"
      // (queste con prezzo Attuale popolato perche' nel frattempo il primo
      // recalc aveva riempito la grid).
      const meaningfulChanges = changes.filter((c) => c.currentPrice != null)
      const greenfieldCount = changes.length - meaningfulChanges.length

      // Greenfield-only check: niente da notificare se tutte le righe
      // sono nuovi prezzi (no "Attuale -> Suggerito"). Non blocca,
      // chiudiamo come 'email' e usciamo subito.
      if (meaningfulChanges.length === 0) {
        console.log(
          "[v0] [AutopilotAction] Skipping email:",
          `${greenfieldCount} righe greenfield (currentPrice=null), nessuna variazione reale da notificare`,
          "— chiudo lo stesso le righe come 'email'",
        )

        if (recentChanges && recentChanges.length > 0) {
          const result = await markRowsInChunks(
            supabase,
            recentChanges.map((c: any) => c.id),
            { action_taken: "email" },
          )
          console.log(
            "[v0] [AutopilotAction] Marked greenfield-only as 'email':",
            "updated:",
            result.updated,
            "failed:",
            result.failed,
            "firstError:",
            result.firstError,
          )
        }

        return {
          triggered: false,
          reason: `Greenfield-only (${greenfieldCount} righe), email skippata`,
          changesCount: 0,
          mode,
        }
      }

      // FIX 12/05/2026 (incident "email storm Villa I Barronci: 4 email in 6
      // minuti con 420+420+252+966 celle"): il vecchio CAS 60s era troppo
      // corto (Barronci 19:55:48 vs 19:57:19 = 91s → bypassavano) e
      // distribuito su 3 path indipendenti. Ora il debounce CAS è
      // centralizzato in `sendPriceChangeEmailGuarded` con window 15min
      // configurabile (env PRICING_EMAIL_DEBOUNCE_MINUTES) + kill switch
      // globale (env PRICING_EMAIL_PAUSE) + cap cells. La logica
      // "non marcare le righe se debounce attivo" garantisce AGGREGAZIONE
      // naturale: il prossimo cron pesca tutto il backlog accumulato e
      // invia UNA sola email per tutto.
      console.log(
        "[v0] [AutopilotAction] Calling guarded sender hotel:",
        hotelId,
        "meaningfulChanges:",
        meaningfulChanges.length,
        "recipients:",
        autopilotConfig.notify_emails,
      )

      try {
        const guardRes = await sendPriceChangeEmailGuarded({
          hotelId,
          hotelName,
          changes: meaningfulChanges,
          emails: autopilotConfig.notify_emails,
          pushResult: null,
          sourceLabel: sources.join(", ") || undefined,
        })

        console.log(
          "[v0] [AutopilotAction] Guarded sender result hotel:",
          hotelId,
          "reason:",
          guardRes.reason,
          "sent:",
          guardRes.sent,
          "truncated:",
          guardRes.truncated,
        )

        // Quando il guard skippa per debounce/race/kill_switch/send_error
        // lasciamo le righe `action_taken='none'`: saranno ripescate al
        // prossimo cron e aggregate. NON marcare come email è il fix che
        // produce l'aggregazione naturale.
        if (guardRes.reason === "debounce_window" || guardRes.reason === "race_lost") {
          return {
            triggered: false,
            reason: `Skipped: ${guardRes.reason} (rows kept 'none' for aggregation next cycle)`,
            changesCount: 0,
            mode,
          }
        }
        if (guardRes.reason === "kill_switch") {
          return {
            triggered: false,
            reason: "Kill switch ON (PRICING_EMAIL_PAUSE=true) — rows kept 'none'",
            changesCount: 0,
            mode,
          }
        }
        if (guardRes.reason === "send_error" || guardRes.reason === "config_error") {
          return {
            triggered: false,
            reason: `Guard send error: ${guardRes.reason} — rows kept 'none' for retry`,
            changesCount: 0,
            mode,
          }
        }
        // reason === "sent" OR "no_emails": in entrambi i casi marchiamo le
        // righe come 'email' (chiusura idempotente).
        const emailSent = guardRes.sent

        // Log in autopilot_price_changes — calcoliamo hash per dedup
        // cross-path (prima era NULL, vedi diagnosi storm 19:55-19:57).
        await supabase
          .from("autopilot_price_changes")
          .insert({
            hotel_id: hotelId,
            triggered_at: new Date().toISOString(),
            mode: "notify",
            changes: changes,
            changes_hash: hashPriceChanges(changes),
            notification_sent: emailSent,
            push_sent: false,
          })

        // Update action_taken in price_change_log per TUTTE le righe processate.
        // FIX 06/05/2026: chunked update per evitare URL troppo lunghi
        // (>16KB) che PostgREST/Cloudflare scarta silenziosamente. Senza
        // questo fix, il drain Barronci mandava la mail ma le righe
        // restavano `none` → loop infinito di mail duplicate.
        if (recentChanges && recentChanges.length > 0) {
          const markResult = await markRowsInChunks(
            supabase,
            recentChanges.map((c: any) => c.id),
            { action_taken: "email" },
          )
          console.log(
            "[v0] [AutopilotAction] Marked rows as 'email' after notify:",
            "updated:",
            markResult.updated,
            "failed:",
            markResult.failed,
            "of total:",
            recentChanges.length,
            "firstError:",
            markResult.firstError,
          )
          if (markResult.failed > 0) {
            console.error(
              "[v0] [AutopilotAction] WARNING:",
              markResult.failed,
              "righe NON sono state marcate 'email' — verranno ri-pescate al prossimo drain (mail duplicate possibili).",
            )
          }
        }

        return { triggered: true, reason: "Email notification sent", changesCount: changes.length, mode }
      } catch (emailError) {
        console.error("[v0] [AutopilotAction] Error in email flow:", emailError)
        return { triggered: false, reason: "Email error: " + (emailError instanceof Error ? emailError.message : "Unknown"), mode }
      }
    } else if (mode === "autopilot") {
      console.log("[v0] [AutopilotAction] Pushing to PMS via autopilot/push")

      const appUrl = resolveAppUrl()

      // Capture ids upfront so both success and failure branches can update
      // the same rows in price_change_log (retry tracking).
      // FIX 05/05/2026: niente slice(0, changesCount); pushiamo tutto il
      // backlog pescato (cap totalLimit=1000 dalla SELECT). Drenare il
      // backlog in una sola call invece che in centinaia.
      const idsBeingPushed = (recentChanges || []).map((c: any) => c.id)

      try {
        // FIX 01/05/2026 (incident Massabo' "tariffe non Standard non
        // aggiornate"): /api/autopilot/push usava `createClient()` con
        // SSR cookie auth. Le chiamate server-to-server da qui non
        // hanno cookie utente, quindi RLS su `pms_integrations` rifiutava
        // la SELECT e il route ritornava 404 "Nessuna integrazione PMS
        // attiva". Ora il route accetta un header `X-Internal-Token` con
        // il valore di CRON_SECRET come bypass auth (e usa service role
        // per le query). Lo passiamo qui per le chiamate interne.
        const internalToken = process.env.CRON_SECRET || ""
        const response = await fetch(`${appUrl}/api/autopilot/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
          },
          body: JSON.stringify({ hotelId, changes }),
        })

        // FIX 30/04/2026: /api/autopilot/push ritorna status 200 anche quando
        // pushPricesToPMS fallisce (es. verifica post-push trova prezzi
        // mancanti su Scidoo, batch parzialmente fallito, strict-success
        // violato). Prima controllavamo solo response.ok e marcavamo le
        // righe come action_taken='pms' anche se success=false: cosi' i
        // fallimenti reali non finivano mai nel retry sweep. Ora dobbiamo
        // SEMPRE leggere il body e controllare result.success.
        if (!response.ok) {
          const errorText = await response.text()
          console.error("[v0] [AutopilotAction] Push HTTP error:", response.status, errorText)
          await markPushFailedForRetry(supabase, idsBeingPushed, `HTTP ${response.status}: ${errorText.slice(0, 500)}`)
          return { triggered: false, reason: "Push HTTP failed: " + errorText, mode }
        }

        const result = await response.json()
        console.log("[v0] [AutopilotAction] Push response:", JSON.stringify(result).slice(0, 500))

        // DEFERRED (FIX 04/07/2026): un altro push per questo hotel era gia' in
        // corso (lock di concorrenza). NON e' un fallimento: le righe restano
        // invariate (action_taken NON cambia) e il prossimo giro le ripesca.
        // Cruciale: NON chiamare markPushFailedForRetry, altrimenti bruciamo il
        // budget di 5 retry e dopo 5 "deferred" le righe verrebbero congelate.
        if (result?.deferred === true) {
          console.warn("[v0] [AutopilotAction] Push RIMANDATO (lock occupato): righe lasciate per il prossimo giro.")
          return { triggered: false, reason: "Push rimandato: altro push in corso per questo hotel", mode }
        }

        // Treat success=false as a failure that must be retried, exactly
        // like an HTTP error. The body's `errors` array carries the actual
        // root cause (verification mismatch, batch reject, etc.) and is
        // persisted in price_change_log.last_error for the superadmin email.
        const pushSucceeded = result?.success === true
        if (!pushSucceeded) {
          const errMsg = Array.isArray(result?.errors) && result.errors.length > 0
            ? result.errors.join(" | ").slice(0, 1000)
            : result?.error || "push success=false senza dettagli"
          console.error("[v0] [AutopilotAction] Push body says NOT successful:", errMsg)
          await markPushFailedForRetry(supabase, idsBeingPushed, errMsg)
          return { triggered: false, reason: "Push not successful: " + errMsg, mode }
        }

        // FIX 01/05/2026 (incident "doppia email su Villa I Barronci"):
        // Il branch autopilot NON manda piu' la mail di conferma da qui.
        // `/api/autopilot/push` (chiamato sopra) la invia gia' tramite
        // `sendPriceChangeEmail` con il pushResult valorizzato. Mantenere
        // entrambe le chiamate generava 2 email back-to-back con template
        // diversi (una con subject Title Case "variazioni tariffarie" e
        // una ALL CAPS "modifiche prezzi suggerite") che confondeva
        // l'utente. Ora c'e' un solo invio per push, da un unico template.
        const confirmEmailSent =
          Array.isArray(autopilotConfig?.notify_emails) &&
          autopilotConfig.notify_emails.length > 0

        // Log in autopilot_price_changes — calcoliamo hash per dedup
        // cross-path (vedi fix storm 12/05/2026).
        await supabase
          .from("autopilot_price_changes")
          .insert({
            hotel_id: hotelId,
            triggered_at: new Date().toISOString(),
            mode: "autopilot",
            changes: changes,
            changes_hash: hashPriceChanges(changes),
            notification_sent: confirmEmailSent,
            push_sent: true,
          })

        // Update action_taken='pms' on the rows we just pushed AND clear
        // any prior retry state so a previously-failing row that finally
        // succeeded shows as resolved. Without this, the price-history
        // tooltip cannot tell which recalcs were forwarded to the PMS
        // and shows "In attesa di invio auto" indefinitely.
        //
        // FIX 16/05/2026 (incident "806 changes pushed but action_taken
        // not updated → loop di re-push ogni 15 min"):
        // .in("id", idsBeingPushed) con 806 UUID produce un PATCH PostgREST
        // con tutti gli id in URL (~30KB). I proxy Vercel/Supabase
        // rifiutano URL > ~8KB con 400 Bad Request → l'UPDATE non avveniva,
        // le righe restavano action_taken=NULL, retryFailedPushes le
        // rimetteva in coda al sweep successivo (cron 15 min) e Scidoo
        // riceveva gli stessi prezzi 96 volte/giorno. Cap 200 id per
        // chunk = URL ~7.5KB, sicuro sotto qualunque proxy limit.
        // FIX 29/06/2026 (incident drift "riga marcata pms ma Scidoo ha il
        // prezzo vecchio"): prima marcavamo TUTTI gli idsBeingPushed come
        // 'pms', anche le celle che /api/autopilot/push aveva SCARTATO
        // (missing in grid) e quindi MAI registrate in last_sent_prices.
        // Quelle righe risultavano "inviate" mentre il PMS aveva un valore
        // diverso, e il recalc (che confronta vs grid, non vs last_sent) non
        // le riaccodava mai -> drift permanente.
        //
        // Ora marchiamo 'pms' SOLO le celle realmente confermate dal push:
        //   - recordedCellKeys: upsertate in last_sent_prices (consegnate)
        //   - derivedSkippedCellKeys: derivate saltate di proposito (Scidoo
        //     le ricalcola dalla madre) -> chiusura legittima
        // Le righe NON confermate (es. missing in grid) restano per il retry.
        //
        // GUARD backward-compat (anti-regressione incident 16/05/2026 "loop
        // re-push"): se la push route NON ritorna ancora questi campi (deploy
        // vecchio), ricadiamo sul comportamento storico (marca tutto 'pms')
        // per non lasciare righe 'none' che il sweep ripusherebbe all'infinito.
        const hasPreciseKeys =
          Array.isArray((result as any)?.recordedCellKeys) ||
          Array.isArray((result as any)?.derivedSkippedCellKeys)

        let idsToMarkPms: string[] = idsBeingPushed
        let idsToRetry: string[] = []

        if (hasPreciseKeys) {
          const confirmedKeys = new Set<string>([
            ...((result as any).recordedCellKeys || []),
            ...((result as any).derivedSkippedCellKeys || []),
          ])
          const keyOf = (c: any) =>
            `${c.room_type_id}|${c.rate_id}|${c.occupancy || 2}|${c.target_date}`
          idsToMarkPms = []
          for (const c of recentChanges || []) {
            if (confirmedKeys.has(keyOf(c))) idsToMarkPms.push(c.id)
            else idsToRetry.push(c.id)
          }
          if (idsToRetry.length > 0) {
            console.warn(
              `[v0] [AutopilotAction] ${idsToRetry.length}/${idsBeingPushed.length} righe NON confermate dal push (non in last_sent ne' derivate) -> tenute per retry invece di marcarle 'pms'`,
            )
          }
        }

        if (idsToMarkPms.length > 0) {
          const CHUNK = 200
          let totalUpdErrors = 0
          for (let i = 0; i < idsToMarkPms.length; i += CHUNK) {
            const slice = idsToMarkPms.slice(i, i + CHUNK)
            const { error: updErr } = await supabase
              .from("price_change_log")
              .update({
                action_taken: "pms",
                next_retry_at: null,
                last_error: null,
              })
              .in("id", slice)
            if (updErr) {
              totalUpdErrors++
              console.error(
                `[v0] [AutopilotAction] Failed to mark action_taken='pms' (chunk ${i}..${i + slice.length}, ${slice.length} ids):`,
                updErr.code,
                updErr.message,
                updErr.details,
              )
            }
          }
          if (totalUpdErrors === 0) {
            console.log(
              `[v0] [AutopilotAction] Marked action_taken='pms' for ${idsToMarkPms.length} rows in ${Math.ceil(idsToMarkPms.length / CHUNK)} chunks`,
            )
          }
        }

        // Celle inviate ma non confermate: pianifica un retry (non sono state
        // davvero consegnate al PMS). Riusa il backoff standard del sweep.
        if (idsToRetry.length > 0) {
          await markPushFailedForRetry(
            supabase,
            idsToRetry,
            "Cella non confermata dal push (assente in pricing_grid o non registrata in last_sent_prices)",
          )
        }

        // Refresh `last_push_at` so monitoring dashboards see the activity.
        // Also bump `last_notification_at` if we sent the confirm email, so
        // the dashboard "Ultima notifica email" reflects the combined flow.
        //
        // FIX 03/05/2026 (incident "Massabò pusha al PMS ma non manda mail"):
        // qui prima si aggiornava `last_sync_at` ma la colonna NON ESISTE.
        // L'UPDATE falliva intero, last_notification_at non veniva mai
        // scritto, e nelle invocazioni successive di /api/autopilot/push il
        // CAS lock vedeva sempre last_notification_at=NULL → ma poi anche
        // dentro /api/autopilot/push lo stesso CAS-update non riusciva a
        // persistere (era il branch notify a sovrascrivere con last_sync_at
        // bug — ora rimosso). Massab�� ha pushato 44 prezzi al PMS oggi senza
        // mai mandare mail. Sostituiamo `last_sync_at` con il
        // semanticamente corretto `last_push_at` (abbiamo appena pushato).
        const syncUpdate: Record<string, string> = {
          last_push_at: new Date().toISOString(),
        }
        if (confirmEmailSent) {
          syncUpdate.last_notification_at = new Date().toISOString()
        }
        const { error: syncUpdErr } = await supabase
          .from("autopilot_configs")
          .update(syncUpdate)
          .eq("hotel_id", hotelId)
        if (syncUpdErr) {
          console.error(
            "[v0] [AutopilotAction] Failed to update autopilot_configs after push:",
            syncUpdErr.message,
          )
        }

        return {
          triggered: true,
          reason: confirmEmailSent ? "Pushed to PMS + email di conferma" : "Pushed to PMS",
          changesCount: changes.length,
          mode,
        }
      } catch (fetchError) {
        console.error("[v0] [AutopilotAction] Error calling push:", fetchError)
        const msg = fetchError instanceof Error ? fetchError.message : "Unknown"
        await markPushFailedForRetry(supabase, idsBeingPushed, msg)
        return { triggered: false, reason: "Push error: " + msg, mode }
      }
    }

    return { triggered: false, reason: "No action taken", mode }
  } catch (error) {
    console.error("[v0] [AutopilotAction] Error:", error)
    return { triggered: false, reason: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Mark a batch of price_change_log rows as failed and schedule a retry.
 *
 * Backoff: exponential (5min, 10min, 20min, 40min, 80min). After 5 attempts
 * the row is left with `next_retry_at = NULL` to signal a permanent failure
 * that should be surfaced to a human via the daily superadmin email.
 *
 * Done in a single UPDATE per id so retry_count is read-then-incremented
 * deterministically for each row (no race conditions because each id is
 * updated once per push attempt).
 */
async function markPushFailedForRetry(
  supabase: any,
  ids: string[],
  errorMessage: string,
): Promise<void> {
  if (!ids || ids.length === 0) return

  // Read current retry counts so we can compute the next backoff window
  // and decide if we've exhausted the budget.
  //
  // FIX 16/05/2026: stesso pattern di chunking del block action_taken='pms'.
  // Su `.in("id", ids)` con N > ~200 UUID l'URL eccede il limite proxy e
  // ritorna 400 → readErr non-null → la funzione esce senza marcare nessuna
  // riga per retry (silenziosamente, perché loggava solo il message).
  const READ_CHUNK = 200
  const currentRows: { id: string; retry_count: number | null }[] = []
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const slice = ids.slice(i, i + READ_CHUNK)
    const { data: chunkRows, error: readErr } = await supabase
      .from("price_change_log")
      .select("id, retry_count")
      .in("id", slice)
    if (readErr) {
      console.error(
        `[v0] [markPushFailedForRetry] Read error (chunk ${i}..${i + slice.length}):`,
        readErr.code,
        readErr.message,
      )
      continue
    }
    if (chunkRows) currentRows.push(...chunkRows)
  }
  if (currentRows.length === 0) return

  const MAX_RETRIES = 5
  const BASE_DELAY_MIN = 5
  const updates = currentRows.map((row: { id: string; retry_count: number | null }) => {
    const currentCount = row.retry_count ?? 0
    const nextCount = currentCount + 1
    let nextRetryAt: string | null = null
    if (nextCount < MAX_RETRIES) {
      // Exponential backoff capped at 80 minutes.
      const delayMin = BASE_DELAY_MIN * Math.pow(2, currentCount)
      nextRetryAt = new Date(Date.now() + delayMin * 60_000).toISOString()
    }
    return { id: row.id, retry_count: nextCount, next_retry_at: nextRetryAt }
  })

  // Batch upserts via individual UPDATE (Supabase doesn't support multi-row
  // UPDATE with different values in a single call). Tolerate per-row errors
  // since logging must not block the main flow.
  await Promise.all(
    updates.map((u: any) =>
      supabase
        .from("price_change_log")
        .update({
          retry_count: u.retry_count,
          next_retry_at: u.next_retry_at,
          last_error: errorMessage.slice(0, 1000),
        })
        .eq("id", u.id),
    ),
  )

  console.log(
    "[v0] [markPushFailedForRetry] Marked",
    ids.length,
    "rows for retry, exhausted:",
    updates.filter((u: any) => u.next_retry_at === null).length,
  )
}

/**
 * Sweep retry-eligible failed pushes and re-invoke executeAutopilotAction
 * for each affected hotel. Called by /api/cron/sync-and-etl every 15min.
 *
 * Returns a summary so the caller can include it in cron logs.
 */
export async function retryFailedPushes(maxRows = 100): Promise<{
  swept: number
  hotelsProcessed: number
  errors: string[]
}> {
  const supabase = await createServiceRoleClient()
  const errors: string[] = []

  // BUG FIX 30/04/2026 (pricing health email - Villa I Barronci 1000
  // pendenti senza retry pianificato):
  // Il sweep originale usava UN'UNICA query con `.lte("next_retry_at", now())`
  // che in Postgres ESCLUDE silenziosamente le righe con `next_retry_at IS
  // NULL` (perche' NULL non e' confrontabile con un timestamp). Risultato:
  // le righe "orfane" — action_taken='none', next_retry_at mai settato,
  // tipicamente per `executeAutopilotAction` morto prima di raggiungere
  // markPushFailedForRetry — non venivano MAI riprese. Si accumulavano
  // all'infinito e finivano solo nell'email diagnostica giornaliera.
  //
  // Ora facciamo DUE query e uniamo i risultati:
  //   A) Schedulate per retry (next_retry_at <= now)
  //   B) Orfane: next_retry_at IS NULL AND changed_at < now()-6h
  //      (la finestra di 6h matcha la soglia "Modifiche in attesa da molto
  //      tempo" usata da coverage-report. Sotto le 6h potrebbero essere
  //      ancora in lavorazione dal trigger originale.)
  const nowIso = new Date().toISOString()
  const sixHoursAgoIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  const halfMaxRows = Math.max(1, Math.floor(maxRows / 2))

  // FIX 11/05/2026: L'approccio precedente (SELECT globale con LIMIT) favoriva
  // gli hotel con più righe vecchie. Barronci con 91k orphan bloccava Massabò
  // (806 orphan) perché il LIMIT si esauriva sulle righe Barronci.
  //
  // Nuovo approccio EQUO:
  // 1. Prima otteniamo gli hotel DISTINTI con righe orphan
  // 2. Per ogni hotel, peschiamo max 200 righe (round-robin)
  // 3. Così ogni hotel ha una chance di essere processato ogni ciclo cron
  const PER_HOTEL_LIMIT = 200

  // Query per scheduled (con next_retry_at)
  const scheduledResp = await supabase
    .from("price_change_log")
    .select("id, hotel_id, source")
    .eq("action_taken", "none")
    .lte("next_retry_at", nowIso)
    .lt("retry_count", 5)
    .order("next_retry_at", { ascending: true })
    .limit(halfMaxRows)

  // Per orphan: prima trova gli hotel distinti
  const { data: orphanHotels } = await supabase
    .from("price_change_log")
    .select("hotel_id")
    .eq("action_taken", "none")
    .is("next_retry_at", null)
    .lt("retry_count", 5)
    .lt("changed_at", sixHoursAgoIso)
    .limit(1000) // safety cap

  const distinctOrphanHotelIds = [...new Set((orphanHotels || []).map(r => r.hotel_id as string))]

  // Per ogni hotel, pesca max PER_HOTEL_LIMIT righe
  const orphanRows: Array<{ id: string; hotel_id: string; source: string }> = []
  for (const hotelId of distinctOrphanHotelIds) {
    if (orphanRows.length >= halfMaxRows) break
    const { data } = await supabase
      .from("price_change_log")
      .select("id, hotel_id, source")
      .eq("hotel_id", hotelId)
      .eq("action_taken", "none")
      .is("next_retry_at", null)
      .lt("retry_count", 5)
      .lt("changed_at", sixHoursAgoIso)
      .order("changed_at", { ascending: true })
      .limit(Math.min(PER_HOTEL_LIMIT, halfMaxRows - orphanRows.length))
    if (data) orphanRows.push(...(data as any))
  }

  const orphanResp = { data: orphanRows, error: null }

  if (scheduledResp.error) {
    console.error(
      "[v0] [retryFailedPushes] Scheduled query error:",
      scheduledResp.error.message,
    )
    errors.push(`scheduled: ${scheduledResp.error.message}`)
  }
  if (orphanResp.error) {
    console.error(
      "[v0] [retryFailedPushes] Orphan query error:",
      orphanResp.error.message,
    )
    errors.push(`orphan: ${orphanResp.error.message}`)
  }

  // De-duplichiamo per id (evita double-processing nel caso improbabile in
  // cui le due query ritornino la stessa riga in race condition).
  const seenIds = new Set<string>()
  const rows: Array<{ id: string; hotel_id: string; source: string }> = []
  for (const r of [...(scheduledResp.data || []), ...(orphanResp.data || [])]) {
    if (seenIds.has(r.id as string)) continue
    seenIds.add(r.id as string)
    rows.push(r as any)
  }

  if (rows.length === 0) {
    return { swept: 0, hotelsProcessed: 0, errors }
  }

  console.log(
    "[v0] [retryFailedPushes] sweep",
    "scheduled:",
    scheduledResp.data?.length ?? 0,
    "orphans:",
    orphanResp.data?.length ?? 0,
    "total:",
    rows.length,
  )

  // Group by hotel, splitting manual_push_* from autopilot-managed sources.
  //
  // FIX 30/04/2026 (incident Massabo'): le manual_push_* devono essere
  // riprovate come push reale anche se autopilot=disabled (l'utente le ha
  // richieste esplicitamente dalla UI). Le altre source restano governate
  // dal mode dell'autopilot. Se un hotel ha entrambi i tipi di righe failed
  // chiamiamo `executeAutopilotAction` due volte (una per gruppo).
  const byHotel = new Map<
    string,
    { manualPush: Set<string>; automated: Set<string> }
  >()
  for (const row of rows) {
    const key = row.hotel_id as string
    if (!byHotel.has(key)) byHotel.set(key, { manualPush: new Set(), automated: new Set() })
    const bucket = byHotel.get(key)!
    if ((row.source as string).startsWith("manual_push")) {
      bucket.manualPush.add(row.source as string)
    } else {
      bucket.automated.add(row.source as string)
    }
  }

  let hotelsProcessed = 0
  for (const [hotelId, { manualPush, automated }] of byHotel) {
    for (const sourceSet of [manualPush, automated]) {
      if (sourceSet.size === 0) continue
      const sources = Array.from(sourceSet)
      const countForGroup = rows.filter(
        (r: any) => r.hotel_id === hotelId && sourceSet.has(r.source),
      ).length
      try {
        const result = await executeAutopilotAction(hotelId, countForGroup, sources)
        console.log(
          "[v0] [retryFailedPushes] hotel:",
          hotelId,
          "group:",
          sourceSet === manualPush ? "manual" : "automated",
          "sources:",
          sources,
          "count:",
          countForGroup,
          "result:",
          result.reason,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown"
        errors.push(`${hotelId}: ${msg}`)
      }
    }
    hotelsProcessed++
  }

  return { swept: rows.length, hotelsProcessed, errors }
}

/**
 * @deprecated 01/05/2026 — sostituito da `sendPriceChangeEmail` di
 * autopilot-email.ts per consolidare i template HTML in uno solo. Mantenuto
 * temporaneamente come dead-code in attesa che eventuali path esterni siano
 * migrati; rimuovere alla prossima ondata di pulizia.
 */
async function _deprecatedSendNotificationEmail(args: {
  hotelName: string
  changes: PriceChange[]
  recipients: string[]
  variant: "suggestion" | "pushed"
}): Promise<{ success: boolean; error?: string }> {
  const { hotelName, changes, recipients, variant } = args
  if (recipients.length === 0) return { success: false, error: "no recipients" }

  const appUrl = resolveAppUrl()
  const changesByDate = changes.reduce(
    (acc, c) => {
      if (!acc[c.date]) acc[c.date] = []
      acc[c.date].push(c)
      return acc
    },
    {} as Record<string, PriceChange[]>,
  )

  const isPushed = variant === "pushed"
  const heading = isPushed
    ? `${hotelName} - Prezzi inviati al PMS`
    : `${hotelName} - Notifica Prezzi`
  const intro = isPushed
    ? "I nuovi prezzi sono stati inviati automaticamente al PMS dall'autopilot. Qui sotto il riepilogo per archivio."
    : "L'algoritmo ha calcolato nuovi prezzi suggeriti in base ai dati di occupazione aggiornati."
  const ctaLabel = isPushed ? "Vai alla Griglia Prezzi" : "Vai alla Griglia Prezzi"
  const subjectPrefix = isPushed ? "prezzi inviati al PMS" : "modifiche prezzi suggerite"

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #1e3a5f; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #1e3a5f; color: white; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .date-header { background: #e8f0fe; font-weight: bold; padding: 10px; margin-top: 15px; }
        .price-up { color: #22c55e; }
        .price-down { color: #ef4444; }
        .cta { display: inline-block; background: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${heading}</h1>
      </div>
      <div class="content">
        <div class="summary">
          <h2>Riepilogo Modifiche Prezzi</h2>
          <p><strong>Hotel:</strong> ${hotelName}</p>
          <p><strong>Totale modifiche:</strong> ${changes.length}</p>
          <p><strong>Date coinvolte:</strong> ${Object.keys(changesByDate).length}</p>
        </div>

        <p>${intro}</p>

        ${Object.entries(changesByDate)
          .slice(0, 10)
          .map(
            ([date, dateChanges]) => `
          <div class="date-header">${new Date(date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <table>
            <tr>
              <th>Camera</th>
              <th>Occ.</th>
              <th>Prezzo Attuale</th>
              <th>${isPushed ? "Prezzo Inviato" : "Prezzo Suggerito"}</th>
              <th>Diff.</th>
            </tr>
            ${dateChanges
              .slice(0, 10)
              .map((c: PriceChange) => {
                // BUG FIX 30/04/2026 (email Villa I Barronci 1000 modifiche
                // con "Prezzo Attuale: -" e "Diff: 0.00€"): per le celle
                // mai pushate prima `c.currentPrice` e' null (lookup su
                // pricing_grid pre-write non trova nulla). Prima
                // mostravamo "-" + "0.00€" che era confondente: l'utente
                // pensava che il prezzo non fosse cambiato. Ora:
                //   - "Prezzo Attuale" = "Nuovo" se null (chiaro: e'
                //     proprio una cella nuova, non c'era prezzo prima)
                //   - "Diff" = "—" se null (niente confronto possibile,
                //     non dire "0.00€" che e' sbagliato)
                const hasCurrent = c.currentPrice != null
                const diff = hasCurrent ? c.suggestedPrice - (c.currentPrice as number) : null
                const diffClass = diff != null && diff > 0 ? "price-up" : diff != null && diff < 0 ? "price-down" : ""
                const diffCell =
                  diff == null
                    ? "—"
                    : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}&euro;`
                return `
                <tr>
                  <td>${c.roomTypeName}</td>
                  <td>${c.occupancy}</td>
                  <td>${hasCurrent ? `&euro;${(c.currentPrice as number).toFixed(2)}` : '<em style="color:#888">Nuovo</em>'}</td>
                  <td>&euro;${c.suggestedPrice.toFixed(2)}</td>
                  <td class="${diffClass}">${diffCell}</td>
                </tr>
              `
              })
              .join("")}
            ${dateChanges.length > 10 ? `<tr><td colspan="5"><em>...e altre ${dateChanges.length - 10} modifiche</em></td></tr>` : ""}
          </table>
        `,
          )
          .join("")}

        ${Object.keys(changesByDate).length > 10 ? `<p><em>...e altre ${Object.keys(changesByDate).length - 10} date con modifiche</em></p>` : ""}

        ${
          isPushed
            ? `<p style="margin-top: 20px;"><strong>Nota:</strong> i prezzi sono gia' attivi sul PMS. Questa email serve da archivio della modifica.</p>`
            : `<p style="margin-top: 20px;"><strong>Nota:</strong> i prezzi sono stati salvati nella griglia prezzi. Per applicarli al PMS, accedi alla dashboard e clicca "Invia al PMS" oppure attiva la modalita Autopilot.</p>`
        }

        <a href="${appUrl}/accelerator/pricing" class="cta">${ctaLabel}</a>
      </div>
    </body>
    </html>
  `

  const { sendEmail } = await import("@/lib/email/send-email")
  let anySuccess = false
  let lastError: string | undefined
  for (const email of recipients) {
    try {
      const result = await sendEmail({
        to: email,
        subject: `[${hotelName.toUpperCase()}] ${changes.length} ${subjectPrefix}`,
        html: emailHtml,
      })
      console.log(
        "[v0] [AutopilotAction] Email sent to",
        email,
        ":",
        result.success ? "OK" : result.error,
      )
      if (result.success) anySuccess = true
      else lastError = result.error
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Unknown"
      console.error("[v0] [AutopilotAction] Error sending email to", email, ":", e)
    }
  }
  return anySuccess ? { success: true } : { success: false, error: lastError }
}
