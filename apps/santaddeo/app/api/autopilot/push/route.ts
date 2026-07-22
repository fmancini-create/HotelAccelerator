import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { pushPricesToPMS } from "@/lib/pricing/push-prices"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { sendPriceChangeEmailGuarded } from "@/lib/pricing/autopilot-email"

/**
 * POST /api/autopilot/push
 *
 * Manual price push triggered by the "Invia al PMS" button.
 * Always executes regardless of autopilot mode.
 *
 * Body: {
 *   hotelId: string,
 *   changes: PriceChange[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotelId } = body as { hotelId: string }
    let changes = (body as { changes?: PriceChange[] }).changes || []

    if (!hotelId || !changes || !Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: "hotelId and non-empty changes[] required" },
        { status: 400 }
      )
    }

    // FIX 01/05/2026 (incident Massabo' "tutte le tariffe non Standard non
    // aggiornate"): questo endpoint era invocato sia dal browser ("Invia al
    // PMS" su /accelerator/pricing) sia server-to-server da
    // `auto-trigger.ts > executeAutopilotAction` con fetch interno. Il
    // server-to-server NON passa cookie utente, quindi `createClient()` con
    // SSR cookie auth si comportava come anonimo: la SELECT su
    // `pms_integrations` veniva filtrata dalle RLS e ritornava `null`,
    // facendo scattare il 404 "Nessuna integrazione PMS attiva". L'utente
    // vedeva solo la STANDARD ok perche' l'ultimo push valido (30/04 19:08)
    // era riuscito sotto il vecchio path; le modifiche successive sulle
    // altre camere/tariffe non venivano piu' propagate al PMS.
    //
    // Soluzione: distinguere chiamata "interna" (auto-trigger / cron) da
    // chiamata utente. Se arriva un header `X-Internal-Token` valido
    // (CRON_SECRET) saltiamo la auth utente e usiamo direttamente il
    // service role. Altrimenti facciamo `validateHotelAccess` standard.
    // In entrambi i casi tutte le query DB usano SERVICE ROLE per
    // bypassare RLS in modo predicibile (l'ACL e' gia' verificata sopra).
    const internalToken = request.headers.get("x-internal-token")
    const isInternal =
      !!internalToken &&
      !!process.env.CRON_SECRET &&
      internalToken === process.env.CRON_SECRET

    if (!isInternal) {
      const denied = await validateHotelAccess(hotelId)
      if (denied) return denied
    }

    const supabase = await createServiceRoleClient()

    console.log(
      `[v0] [autopilot/push] Push for hotel ${hotelId} with ${changes.length} changes (internal=${isInternal})`
    )

    // Get PMS integration config (service-role: bypassa RLS)
    const { data: pms } = await supabase
      .from("pms_integrations")
      .select("integration_mode, pms_name, api_key, endpoint_url, property_id, config, gsheet_spreadsheet_id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    if (!pms) {
      return NextResponse.json(
        { error: "Nessuna integrazione PMS attiva per questo hotel" },
        { status: 404 }
      )
    }

    // Get room type mappings (con range pax per filtro difensivo nel push)
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select(
        "id, code, name, scidoo_room_type_id, brig_room_code, slope_lodging_type_id, min_occupancy, max_occupancy",
      )
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    // Get rate mappings
    // 23/05/2026 (incident Tenuta Moriano): aggiunto `parent_rate_id` alla
    // SELECT. Le tariffe con parent_rate_id != NULL sono "derivate" (es. Best
    // Rate NR -> Best Rate). Scidoo applicativamente ricalcola le derivate
    // dalla madre AL MOMENTO della pubblicazione: pushando le derivate noi
    // riceviamo `success:true` su tutti i batch ma il PMS sovrascrive con il
    // suo ricalcolo, quindi il nostro prezzo non finisce mai a schermo.
    // La regola operativa e': PUSH SOLO MADRI; le derivate restano
    // responsabilita' del PMS.
    const { data: rates } = await supabase
      .from("rates")
      .select("id, name, scidoo_rate_id, brig_rate_code, slope_rate_plan_id, parent_rate_id")
      .eq("hotel_id", hotelId)

    console.log(`[v0] [autopilot/push] PMS config: pms_name=${pms.pms_name}, integration_mode=${pms.integration_mode}, has_api_key=${!!pms.api_key}, property_id=${pms.property_id}`)
    console.log(`[v0] [autopilot/push] Room types: ${(roomTypes || []).length}, Rates: ${(rates || []).length}`)
    console.log(`[v0] [autopilot/push] Sample change:`, JSON.stringify(changes[0]))

    // FIX 10/05/2026: NON fidarsi del prezzo dal client (state React può essere stale).
    // Re-leggi sempre i prezzi da pricing_grid server-side per garantire che venga
    // pushato esattamente quello che l'utente vede a schermo dopo refresh.
    // Il payload del client serve solo per identificare le celle (rt, rate, occ, date).
    // Caso reale: 10/05/2026 alle 15:29, "Invia al PMS" Massabò ha pushato 100/107/116/126
    // (valori vecchi nel state UI) invece di 154/164/179/194 (pricing_grid attuale post
    // ricalcolo algoritmo delle 14:15).
    const cellKeys = (changes as PriceChange[])
      .filter((c) => c.roomTypeId && c.rateId && c.date && c.occupancy != null)
      .map((c) => `${c.roomTypeId}|${c.rateId}|${c.occupancy}|${c.date}`)
    const uniqueCellKeys = Array.from(new Set(cellKeys))

    // Carica prezzi attuali da pricing_grid in chunk per evitare URL too long con .or()
    const dbPriceMap = new Map<string, number>()
    if (uniqueCellKeys.length > 0) {
      // Estrai tutte le date e (rt,rate,occ) per costruire una query efficiente
      const dateSet = new Set<string>()
      const tripletSet = new Set<string>()
      for (const k of uniqueCellKeys) {
        const [rt, rate, occ, date] = k.split("|")
        dateSet.add(date)
        tripletSet.add(`${rt}|${rate}|${occ}`)
      }
      const dates = Array.from(dateSet)

      // Fetch in chunks da 500 date max (URL safe), CON PAGINAZIONE.
      //
      // BUG FIX 30/06/2026 (incident Tenuta Moriano: 285 celle reali in
      // pricing_grid segnalate "assente in pricing_grid", push falliti
      // permanenti). PostgREST cappa ogni response a 1000 righe di default
      // (PGRST_DB_MAX_ROWS). `pricing_grid` ha ~200 righe per data
      // (room_type × rate × occupancy), quindi anche poche decine di date
      // superano le 1000 righe: senza `.range()` il `dbPriceMap` conteneva
      // SOLO la prima pagina (~1000 righe) e TUTTE le celle oltre quella
      // risultavano `missingInDb` -> scartate dal push -> mai registrate in
      // `last_sent_prices` -> tenute per retry -> fallimento permanente dopo
      // 5 tentativi. Verificato: 74 date Moriano = 14.867 righe grid, ma solo
      // ~1000 finivano nella mappa. Ora paginiamo come altrove nel codebase
      // (vedi `fetchPaginated` in lib/pricing/auto-trigger.ts).
      const PAGE = 1000
      for (let i = 0; i < dates.length; i += 500) {
        const dateChunk = dates.slice(i, i + 500)
        let offset = 0
        while (true) {
          // PAGINAZIONE STABILE: ordinare per la PK UNIVOCA `id`, non per `date`.
          // `date` ha ~200 righe duplicate per valore (room_type × rate × occupancy):
          // con un sort non-univoco Postgres puo' riordinare le righe a pari `date`
          // ai confini di pagina, SALTANDO o DUPLICANDO celle tra una pagina e
          // l'altra -> re-introdurrebbe in modo intermittente il bug "missing
          // cells". `id` (pricing_grid_pkey) garantisce un ordine totale stabile.
          const { data: pgRows, error: pgErr } = await supabase
            .from("pricing_grid")
            .select("room_type_id, rate_id, occupancy, date, price")
            .eq("hotel_id", hotelId)
            .in("date", dateChunk)
            .order("id", { ascending: true })
            .range(offset, offset + PAGE - 1)
          if (pgErr) {
            console.error(`[v0] [autopilot/push] pricing_grid fetch error:`, pgErr.message)
            break
          }
          for (const r of pgRows || []) {
            const k = `${r.room_type_id}|${r.rate_id}|${r.occupancy}|${r.date}`
            dbPriceMap.set(k, Number(r.price))
          }
          if (!pgRows || pgRows.length < PAGE) break // ultima pagina
          offset += pgRows.length
        }
      }
    }

    // Ricostruisci changes con prezzi autoritativi dal DB
    const authoritativeChanges: PriceChange[] = []
    let staleCorrections = 0
    let missingInDb = 0
    for (const c of changes as PriceChange[]) {
      if (!c.roomTypeId || !c.rateId || !c.date || c.occupancy == null) continue
      const k = `${c.roomTypeId}|${c.rateId}|${c.occupancy}|${c.date}`
      const dbPrice = dbPriceMap.get(k)
      if (dbPrice == null) {
        missingInDb++
        continue
      }
      if (Number(c.suggestedPrice) !== dbPrice) staleCorrections++
      authoritativeChanges.push({ ...c, suggestedPrice: dbPrice })
    }
    if (staleCorrections > 0 || missingInDb > 0) {
      console.log(
        `[v0] [autopilot/push] Authoritative DB read: corrected ${staleCorrections} stale prices, skipped ${missingInDb} missing cells (received ${changes.length}, pushing ${authoritativeChanges.length})`
      )
    }

    if (authoritativeChanges.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Nessun prezzo da inviare (celle non trovate in pricing_grid)",
      }, { status: 400 })
    }

    // Sostituisci changes con la versione autoritative per push e logging successivo
    changes = authoritativeChanges as any

    // 23/05/2026 (incident Tenuta Moriano): scarta le tariffe DERIVATE prima
    // del push. Senza questo filtro Scidoo accetta i batch ma poi sovrascrive
    // le figlie ricalcolandole dalla madre, e il pannello PMS resta sui
    // prezzi vecchi nonostante 200 OK su tutti i batch.
    const derivedRateIds = new Set(
      ((rates || []) as Array<{ id: string; parent_rate_id: string | null }>)
        .filter((r) => r.parent_rate_id != null)
        .map((r) => r.id),
    )
    let derivedSkipped = 0
    // FIX 29/06/2026: traccia le CHIAVI delle celle derivate saltate. Lo skip
    // delle derivate e' VOLUTO (Scidoo le ricalcola dalla madre), quindi il
    // caller (auto-trigger) deve poterle marcare action_taken='pms' anche se
    // non finiscono in last_sent_prices. Le ritorniamo nel body cosi' il
    // caller marca con precisione (vedi `recordedCellKeys` sotto).
    const derivedSkippedCellKeys: string[] = []
    if (derivedRateIds.size > 0) {
      const beforeFilter = changes.length
      for (const c of changes as PriceChange[]) {
        if (derivedRateIds.has(c.rateId) && c.roomTypeId && c.rateId && c.date) {
          derivedSkippedCellKeys.push(
            `${c.roomTypeId}|${c.rateId}|${c.occupancy || 2}|${c.date}`,
          )
        }
      }
      changes = (changes as PriceChange[]).filter((c) => !derivedRateIds.has(c.rateId)) as any
      derivedSkipped = beforeFilter - changes.length
      if (derivedSkipped > 0) {
        console.log(
          `[v0] [autopilot/push] Skip derivate: ${derivedSkipped} righe (su ${beforeFilter}) - pushing solo tariffe madri`,
        )
      }
    }

    if (changes.length === 0) {
      // 23/05/2026: caso comune nel push automatico (auto-trigger) quando un
      // recalc tocca SOLO derivate. Non e' un errore: e' un no-op corretto,
      // perche' Scidoo ricalcola le derivate dalla madre. Ritorniamo 200 con
      // pushed=0 e una flag esplicita per non far scattare retry/alert
      // sull'autopilot caller.
      console.log(
        `[v0] [autopilot/push] No-op: tutte le ${derivedSkipped} righe in input erano derivate. Skip silenzioso (Scidoo ricalcola dalla madre).`,
      )
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "all_derived",
        message:
          "Tutte le tariffe nel push erano derivate. Skip automatico: Scidoo ricalcola le derivate dalla madre.",
        pushed: 0,
        derivedSkipped,
        // Marcatura precisa (vedi auto-trigger): niente in last_sent, ma le
        // derivate vanno chiuse come 'pms' (skip voluto, Scidoo le ricalcola).
        recordedCellKeys: [],
        derivedSkippedCellKeys,
      })
    }

    let pushResult: any
    try {
      pushResult = await pushPricesToPMS(pms, changes, roomTypes || [], rates || [], {
        hotelId,
        source: isInternal ? "auto-push" : "manual-push",
      })
    } catch (pushErr) {
      console.error(`[v0] [autopilot/push] pushPricesToPMS threw:`, pushErr)
      return NextResponse.json({ success: false, error: pushErr instanceof Error ? pushErr.message : "Errore push PMS" }, { status: 500 })
    }
    
    console.log(`[v0] [autopilot/push] Push result: success=${pushResult.success}, method=${pushResult.method}, records=${pushResult.cellsOrRecords}`)

    // DEFERRED (FIX 04/07/2026): un altro push per questo hotel era gia' in
    // corso (lock di concorrenza). NON registriamo nulla (ne' last_sent_prices,
    // ne' price_change_log, ne' email): le righe restano invariate e verranno
    // riprovate al prossimo giro. Status 200 + deferred:true cosi' il caller
    // (auto-trigger) NON marca le righe failed (no retry-budget) ne' 'pms'.
    if (pushResult?.deferred) {
      console.warn("[v0] [autopilot/push] Push deferred (lock occupato): nessuna scrittura, ritento al prossimo giro.")
      return NextResponse.json(
        {
          success: false,
          deferred: true,
          method: pushResult.method,
          cellsOrRecords: 0,
          errors: pushResult.errors || [],
        },
        { status: 200 },
      )
    }

    // Log the manual push in autopilot_price_changes
    await supabase.from("autopilot_price_changes").insert({
      hotel_id: hotelId,
      mode: "manual",
      changes,
      changes_hash: null,
      notification_sent: false,
      push_sent: pushResult.success,
      push_result: pushResult,
    })

    // FIX 29/06/2026: chiavi delle celle REALMENTE registrate in
    // last_sent_prices (cioe' confermate inviate al PMS). Il caller
    // (auto-trigger) marca action_taken='pms' SOLO queste + le derivate
    // saltate, lasciando 'none' (per il retry) le eventuali celle non
    // registrate. Risolve il drift "riga marcata pms ma last_sent stale".
    let recordedCellKeys: string[] = []

    // Update last_sent_prices snapshot after successful push
    if (pushResult.success) {
      // CRITICO: dedup per chiave composita prima dell'upsert.
      // Se changes contiene duplicati su (hotel,room,rate,occ,target_date), Postgres errora
      // "ON CONFLICT DO UPDATE command cannot affect row a second time" e l'INTERO batch fallisce.
      // Tieni l'ultimo valore (più recente nel payload).
      const lspMap = new Map<string, any>()
      for (const c of changes as PriceChange[]) {
        if (!c.rateId || !c.roomTypeId || !c.date) continue
        const key = `${c.roomTypeId}|${c.rateId}|${c.occupancy || 2}|${c.date}`
        lspMap.set(key, {
          hotel_id: hotelId,
          room_type_id: c.roomTypeId,
          rate_id: c.rateId,
          occupancy: c.occupancy || 2,
          target_date: c.date,
          last_price: c.suggestedPrice,
          sent_at: new Date().toISOString(),
          source: "manual_push",
        })
      }
      const lspUpserts = Array.from(lspMap.values())
      recordedCellKeys = Array.from(lspMap.keys())

      for (let i = 0; i < lspUpserts.length; i += 200) {
        const batch = lspUpserts.slice(i, i + 200)
        const { error: lspError } = await supabase
          .from("last_sent_prices")
          .upsert(batch, {
            onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date",
          })
        if (lspError) console.error("[autopilot/push] Error upserting last_sent_prices:", lspError.message)
      }
    }

    // Log every price change in price_change_log for history tracking (regardless of push success)
    // rate_id is NOT NULL in the table, so filter out changes without a valid rateId
    //
    // FIX 02/05/2026 (incident "9 mail Massabo' di notte + 3 INSERT identici per
    // ogni variazione"): quando questo route e' chiamato server-to-server da
    // `executeAutopilotAction` (header X-Internal-Token), le righe in
    // `price_change_log` ESISTONO GIA' (sono state inserite da
    // `recalculate-queued-prices` o da `pricing-grid POST` prima del fire-
    // and-forget). `executeAutopilotAction` le UPDATE-a poi a
    // `action_taken='pms'`. Inserire DI NUOVO le stesse righe qui (con
    // source='manual_push') generava DUPLICATI: per ogni variazione
    // logica reale, in DB comparivano fino a 3 righe distinte (1
    // algo_param_change/none + 1 algo_param_change/pms + 1 manual_push/pms).
    // Conseguenze: coverage report distorto, report giornaliero che
    // segnala "modifiche in attesa" fasulle, mail con conteggi gonfiati.
    //
    // Insert qui SOLO se la chiamata viene dalla UI utente ("Invia al PMS"
    // su /accelerator/pricing). Altrimenti skip — chi ha chiamato gestisce
    // gia' la persistenza.
    if (!isInternal) {
      const priceChangeLogs = changes
        .filter((c: any) => c.rateId)
        .map((c: any) => ({
          hotel_id: hotelId,
          room_type_id: c.roomTypeId,
          rate_id: c.rateId,
          occupancy: c.occupancy || 2,
          target_date: c.date,
          old_price: c.currentPrice || null,
          new_price: c.suggestedPrice,
          source: pushResult.success ? "manual_push" : "manual_push_failed",
          action_taken: pushResult.success ? "pms" : "none",
        }))

      if (priceChangeLogs.length > 0) {
        for (let i = 0; i < priceChangeLogs.length; i += 100) {
          const batch = priceChangeLogs.slice(i, i + 100)
          const { error: logErr } = await supabase.from("price_change_log").insert(batch)
          if (logErr) console.error("[autopilot/push] Error logging price changes:", logErr.message)
        }
      }
    } else {
      console.log(
        "[v0] [autopilot/push] Internal call: skipping price_change_log insert (rows already exist via caller).",
      )
    }

    // Invia email di notifica se l'autopilot ha email configurate.
    //
    // FIX 02/05/2026 v2 (incident "5 mail Massabo' tra 00:02 e 02:00,
    // tutte etichettate 'push manuale' mentre l'utente dormiva"):
    //
    // 1) **Etichetta corretta**: prima il sourceLabel era hardcoded
    //    "push manuale" anche per chiamate server-to-server da
    //    `executeAutopilotAction` (cron `process-pricing-queue` ->
    //    autopilot mode -> /api/autopilot/push con X-Internal-Token).
    //    Ora deriviamo dall'header `isInternal`:
    //      - manuale (UI utente "Invia al PMS"): "push manuale"
    //      - automatico (cron post-recalc): "automatico (recalc post-sync)"
    //
    // 2) **Debounce piu' lungo per push automatici**: i push manuali
    //    restano a 60s (l'utente puo' rifare un click legittimo dopo
    //    1 minuto). I push automatici da cron usano 30 minuti: cosi'
    //    se 5 sync consecutivi (ogni 15min) producono variazioni, esce
    //    al massimo 1 email ogni 30 min — circa 2 email/h invece di 4.
    //    Il PMS riceve comunque tutti i push (questo NON limita la
    //    propagazione al PMS, solo le email aggregate).
    if (pushResult.success) {
      try {
        const { data: apConfig } = await supabase
          .from("autopilot_configs")
          .select("notify_emails, last_notification_at")
          .eq("hotel_id", hotelId)
          .maybeSingle()

        const notifyEmails = (apConfig?.notify_emails as string[] | null | undefined) ?? []
        if (notifyEmails.length > 0) {
          // Finestra di debounce: 60s per manuale, 30min per automatico.
          const debounceMs = isInternal ? 30 * 60_000 : 60_000
          const debounceLabel = isInternal ? "30min" : "60s"
          const debounceCutoff = new Date(Date.now() - debounceMs).toISOString()
          const acquireLockNow = new Date().toISOString()
          const { data: locked, error: lockError } = await supabase
            .from("autopilot_configs")
            .update({ last_notification_at: acquireLockNow })
            .eq("hotel_id", hotelId)
            .or(`last_notification_at.is.null,last_notification_at.lt.${debounceCutoff}`)
            .select("hotel_id")

          const lockAcquired = !lockError && Array.isArray(locked) && locked.length > 0
          if (!lockAcquired) {
            console.log(
              `[v0] [autopilot/push] Skipping email: debounce ${debounceLabel} not acquired (isInternal=${isInternal})`,
            )
            return NextResponse.json({
              success: pushResult.success,
              method: pushResult.method,
              cellsOrRecords: pushResult.cellsOrRecords,
              errors: pushResult.errors,
              warnings: pushResult.warnings,
              emailSkipped: `debounce_${debounceLabel}`,
              recordedCellKeys,
              derivedSkippedCellKeys,
            })
          }

          const { data: hotelRow } = await supabase
            .from("hotels")
            .select("name")
            .eq("id", hotelId)
            .maybeSingle()

          // FIX 01/05/2026 (incident "tutti i valori Attuali = N/D" sulla
          // mail Massabò 19:32): il client passa `currentPrice: null` per
          // le righe che la pricing-grid in memoria non ha ancora
          // confrontato. Lato server abbiamo `last_sent_prices` con
          // l'ultimo prezzo pushato per ogni (room_type, rate, occ, date):
          // popoliamo currentPrice da li' prima di mandare la mail.
          const enrichedChanges = await enrichChangesWithLastSent(
            supabase,
            hotelId,
            changes,
          )

          // Etichetta source-aware: l'utente capisce subito se la mail e'
          // arrivata perche' lui ha cliccato "Invia" o perche' il sistema
          // ha pushato in automatico dopo un sync ETL.
          const sourceLabel = isInternal
            ? "automatico (recalc post-sync)"
            : "push manuale"

          // FIX storm 12/05/2026: via guarded sender.
          // - isInternal=true (chiamata da auto-trigger.ts recalc automatico) →
          //   applica debounce 15min per evitare duplicate vs altri path.
          // - isInternal=false (click utente "Invia al PMS") → bypassDebounce
          //   perche' e' una conferma di azione manuale esplicita; il debounce
          //   farebbe sparire la conferma del push appena richiesto.
          await sendPriceChangeEmailGuarded(
            {
              hotelId,
              hotelName: hotelRow?.name || "Hotel",
              changes: enrichedChanges,
              emails: notifyEmails,
              pushResult,
              sourceLabel,
            },
            { bypassDebounce: !isInternal },
          )
        }
      } catch (emailErr) {
        console.error("[autopilot/push] Email notification error:", emailErr)
      }
    }

    return NextResponse.json({
      success: pushResult.success,
      method: pushResult.method,
      cellsOrRecords: pushResult.cellsOrRecords,
      errors: pushResult.errors,
      // FIX 29/06/2026: chiavi confermate (last_sent) + derivate saltate, per
      // la marcatura precisa di action_taken nel caller (auto-trigger).
      recordedCellKeys,
      derivedSkippedCellKeys,
    })
  } catch (err) {
    console.error("[autopilot/push] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

/**
 * Arricchisce un array di PriceChange con il prezzo precedente leggendo
 * `last_sent_prices`. Le righe con `currentPrice` gia' valorizzato (>0)
 * vengono lasciate intatte. Le altre vengono cercate per la chiave
 * (room_type_id, rate_id, occupancy, target_date): se trovate, prende
 * `last_price` come `currentPrice` cosi il template email puo' mostrare
 * il delta corretto invece del badge "Nuovo".
 *
 * Pagina sempre in batch < 1000 per rispettare il default cap Supabase
 * (vedi memoria `Recalc queue cap-1000`).
 */
async function enrichChangesWithLastSent(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  hotelId: string,
  changes: PriceChange[],
): Promise<PriceChange[]> {
  const needsLookup = changes.filter(
    (c) => (c.currentPrice == null || c.currentPrice <= 0) && c.rateId,
  )
  if (needsLookup.length === 0) return changes

  // Range delle date per restringere la query (anziche' caricare TUTTO
  // last_sent_prices dell'hotel).
  const dates = needsLookup.map((c) => c.date).filter(Boolean).sort()
  const dateFrom = dates[0]
  const dateTo = dates[dates.length - 1]
  if (!dateFrom || !dateTo) return changes

  const PAGE = 1000
  const lspRows: Array<{
    room_type_id: string
    rate_id: string
    occupancy: number
    target_date: string
    last_price: number | null
  }> = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("last_sent_prices")
      .select("room_type_id, rate_id, occupancy, target_date, last_price")
      .eq("hotel_id", hotelId)
      .gte("target_date", dateFrom)
      .lte("target_date", dateTo)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error("[autopilot/push] enrich lookup error:", error.message)
      return changes
    }
    if (!data || data.length === 0) break
    lspRows.push(...(data as typeof lspRows))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Indicizziamo per chiave composta. occupancy default 2 come nel resto
  // della pipeline (Scidoo memorizza il BAR su pax=2 quando non specificato).
  const keyOf = (rt: string, rate: string, occ: number, d: string) =>
    `${rt}|${rate}|${occ}|${d}`
  const lspMap = new Map<string, number>()
  for (const r of lspRows) {
    if (r.last_price != null && r.last_price > 0) {
      lspMap.set(
        keyOf(r.room_type_id, r.rate_id, r.occupancy, r.target_date),
        r.last_price,
      )
    }
  }

  let enrichedCount = 0
  const out = changes.map((c) => {
    if (c.currentPrice != null && c.currentPrice > 0) return c
    if (!c.rateId) return c
    const k = keyOf(c.roomTypeId, c.rateId, c.occupancy ?? 2, c.date)
    const prev = lspMap.get(k)
    if (prev != null) {
      enrichedCount++
      return { ...c, currentPrice: prev }
    }
    return c
  })

  console.log(
    `[autopilot/push] enrichChangesWithLastSent: enriched ${enrichedCount}/${needsLookup.length} rows from last_sent_prices`,
  )
  return out
}
