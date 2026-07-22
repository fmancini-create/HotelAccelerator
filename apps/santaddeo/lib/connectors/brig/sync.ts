import "server-only"
import { createClient } from "@supabase/supabase-js"
import { BrigClient, BrigError, isBrigDailyQuotaExceeded } from "./client"
import { brigStatusToCode } from "./types"
import type {
  BrigPaginatedReservations,
  BrigReservation,
} from "./types"

/**
 * Sync Brig per un singolo hotel.
 *
 * Architettura speculare a `lib/connectors/scidoo/sync.ts`:
 *  1. legge la `pms_integrations` row dell'hotel (deve avere `pms_name='brig'`)
 *  2. costruisce un BrigClient con apiKey + structureId
 *  3. paginazione automatica su `getReservations({ page, pageSize, extra })`
 *  4. upsert idempotente in `connectors.brig_raw_bookings`
 *     chiave naturale: `(hotel_id, brig_reservation_id)`
 *  5. ritorna un report dettagliato
 *
 * Notes:
 *  - Le righe esistenti vengono aggiornate solo se cambia il payload
 *    (`raw_data`). In quel caso `processed=false` viene rimesso a 0 così
 *    l'ETL successivo le rielaborerà.
 *  - Le cancellazioni Brig non eliminano la riga: arrivano come
 *    `originalStatus="Annullata"` o `status=4`. La reconciliation a valle
 *    (bookings-processor) si baserà su questo.
 *  - Limite Brig sandbox: 100 req/giorno per le prenotazioni con max 100
 *    per pagina → max ~10.000 prenotazioni/giorno per struttura.
 */

export interface BrigSyncOptions {
  hotelId: string
  /** Filtri extra inviati nel body POST (es. range date, status, ...). */
  extraFilters?: Record<string, unknown>
  /** Sleep tra pagine (ms). Default 250ms. */
  pageDelayMs?: number
  /** Numero massimo di pagine da scaricare (safety net). Default 200. */
  maxPages?: number
  /** Numero di prenotazioni per pagina (max 100 per Brig). Default 100. */
  pageSize?: number
  /**
   * Dopo quante pagine CONSECUTIVE con 0 insert + 0 update interrompiamo
   * il sync. Default 3.
   *
   * Razionale (24/05/2026): Brig sandbox impone 100 req/giorno per le
   * prenotazioni. Hotel con storico voluminoso (Cavallino: ~2300+
   * reservation) consumavano tutta la quota in un singolo sync paginando
   * fino a pagina 23+ e morendo con HTTP 429. Dopo il primo sync completo
   * pero' le pagine sono per la maggior parte gia' aggiornate: appena
   * incontriamo K pagine consecutive in cui ogni record e' "unchanged"
   * (presente in `connectors.brig_raw_bookings` con `raw_data` identico),
   * possiamo uscire: i record successivi saranno nello stesso stato
   * perche' Brig ritorna l'array sempre nello stesso ordine.
   *
   * Tradeoff: una modifica isolata a pagina 20 senza nessuna nuova
   * reservation in arrivo verrebbe scoperta con ritardo. Per garantire
   * eventual consistency il cron settimanale deve poter forzare un
   * full sync con `forceFullSync: true`.
   *
   * NB: l'early-exit considera "unchanged" anche le pagine completamente
   * vuote (nessun record). In quei casi `extractReservations` ritorna []
   * e il loop usciva gia' col `break` esistente prima del contatore.
   */
  unchangedPageStreakLimit?: number
  /**
   * Se true, disattiva l'early-exit unchanged e pagina fino a maxPages.
   * Utile per:
   *  - cold-start su un nuovo hotel
   *  - resync settimanale forzato per cogliere modifiche storiche
   *  - debug
   */
  forceFullSync?: boolean
  /**
   * Numero MASSIMO di passate complete di paginazione durante un full sweep,
   * usate dal GATE DI COMPLETEZZA anti-deriva (FIX 01/06/2026 incident
   * Cavallino "disponibilita' non torna, 2/80 camere a Ferragosto").
   *
   * PROBLEMA: BRiG cappa `pageSize` a 100 (200+ -> 400 "limit exceeded"),
   * quindi Cavallino richiede ~39 pagine. Il feed
   * `daily-occupancy-filters` NON espone alcun parametro di ordinamento
   * stabile (vedi docs/brig/README.md) e il dataset e' "vivo": durante i
   * ~15-30s del full sweep arrivano/cambiano prenotazioni e i confini di
   * pagina scorrono. Effetto misurato il 01/06: su `totalItems=3839`
   * dichiarati da BRiG, una singola passata scaricava 3836 righe ma con
   * ~578 duplicati -> solo 3258 `_id` DISTINTI memorizzati, cioe' ~581
   * prenotazioni reali (15%) MAI lette. Poiche' la disponibilita' di
   * Cavallino e' DERIVATA dalle reservation (BRiG non ha endpoint
   * availability), ogni prenotazione persa = una camera che risulta
   * erroneamente libera.
   *
   * SOLUZIONE (union multi-pass): durante un full sweep accumuliamo i `_id`
   * DISTINTI visti in tutte le pagine e leggiamo `totalItems` dalla
   * response. Se a fine passata `distinctSeen < totalItems`, ripetiamo la
   * paginazione: ogni passata ha una finestra di deriva diversa quindi
   * cattura righe diverse, e l'UNIONE converge. Ci fermiamo appena
   * `distinctSeen >= totalItems` (completo) o esaurite le passate o
   * esaurita la quota giornaliera. Le righe gia' presenti in DB diventano
   * "unchanged" nelle passate successive (zero upsert), quindi il costo e'
   * solo in chiamate BRiG. Il DB inoltre ACCUMULA tra run: anche una
   * convergenza parziale per-notte riduce il backlog fino a sparire.
   *
   * Default: 3 in full sweep, 1 negli incrementali (dove l'early-exit
   * unchanged-streak mantiene il consumo basso). Il gate NON gira mai
   * negli incrementali per non bruciare quota.
   */
  maxCompletenessPasses?: number
  /**
   * RECUPERO RESUMABILE (FIX 01/06/2026 round 3 — quota BRiG 100 req/giorno).
   *
   * Il gate multi-pass (`maxCompletenessPasses`) puo' richiedere fino a
   * ~117 chiamate in UN solo run (3 passate × ~39 pagine), che con la quota
   * giornaliera a 100 req sfora SEMPRE -> 429 -> il run termina prima di
   * scrivere il marker e ricomincia da zero il giorno dopo: non converge mai.
   *
   * Con `resumable: true` il sync esegue UNA passata budgettata
   * (`maxPagesPerRun` pagine) partendo dalla pagina memorizzata nel cursore
   * `pms_integrations.config.brigSweepCursor`, fa upsert (il DB ACCUMULA tra
   * i run), avanza il cursore e si ferma. La completezza NON e' piu' basata
   * sul set in-memory di una singola invocazione (che si azzera tra i run) ma
   * sul CONTEGGIO REALE delle righe gia' in `connectors.brig_raw_bookings`
   * confrontato con `totalItems` di BRiG. Quando il conteggio DB raggiunge il
   * totale, il cursore viene azzerato e `complete=true`. Cosi' il recupero si
   * completa in piu' run/giorni senza mai sforare la quota.
   *
   * Implica `forceFullSync` (niente early-exit: vogliamo camminare il budget).
   */
  resumable?: boolean
  /**
   * Budget massimo di pagine scaricate in UNA invocazione resumabile.
   * Default 12: lascia margine alla quota giornaliera (100) anche con gli
   * incrementali in parallelo. Ignorato quando `resumable` e' false.
   */
  maxPagesPerRun?: number
  /**
   * FETCH PARTIZIONATO PER DATA (FIX 06/06/2026 — cura definitiva deriva
   * Cavallino). BRiG ha confermato (e abbiamo verificato live sul sandbox) che
   * i filtri data FUNZIONANO se passati con gli OPERATORI:
   *   checkInDate: { from:"2026-06-01", operatorFrom:">=", to:"2026-06-30", operatorTo:"<=" }
   *
   * Invece di paginare la lista GLOBALE (che si ri-ordina tra le richieste →
   * ~15% prenotazioni mai lette su hotel grandi), scarichiamo il dataset in
   * FINESTRE MENSILI sul `checkInDate`. Ogni prenotazione ha ESATTAMENTE un
   * checkin → ogni finestra e' piccola (poche pagine) e la paginazione INTERNA
   * a una finestra e' stabile (niente deriva). L'unione delle finestre = dataset
   * completo, senza buchi e senza duplicati cross-window.
   *
   * Quando true:
   *  - si ignorano il gate di completezza e il cursore resumabile "globale";
   *  - si itera sulle finestre da `partitionFrom` a `partitionTo` (passo
   *    `partitionMonths`), processando al massimo `maxPartitionsPerRun` finestre
   *    per invocazione e salvando un cursore in `config.brigPartitionCursor`;
   *  - `complete=true` quando tutte le finestre del range sono state percorse.
   *
   * Implica `forceFullSync` interno per-finestra (niente early-exit: ogni
   * finestra va percorsa fino in fondo, ma e' corta).
   */
  partitioned?: boolean
  /**
   * Inizio del range partizionato (YYYY-MM-DD, sul checkin). Default: 24 mesi
   * fa dall'inizio del mese corrente (copre storico recente + futuro). Per un
   * recupero storico profondo passare una data piu' arretrata.
   */
  partitionFrom?: string
  /**
   * Fine del range partizionato (YYYY-MM-DD, sul checkin). Default: 18 mesi nel
   * futuro dall'inizio del mese corrente (orizzonte prenotazioni).
   */
  partitionTo?: string
  /** Ampiezza di ogni finestra in mesi. Default 1 (mensile). */
  partitionMonths?: number
  /**
   * Ampiezza di ogni finestra in GIORNI. Se valorizzato, ha PRECEDENZA su
   * `partitionMonths` e le finestre avanzano di N giorni (half-open [start,
   * start+N giorni)) senza ancoraggio al mese.
   *
   * MOTIVAZIONE (FIX 18/06/2026): la paginazione del feed BRiG ha deriva ANCHE
   * dentro la finestra mensile (Cavallino luglio: 223 dichiarate, solo 172
   * distinte rese = 23% perso). Misurato che la finestra SETTIMANALE recupera
   * quei record (gap 51 -> 7) con costo quota quasi identico. Usare 7 per i
   * full sweep elimina la deriva di ingest e fa da backfill nel tempo.
   */
  partitionDays?: number
  /**
   * Numero MAX di finestre processate per invocazione (budget quota). Default
   * 6: con ~1-3 pagine per finestra resta ampiamente sotto i 100 req/giorno
   * sandbox anche con gli incrementali in parallelo.
   */
  maxPartitionsPerRun?: number
  /**
   * REFRESH NEAR-TERM EFFIMERO (FIX 24/06/2026 — last-minute Cavallino).
   * Quando true (richiede `partitioned:true`), lo sweep partizionato IGNORA del
   * tutto il cursore globale `brigPartitionCursor`: non lo legge e non lo scrive,
   * e riparte SEMPRE da `partitionFrom`. Serve per rinfrescare ad OGNI run un
   * range fisso e ristretto (es. oggi-2 → oggi+90) cosi' che le prenotazioni
   * last-minute (ricevute oggi, check-in tra pochi giorni) entrino subito, senza
   * dover aspettare che il full sweep — che cammina da -24 mesi in avanti —
   * raggiunga le finestre near-term (~10 run dopo) o che scada il trigger 20h.
   *
   * MOTIVAZIONE: diagnosticato che il feed BRiG, filtrato per checkInDate sulla
   * notte target, restituisce TUTTE le prenotazioni in modo deterministico (es.
   * 24/6: 58 confirmed live vs 39 nel nostro DB). Le ~19 mancanti erano tutte
   * last-minute (ricevute 16-24/6, check-in 22-24/6): perse perche' fra un full
   * sweep e l'altro girava solo l'incrementale a paginazione globale (deriva).
   * Il near-term effimero (finestre settimanali) le cattura ad ogni run.
   *
   * Il full sweep cursore-based resta attivo in parallelo per il backfill del
   * lungo orizzonte (storico + futuro oltre il near-term).
   */
  partitionEphemeral?: boolean
  /**
   * Refresh near-term ROTANTE (FIX 24/06/2026). Come `partitionEphemeral` NON
   * tocca il cursore globale del full sweep, ma — a differenza di quello —
   * NON riparte ogni volta da `partitionFrom`: persiste un cursore DEDICATO
   * (`brigNearTermCursor`) che avanza di `maxPartitionsPerRun` finestre a ogni
   * run e, raggiunta la fine del range, fa WRAP tornando a `partitionFrom`.
   * Serve per coprire l'orizzonte near-term un giorno alla volta a costo ~1
   * chiamata/run, rispettando la quota reale BRiG di 200 req/giorno (Cavallino).
   * Usare con `partitionDays: 1` e `maxPartitionsPerRun` piccolo.
   */
  partitionRotating?: boolean
}

/**
 * Cursore del fetch partizionato, persistito in
 * `pms_integrations.config.brigPartitionCursor`. `nextWindowStart` = primo
 * giorno della prossima finestra mensile da processare; quando supera
 * `rangeTo` il recupero e' completo (cursore azzerato).
 */
export interface BrigPartitionCursorState {
  nextWindowStart: string
  rangeFrom: string
  rangeTo: string
  windowsDone: number
  startedAt: string
  updatedAt: string
}

/**
 * Stato del cursore di recupero resumabile, persistito in
 * `pms_integrations.config.brigSweepCursor`. `nextPage` = pagina da cui
 * ripartire al prossimo run; `walks` = quante camminate complete del feed
 * sono state fatte (ogni camminata e' una finestra di deriva diversa);
 * `reportedTotal` = ultimo `totalItems` noto da BRiG.
 */
export interface BrigSweepCursorState {
  nextPage: number
  reportedTotal: number
  walks: number
  startedAt: string
  updatedAt: string
  /**
   * Conteggio righe in DB all'INIZIO della camminata corrente (quando
   * `nextPage` viene resettato a 1). Serve al GATE A CONVERGENZA (FIX
   * 03/06/2026): `totalItems` di BRiG conta i DUPLICATI di paginazione
   * (Cavallino: 3886 dichiarati vs 3306 `reservationCode` distinti reali),
   * quindi `dbRowCount >= totalItems` non e' MAI vero e il sweep gira a vuoto
   * fino al give-up bruciando quota. Confrontando il conteggio DB a fine
   * camminata con quello d'inizio capiamo se la camminata ha aggiunto NUOVE
   * prenotazioni: se non ne aggiunge piu', il dataset e' converso (= tutto
   * cio' che la paginazione riesce a consegnare) e ci fermiamo.
   */
  walkStartDbRowCount?: number
}

export interface BrigSyncResult {
  hotelId: string
  ok: boolean
  durationMs: number
  totalFetched: number
  totalInserted: number
  totalUpdated: number
  totalUnchanged: number
  pagesFetched: number
  /** True se l'early-exit unchanged-streak ha terminato il loop. */
  earlyExitedOnUnchangedStreak?: boolean
  /**
   * True se BRiG ha risposto 429 con body "maximum number of requests"
   * (quota giornaliera esaurita, sandbox=100/giorno). Aggiunto 25/05/2026
   * per il circuit-breaker giornaliero in /api/cron/sync-modules:
   * quando true, il dispatcher avanza next_run a 02:00 UTC del giorno
   * dopo invece di ritentare ogni ora bruciando ulteriori chiamate.
   */
  dailyQuotaExceeded?: boolean
  /**
   * Totale prenotazioni dichiarato da BRiG (`totalItems` della response).
   * 0 se la response non lo espone. Usato dal gate di completezza.
   */
  reportedTotal?: number
  /** Numero di `_id` DISTINTI effettivamente visti durante il sync. */
  distinctSeen?: number
  /** Quante passate di paginazione complete sono state eseguite (>=1). */
  completenessPasses?: number
  /**
   * True se `distinctSeen >= reportedTotal` (sweep completo) oppure se BRiG
   * non espone `totalItems` (reportedTotal=0, non verificabile). False solo
   * quando sappiamo per certo di aver perso righe (gap residuo dopo aver
   * esaurito le passate/quota).
   *
   * In modalita' `resumable`, `complete` riflette il RECUPERO COMPLETO:
   * conteggio righe in DB >= `totalItems` di BRiG.
   */
  complete?: boolean
  /**
   * (Solo modalita' resumabile) True se un recupero e' ancora IN CORSO: il
   * cursore e' stato persistito e il prossimo run continuera'. False quando
   * il recupero e' completo (cursore azzerato) o non era resumabile.
   */
  sweepActive?: boolean
  /** (Solo resumabile) Pagina da cui ripartira' il prossimo run, se attivo. */
  sweepNextPage?: number
  /** (Solo resumabile) Conteggio righe attualmente in DB per l'hotel. */
  dbRowCount?: number
  /**
   * (Solo modalita' partizionata) Finestre mensili processate in questo run.
   */
  partitionsProcessed?: number
  /**
   * (Solo modalita' partizionata) Primo giorno della prossima finestra da
   * processare al run successivo; null se il range e' stato completato.
   */
  partitionNextWindowStart?: string | null
  /**
   * Quante prenotazioni hanno avuto `last_seen_at` aggiornato in questo run
   * (= avvistate nel feed BRiG, anche se invariate). Base della riconciliazione
   * cancellazioni stale: un'avvistamento azzera anche `is_stale_cancelled`.
   */
  staleSighted?: number
  /**
   * Quante prenotazioni sono state marcate `is_stale_cancelled=true` dalla
   * riconciliazione (non avvistate da > grace giorni, checkout futuro). 0 se la
   * riconciliazione non e' stata eseguita in questo run.
   */
  staleTombstoned?: number
  errors: string[]
}

interface RawRow {
  hotel_id: string
  brig_reservation_id: string
  brig_structure_id: string
  reservation_code: string | null
  reservation_parent_code: string | null
  checkin: string | null
  checkout: string | null
  date_received: string | null
  amount: number | null
  amount_detail: string | null
  currency: string | null
  adults: number | null
  children: number | null
  room_code: string | null
  channel_code: string | null
  market_code: string | null
  rate_plan_code: string | null
  source: string | null
  original_status: string | null
  status_code: number | null
  raw_data: BrigReservation
  processed: boolean
}

/**
 * Serializzazione JSON deterministica: ordina ricorsivamente le chiavi degli
 * oggetti prima dello stringify, cosi' due oggetti con lo stesso contenuto ma
 * ordine chiavi diverso producono la STESSA stringa. Indispensabile per
 * confrontare la `raw_data` riletta da Postgres JSONB (ordine chiavi
 * normalizzato dal db) con l'oggetto fresco dall'API BRiG (ordine chiavi
 * dell'API). Vedi FIX 28/05/2026 nel punto di confronto in syncBrigForHotel.
 */
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep)
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

function stableStringify(v: unknown): string {
  return JSON.stringify(sortKeysDeep(v))
}

function brigSourceToString(s: BrigReservation["source"]): string | null {
  if (s == null) return null
  return typeof s === "string" ? s : String(s)
}

function buildRawRow(
  hotelId: string,
  fallbackStructureId: string,
  r: BrigReservation,
): RawRow | null {
  if (!r._id) return null
  return {
    hotel_id: hotelId,
    brig_reservation_id: r._id,
    brig_structure_id: r.structureId || fallbackStructureId,
    reservation_code: r.reservationCode ?? null,
    reservation_parent_code: r.reservationParentCode ?? null,
    checkin: r.checkin ?? null,
    checkout: r.checkout ?? null,
    date_received: r.dateReceived ?? null,
    amount: r.amount != null ? Number(r.amount) : null,
    amount_detail: r.amountDetail ?? null,
    currency: r.currency ?? null,
    adults: r.adults ?? null,
    children: r.children ?? null,
    room_code: r.roomCode ?? null,
    channel_code: r.channelCode ?? null,
    market_code: r.marketCode ?? null,
    rate_plan_code: r.ratePlanCode ?? null,
    source: brigSourceToString(r.source),
    // FIX 05/06/2026: il feed `daily-occupancy-filters` invia `status` come
    // STRINGA ("CONFIRMED"/"DELETED"/...) e NON espone `originalStatus`, quindi
    // queste due colonne risultavano SEMPRE NULL (verificato su Cavallino).
    // - original_status: testo umano -> usa la stringa di `status` se presente,
    //   altrimenti l'eventuale `originalStatus`.
    // - status_code: codice numerico BRIG_STATUS normalizzato da `brigStatusToCode`
    //   (DELETED -> 4), così la rilevazione cancellazioni a valle (status_code===4
    //   OR raw_data.status==='DELETED') trova un valore coerente nella colonna.
    original_status:
      (typeof r.status === "string" ? r.status : r.originalStatus) ?? null,
    status_code: brigStatusToCode(r.status),
    raw_data: r,
    processed: false,
  }
}

/**
 * Estrae l'array di reservation dalla response paginata Brig.
 * La response può avere `data`, `reservations` o `items` come campo array.
 */
function extractReservations(
  payload: BrigPaginatedReservations,
): BrigReservation[] {
  const candidates = ["data", "reservations", "items"] as const
  for (const k of candidates) {
    const v = (payload as Record<string, unknown>)[k]
    if (Array.isArray(v)) return v as BrigReservation[]
  }
  // Se la response è già un array
  if (Array.isArray(payload)) return payload as BrigReservation[]
  return []
}

/**
 * Estrae il TOTALE prenotazioni dichiarato dalla response paginata BRiG.
 * Campo reale osservato (01/06/2026): `totalItems`. Manteniamo i fallback
 * `total`/`totalCount` per robustezza tra versioni del gateway. Ritorna 0
 * quando non disponibile (in quel caso il gate di completezza non puo'
 * verificare nulla e considera lo sweep "completo" per non ciclare a vuoto).
 */
function extractTotalItems(payload: BrigPaginatedReservations): number {
  const p = payload as Record<string, unknown>
  for (const k of ["totalItems", "total", "totalCount"] as const) {
    const v = p[k]
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v
  }
  return 0
}

/** Formatta una Date (UTC) come `YYYY-MM-DD`. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Primo giorno (UTC) del mese di `d`. */
function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** Aggiunge `n` mesi (UTC) a `d`, ancorando al primo del mese. */
function addMonthsUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

/** Aggiunge `n` giorni (UTC) a `d` (nessun ancoraggio). */
function addDaysUTC(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

/**
 * Costruisce il filtro BRiG per una finestra `[start, end)` sul checkin.
 * Formato VERIFICATO live (06/06/2026): ogni campo data e' un oggetto con
 * `from`+`operatorFrom` (e opz. `to`+`operatorTo`); date `YYYY-MM-DD`.
 * Usiamo `>=` sul from e `<` sul to (finestre half-open -> nessun overlap tra
 * mesi consecutivi, nessun duplicato cross-window).
 */
function buildCheckinWindowFilter(
  startIso: string,
  endIso: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(extra ?? {}),
    checkInDate: {
      from: startIso,
      operatorFrom: ">=",
      to: endIso,
      operatorTo: "<",
    },
  }
}

/**
 * Esegue il sync. Usa il client Supabase service-role, quindi bypassa la RLS.
 */
export async function syncBrigForHotel(
  options: BrigSyncOptions,
): Promise<BrigSyncResult> {
  const startedAt = Date.now()
  const errors: string[] = []
  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalUnchanged = 0
  let pagesFetched = 0

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    // Stesso fallback usato da lib/supabase/server.ts (PROD_URL): in alcuni
    // ambienti (es. cron/job) NEXT_PUBLIC_SUPABASE_URL non e' iniettata.
    "https://aeynirkfixurikshxfov.supabase.co"
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "syncBrigForHotel: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richiesti",
    )
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. carica la pms_integrations row per l'hotel
  const { data: integration, error: intErr } = await supabase
    .from("pms_integrations")
    .select("api_key, property_id, endpoint_url, config")
    .eq("hotel_id", options.hotelId)
    .eq("pms_name", "brig")
    .eq("integration_mode", "api")
    .maybeSingle()

  if (intErr) {
    throw new Error(
      `syncBrigForHotel: lettura pms_integrations fallita: ${intErr.message}`,
    )
  }
  if (!integration) {
    throw new Error(
      `syncBrigForHotel: nessuna pms_integrations per hotel ${options.hotelId} con pms_name='brig' e integration_mode='api'`,
    )
  }
  if (!integration.api_key) {
    throw new Error("syncBrigForHotel: pms_integrations.api_key è vuoto")
  }
  if (!integration.property_id) {
    throw new Error(
      "syncBrigForHotel: pms_integrations.property_id (structureId) è vuoto",
    )
  }

  const baseUrl = integration.endpoint_url || process.env.BRIG_BASE_URL
  if (!baseUrl) {
    throw new Error(
      "syncBrigForHotel: né endpoint_url né BRIG_BASE_URL sono impostati",
    )
  }

  const client = new BrigClient({
    baseUrl,
    apiKey: integration.api_key,
    structureId: integration.property_id,
  })

  // Dichiarate qui (prima del primo `try`) perche' il blocco
  // getRoomTypes() puo' settare `dailyQuotaExceeded` per uscire
  // anticipatamente prima che inizi la paginazione reservations.
  let dailyQuotaExceeded = false

  // 1bis. Sync nomi tipologie da BRiG (`/api/nol/roomtypes/list`).
  // FIX 21/05/2026: BRiG ritorna `{id, title, description}` ma la prima
  // versione del seed di `room_types` aveva salvato l'`id` (es. "67199")
  // anche nel campo `name`, quindi la griglia pricing mostrava codici
  // numerici invece di "DOPPIA" / "MATRIMONIALE". Allineiamo i nomi ad
  // ogni sync usando `brig_room_code` come chiave (gia' presente in
  // room_types) e il `title` come nuovo `name`. Best-effort: se la
  // chiamata fallisce non vogliamo bloccare il sync bookings.
  // FIX 28/05/2026: questo blocco chiamava `client.getRoomTypes()` su OGNI
  // sync reservations, bruciando 1 chiamata BRiG (quota giornaliera) ad
  // ogni run del cron anche quando i nomi delle tipologie erano gia'
  // umanizzati. Serve solo a sostituire i `name` che coincidono ancora col
  // `brig_room_code` (es. "67199") col titolo leggibile. Una volta sistemati
  // tutti, non c'e' piu' nulla da fare: gate dietro una query DB locale
  // (zero costo quota) che verifica se resta almeno una tipologia col nome
  // == codice. Cosi' a regime NON consumiamo piu' quota per i room types.
  const { data: rtCheckRows } = await supabase
    .from("room_types")
    .select("name, brig_room_code")
    .eq("hotel_id", options.hotelId)
  const needsRoomTypeNameSync = (rtCheckRows ?? []).some(
    (rt: { name: string | null; brig_room_code: string | null }) =>
      rt.brig_room_code &&
      rt.name &&
      String(rt.name).trim() === String(rt.brig_room_code).trim(),
  )

  if (needsRoomTypeNameSync) try {
    const rtRaw = await client.getRoomTypes()
    const rtList = Array.isArray(rtRaw)
      ? (rtRaw as Array<{ id?: string; title?: string; name?: string }>)
      : Array.isArray((rtRaw as { data?: unknown })?.data)
        ? ((rtRaw as { data: Array<{ id?: string; title?: string; name?: string }> }).data)
        : []
    for (const rt of rtList) {
      const code = String(rt.id || "").trim()
      const title = String(rt.title || rt.name || "").trim()
      if (!code || !title) continue
      // Update solo quando il name corrente coincide col code (cioe' non
      // e' mai stato sovrascritto manualmente). Evita di calpestare nomi
      // custom degli operatori.
      const { error: upErr } = await supabase
        .from("room_types")
        .update({ name: title })
        .eq("hotel_id", options.hotelId)
        .eq("brig_room_code", code)
        .eq("name", code)
      if (upErr) {
        // non fatale
        // eslint-disable-next-line no-console
        console.warn(`[v0] BRiG room_types name sync warn for ${code}: ${upErr.message}`)
      }
    }
  } catch (e) {
    // Se la chiamata opportunistica getRoomTypes() esaurisce gia' la
    // quota giornaliera, NON ha senso proseguire con la paginazione
    // reservations: brucerebbe altri 429 fino a riempire i log.
    // Settiamo subito il flag e usciamo. (FIX 25/05/2026 incident
    // Cavallino: senza questo, ogni sync bruciava ~3 chiamate solo
    // per scoprire l'ovvio 429.)
    if (
      e instanceof BrigError &&
      e.status === 429 &&
      isBrigDailyQuotaExceeded(e.body)
    ) {
      dailyQuotaExceeded = true
      errors.push(`getRoomTypes: ${e.message} (HTTP 429 daily quota)`)
      return {
        hotelId: options.hotelId,
        ok: false,
        durationMs: Date.now() - startedAt,
        totalFetched: 0,
        totalInserted: 0,
        totalUpdated: 0,
        totalUnchanged: 0,
        pagesFetched: 0,
        earlyExitedOnUnchangedStreak: false,
        dailyQuotaExceeded,
        errors,
      }
    }
    // eslint-disable-next-line no-console
    console.warn(`[v0] BRiG room_types name sync skipped: ${String(e)}`)
  }

  // 2. paginazione
  const pageSize = Math.min(options.pageSize ?? 100, 100)
  const maxPages = options.maxPages ?? 200
  const pageDelay = options.pageDelayMs ?? 250
  const unchangedStreakLimit = Math.max(1, options.unchangedPageStreakLimit ?? 3)
  // Recupero resumabile (vedi `resumable` nelle options): implica forceFullSync
  // (niente early-exit, vogliamo camminare il budget completo).
  const resumable = options.resumable === true
  // Fetch partizionato per data (FIX 06/06/2026): cura definitiva deriva.
  const partitioned = options.partitioned === true
  const forceFullSync = options.forceFullSync === true || resumable || partitioned
  const maxPagesPerRun = Math.max(1, options.maxPagesPerRun ?? 12)
  // Numero massimo di camminate complete del feed prima di rinunciare (ogni
  // camminata e' una finestra di deriva diversa). Evita loop infiniti se BRiG
  // dichiara un `totalItems` che non riusciamo mai a raggiungere.
  const MAX_SWEEP_WALKS = 8
  // Cursore di recupero letto dal config dell'integrazione (solo resumabile).
  const integrationConfig = (integration.config ?? {}) as Record<string, unknown>
  const cursorPrev = resumable
    ? ((integrationConfig.brigSweepCursor as BrigSweepCursorState | undefined) ??
      undefined)
    : undefined
  const resumeStartPage = Math.max(1, cursorPrev?.nextPage ?? 1)
  // Gate di completezza (FIX 01/06/2026): vedi `maxCompletenessPasses` nelle
  // options. Solo i full sweep eseguono >1 passata; gli incrementali restano
  // a 1 passata (early-exit unchanged-streak attivo).
  const maxCompletenessPasses = Math.max(
    1,
    options.maxCompletenessPasses ?? (forceFullSync ? 3 : 1),
  )
  // Set CROSS-PASS dei `_id` distinti visti: e' la base del gate. NON viene
  // resettato tra le passate, cosi' l'unione converge verso `reportedTotal`.
  const seenReservationIds = new Set<string>()
  let reportedTotal = 0
  // Totale dichiarato da BRiG osservato durante l'ULTIMA invocazione di
  // runPass (cioe' per l'ultima finestra/filtro). Serve al re-walk resiliente
  // per-finestra in modalita' partizionata: ci dice quante prenotazioni la
  // finestra dovrebbe contenere, per capire se la deriva di paginazione ne ha
  // perse. Resettato all'inizio di ogni runPass.
  let lastPassReportedTotal = 0
  let unchangedStreak = 0
  let earlyExitedOnUnchangedStreak = false

  /**
   * Esegue UNA passata completa di paginazione (pagine 1..maxPages finche'
   * BRiG ha dati). Aggiorna gli accumulatori esterni e `seenReservationIds`.
   * Ritorna `abort=true` quando un errore (quota/lookup/upsert) impone di
   * fermare anche le eventuali passate successive del gate di completezza.
   */
  const runPass = async (
    fromPage = 1,
    pageBudget = maxPages,
    extraOverride?: Record<string, unknown>,
  ): Promise<{ abort: boolean; reachedEnd: boolean; lastPage: number }> => {
    const lastAllowedPage = Math.min(maxPages, fromPage + pageBudget - 1)
    let lastPage = fromPage - 1
    // Reset del totale dichiarato per QUESTA invocazione (finestra/filtro).
    lastPassReportedTotal = 0
    for (let page = fromPage; page <= lastAllowedPage; page++) {
      lastPage = page
      let payload: BrigPaginatedReservations
      try {
        payload = await client.getReservations({
          page,
          pageSize,
          extra: extraOverride ?? options.extraFilters,
        })
      } catch (e) {
        const msg =
          e instanceof BrigError
            ? `${e.message} (HTTP ${e.status})`
            : String(e)
        // Quota giornaliera BRiG (sandbox=100/giorno) esaurita: marca il
        // flag per il circuit-breaker e interrompi la paginazione subito.
        // Senza early-exit qui, il loop continuerebbe a tentare le pagine
        // 2..N riprendendo 429 e bruciando 0 quota ma generando log/errori
        // inutili.
        if (
          e instanceof BrigError &&
          e.status === 429 &&
          isBrigDailyQuotaExceeded(e.body)
        ) {
          dailyQuotaExceeded = true
        }
        errors.push(`Page ${page}: ${msg}`)
        return { abort: true, reachedEnd: false, lastPage }
      }

      pagesFetched = page
      // Totale dichiarato da BRiG: base del gate di completezza. Prendiamo
      // il massimo osservato (puo' crescere durante lo sweep se arrivano
      // nuove prenotazioni).
      const pageTotal = extractTotalItems(payload)
      if (pageTotal > reportedTotal) reportedTotal = pageTotal
      if (pageTotal > lastPassReportedTotal) lastPassReportedTotal = pageTotal

      const reservations = extractReservations(payload)
      if (!reservations || reservations.length === 0)
        return { abort: false, reachedEnd: true, lastPage }
      totalFetched += reservations.length

      // dedup intra-pagina su `_id`
      const seen = new Set<string>()
      const rows: RawRow[] = []
      for (const r of reservations) {
        const row = buildRawRow(options.hotelId, integration.property_id, r)
        if (!row) continue
        if (seen.has(row.brig_reservation_id)) continue
        seen.add(row.brig_reservation_id)
        // Traccia l'`_id` nel set cross-pass del gate di completezza.
        seenReservationIds.add(row.brig_reservation_id)
        rows.push(row)
      }
      if (rows.length === 0) {
        if (reservations.length < pageSize)
          return { abort: false, reachedEnd: true, lastPage }
        continue
      }

      // diff vs existing per evitare upsert inutili
      const ids = rows.map((r) => r.brig_reservation_id)
      const { data: existing, error: exErr } = await supabase
        .schema("connectors")
        .from("brig_raw_bookings")
        .select("brig_reservation_id, raw_data")
        .eq("hotel_id", options.hotelId)
        .in("brig_reservation_id", ids)
      if (exErr) {
        errors.push(
          `Page ${page}: lookup esistenti fallito: ${exErr.message}`,
        )
        return { abort: true, reachedEnd: false, lastPage }
      }
      const existingMap = new Map<string, BrigReservation>()
      for (const e of existing || []) {
        existingMap.set(
          e.brig_reservation_id,
          e.raw_data as BrigReservation,
        )
      }

      const toUpsert: RawRow[] = []
      let pageInserted = 0
      let pageUpdated = 0
      for (const row of rows) {
        const prev = existingMap.get(row.brig_reservation_id)
        if (!prev) {
          toUpsert.push(row)
          totalInserted++
          pageInserted++
          continue
        }
        // confronto JSON ORDER-INSENSITIVE: se identico, nessun upsert.
        //
        // FIX 28/05/2026 (incident Cavallino "ultima sync 13:41, quota 200
        // bruciata a meta' pomeriggio"): il confronto precedente usava
        // `JSON.stringify(prev) === JSON.stringify(row.raw_data)`. `prev`
        // viene riletto da Postgres JSONB, che NON preserva l'ordine delle
        // chiavi (le memorizza in un ordine proprio: _id,type,_class,adults,
        // offset,...), mentre `row.raw_data` e' l'oggetto fresco dall'API
        // BRiG con un ordine chiavi diverso. Risultato: lo stringify dava
        // due stringhe diverse ANCHE per record identici -> ogni prenotazione
        // contava come "updated" ad OGNI run -> totalUnchanged sempre 0 ->
        // l'early-exit unchanged-streak non scattava MAI -> ogni sync
        // scaricava tutte le 38 pagine (~39 chiamate BRiG) ogni 15 minuti,
        // esaurendo la quota giornaliera (anche dopo l'aumento a 200) entro
        // primo pomeriggio. Lo stableStringify ordina ricorsivamente le
        // chiavi su entrambi i lati, rendendo il confronto basato sul
        // contenuto. Ora i record realmente invariati vengono riconosciuti,
        // l'early-exit scatta dopo 3 pagine e il consumo a regime crolla.
        if (stableStringify(prev) === stableStringify(row.raw_data)) {
          totalUnchanged++
          continue
        }
        toUpsert.push(row)
        totalUpdated++
        pageUpdated++
      }

      if (toUpsert.length > 0) {
        const { error: upErr } = await supabase
          .schema("connectors")
          .from("brig_raw_bookings")
          .upsert(toUpsert, { onConflict: "hotel_id,brig_reservation_id" })
        if (upErr) {
          errors.push(`Page ${page}: upsert fallito: ${upErr.message}`)
          return { abort: true, reachedEnd: false, lastPage }
        }
      }

      // Early-exit: se questa pagina non ha portato modifiche e abbiamo
      // raggiunto K pagine consecutive in questo stato, esci. Vedi commento
      // su `unchangedPageStreakLimit` nelle options. Bypassato se
      // forceFullSync=true (in full sweep vogliamo SEMPRE percorrere tutte
      // le pagine: il gate di completezza si basa sull'unione completa).
      if (!forceFullSync) {
        if (pageInserted === 0 && pageUpdated === 0) {
          unchangedStreak++
          if (unchangedStreak >= unchangedStreakLimit) {
            earlyExitedOnUnchangedStreak = true
            // eslint-disable-next-line no-console
            console.log(
              `[v0] BRiG sync early-exit hotel=${options.hotelId} page=${page} unchangedStreak=${unchangedStreak} (limit=${unchangedStreakLimit})`,
            )
            return { abort: false, reachedEnd: false, lastPage }
          }
        } else {
          unchangedStreak = 0
        }
      }

      if (reservations.length < pageSize)
        return { abort: false, reachedEnd: true, lastPage }
      if (pageDelay > 0)
        await new Promise((r) => setTimeout(r, pageDelay))
    }
    // Loop terminato per budget/maxPages senza pagina corta: se abbiamo
    // toccato maxPages consideriamo il feed esaurito (evita loop infiniti),
    // altrimenti il budget e' finito a meta' feed -> resta altro da leggere.
    return { abort: false, reachedEnd: lastPage >= maxPages, lastPage }
  }

  let completenessPasses = 0
  // True quando il gate non-resumabile si ferma per CONVERGENZA (una passata
  // completa non ha aggiunto nuovi `_id` distinti) invece che per aver
  // raggiunto `reportedTotal`. Vedi FIX 03/06/2026 (totalItems gonfiato dai
  // duplicati di paginazione).
  let nonResumableConverged = false
  // Esito dell'ultima passata in modalita' resumabile.
  let sweepReachedEnd = false
  let sweepLastPage = 0
  // Esito della modalita' partizionata (vedi `partitioned`).
  let partitionsProcessed = 0
  let partitionNextWindowStart: string | null | undefined
  let partitionComplete: boolean | undefined

  if (partitioned) {
    // ---- FETCH PARTIZIONATO PER DATA (FIX 06/06/2026) ----
    // Iteriamo finestre mensili half-open [start, start+N mesi) sul checkin.
    // Ogni finestra e' piccola e la sua paginazione interna e' stabile (niente
    // deriva), quindi l'unione delle finestre = dataset completo senza buchi.
    const now = new Date()
    const defaultFrom = ymd(addMonthsUTC(startOfMonthUTC(now), -24))
    const defaultTo = ymd(addMonthsUTC(startOfMonthUTC(now), 18))
    const rangeFrom = options.partitionFrom ?? defaultFrom
    const rangeTo = options.partitionTo ?? defaultTo
    const stepMonths = Math.max(1, options.partitionMonths ?? 1)
    // Se `partitionDays` e' valorizzato, le finestre avanzano di N giorni e
    // hanno PRECEDENZA sul passo mensile (vedi FIX 18/06/2026: deriva
    // intra-finestra mensile del feed BRiG).
    const stepDays =
      options.partitionDays != null ? Math.max(1, options.partitionDays) : null
    const maxPartitions = Math.max(1, options.maxPartitionsPerRun ?? 6)

    // Modalita' cursore:
    //  - rotating: cursore DEDICATO `brigNearTermCursor`, avanza e fa wrap.
    //  - ephemeral (non rotating): ignora del tutto il cursore, riparte da rangeFrom.
    //  - default: cursore globale `brigPartitionCursor` del full sweep.
    const rotating = options.partitionRotating === true
    const ephemeral = options.partitionEphemeral === true && !rotating
    const cursorPart = rotating
      ? ((integrationConfig.brigNearTermCursor as
          | BrigPartitionCursorState
          | undefined) ?? undefined)
      : ephemeral
        ? undefined
        : ((integrationConfig.brigPartitionCursor as
            | BrigPartitionCursorState
            | undefined) ?? undefined)
    // Se il cursore appartiene a un range diverso (es. parametri cambiati),
    // ricominciamo da `rangeFrom`.
    const cursorValid =
      !ephemeral &&
      cursorPart &&
      cursorPart.rangeFrom === rangeFrom &&
      cursorPart.rangeTo === rangeTo
    let windowStart = new Date(
      `${cursorValid ? cursorPart!.nextWindowStart : rangeFrom}T00:00:00Z`,
    )
    const rangeEnd = new Date(`${rangeTo}T00:00:00Z`)
    let windowsDoneTotal = cursorValid ? cursorPart!.windowsDone : 0
    let aborted = false

    for (let i = 0; i < maxPartitions; i++) {
      if (windowStart >= rangeEnd) break
      let windowEnd =
        stepDays != null
          ? addDaysUTC(windowStart, stepDays)
          : startOfMonthUTC(addMonthsUTC(windowStart, stepMonths))
      if (windowEnd > rangeEnd) windowEnd = rangeEnd
      const startIso = ymd(windowStart)
      const endIso = ymd(windowEnd)
      const filter = buildCheckinWindowFilter(startIso, endIso, options.extraFilters)
      // eslint-disable-next-line no-console
      console.log(
        `[v0] BRiG partition hotel=${options.hotelId} window=[${startIso},${endIso})`,
      )

      // RE-WALK RESILIENTE PER-FINESTRA (FIX 24/06/2026 — gap occupancy
      // Cavallino). La deriva di paginazione del feed BRiG riemerge ogni volta
      // che una finestra supera 1 pagina (>100 record): tra pagina 1 e 2 il
      // feed si ri-ordina e alcune prenotazioni non vengono MAI lette
      // (verificato live 24/6: finestra settimanale 117 record -> 2 mancanti).
      // Le finestre hanno checkin DISGIUNTO, quindi i `_id` raccolti in questa
      // finestra = `seenReservationIds.size - beforeWindow`. Ri-camminiamo la
      // STESSA finestra finche':
      //  - i distinti raccolti raggiungono il totale dichiarato da BRiG, OPPURE
      //  - una ri-camminata non aggiunge piu' alcun `_id` nuovo (drift
      //    esaurito / totale gonfiato dai duplicati), OPPURE
      //  - raggiungiamo il cap MAX_WINDOW_WALKS.
      // Le finestre da 1 pagina (caso comune) convergono al walk 0 (distinct ==
      // total) e NON vengono ri-camminate: costo quota invariato.
      const MAX_WINDOW_WALKS = 4
      const beforeWindow = seenReservationIds.size
      let windowTotal = 0
      let prevWindowDistinct = -1
      let windowAbort = false
      for (let walk = 0; walk < MAX_WINDOW_WALKS; walk++) {
        unchangedStreak = 0
        const { abort } = await runPass(1, maxPages, filter)
        if (abort) {
          windowAbort = true
          break
        }
        if (lastPassReportedTotal > windowTotal) windowTotal = lastPassReportedTotal
        const windowDistinct = seenReservationIds.size - beforeWindow
        // Finestra completa: abbiamo tutti i record dichiarati.
        if (windowTotal > 0 && windowDistinct >= windowTotal) break
        // Nessun totale dichiarato: non possiamo verificare, ci fidiamo di 1 walk.
        if (windowTotal <= 0) break
        // Convergenza: questa ri-camminata non ha aggiunto nuovi `_id` -> il
        // feed non ne consegnera' altri (totale gonfiato dai duplicati di
        // paginazione, vedi FIX 03/06/2026). Ci fermiamo.
        if (windowDistinct === prevWindowDistinct) break
        prevWindowDistinct = windowDistinct
        if (walk + 1 < MAX_WINDOW_WALKS) {
          // eslint-disable-next-line no-console
          console.log(
            `[v0] BRiG partition RE-WALK hotel=${options.hotelId} window=[${startIso},${endIso}) ` +
              `walk=${walk + 1} distinct=${windowDistinct}/${windowTotal}`,
          )
        }
      }

      partitionsProcessed++
      windowsDoneTotal++
      if (windowAbort) {
        aborted = true
        break
      }
      windowStart = windowEnd
    }

    completenessPasses = 1
    // Completo quando, senza errori/quota, abbiamo percorso fino a fine range.
    const reachedRangeEnd = windowStart >= rangeEnd
    partitionComplete = !aborted && !dailyQuotaExceeded && reachedRangeEnd

    // Scrivi/azzera il cursore partizionato (campo configurabile).
    const nowIso = new Date().toISOString()
    const writePartCursor = async (
      state: BrigPartitionCursorState | null,
      field: "brigPartitionCursor" | "brigNearTermCursor" = "brigPartitionCursor",
    ) => {
      const newConfig: Record<string, unknown> = { ...integrationConfig }
      if (state) newConfig[field] = state
      else delete newConfig[field]
      const { error: cfgErr } = await supabase
        .from("pms_integrations")
        .update({ config: newConfig })
        .eq("hotel_id", options.hotelId)
        .eq("pms_name", "brig")
        .eq("integration_mode", "api")
      if (cfgErr) errors.push(`update cursore partizione fallito: ${cfgErr.message}`)
    }

    if (rotating) {
      // ROTANTE: persiste il cursore DEDICATO. Raggiunta la fine del range,
      // fa WRAP a `rangeFrom` cosi' il near-term viene rinfrescato in continuo,
      // un giorno alla volta, senza mai toccare il cursore globale del full sweep.
      const wrapped = windowStart >= rangeEnd
      partitionNextWindowStart = wrapped ? rangeFrom : ymd(windowStart)
      await writePartCursor(
        {
          nextWindowStart: partitionNextWindowStart,
          rangeFrom,
          rangeTo,
          windowsDone: wrapped ? 0 : windowsDoneTotal,
          startedAt: cursorValid ? cursorPart!.startedAt : nowIso,
          updatedAt: nowIso,
        },
        "brigNearTermCursor",
      )
    } else if (ephemeral) {
      // Effimero: non tocchiamo MAI il cursore globale (ne' lo scriviamo ne'
      // lo azzeriamo), cosi' il full sweep cursore-based prosegue indisturbato.
      partitionNextWindowStart = partitionComplete ? null : ymd(windowStart)
    } else if (partitionComplete) {
      partitionNextWindowStart = null
      await writePartCursor(null)
    } else {
      partitionNextWindowStart = ymd(windowStart)
      await writePartCursor({
        nextWindowStart: partitionNextWindowStart,
        rangeFrom,
        rangeTo,
        windowsDone: windowsDoneTotal,
        startedAt: cursorValid ? cursorPart!.startedAt : nowIso,
        updatedAt: nowIso,
      })
    }
    // eslint-disable-next-line no-console
    console.log(
      `[v0] BRiG partition run hotel=${options.hotelId} processed=${partitionsProcessed} ` +
        `nextWindow=${partitionNextWindowStart ?? "-"} complete=${partitionComplete} ` +
        `fetched=${totalFetched} ins=${totalInserted} upd=${totalUpdated}`,
    )
  } else if (resumable) {
    // RECUPERO RESUMABILE: UNA sola passata budgettata partendo dalla pagina
    // memorizzata nel cursore. Niente gate in-memory: la completezza si
    // verifica sul conteggio REALE delle righe in DB (vedi sotto).
    const { abort, reachedEnd, lastPage } = await runPass(
      resumeStartPage,
      maxPagesPerRun,
    )
    void abort
    completenessPasses = 1
    sweepReachedEnd = reachedEnd
    sweepLastPage = lastPage
  } else {
    // Gate di completezza: esegui passate finche' i `_id` distinti raccolti
    // raggiungono `reportedTotal` (sweep completo), oppure finche' esauriamo
    // `maxCompletenessPasses`, oppure finche' un errore/quota impone l'abort.
    // Negli incrementali (`forceFullSync=false`) il default e' 1 passata,
    // quindi il comportamento e il consumo quota restano identici a prima.
    for (let pass = 1; pass <= maxCompletenessPasses; pass++) {
      unchangedStreak = 0
      const distinctBeforePass = seenReservationIds.size
      const { abort } = await runPass()
      completenessPasses = pass
      if (abort) break
      // Incrementali: una sola passata.
      if (!forceFullSync) break
      // BRiG non ha esposto `totalItems`: non possiamo verificare la
      // completezza, evitiamo di ciclare a vuoto.
      if (reportedTotal === 0) break
      // Sweep completo: i distinti raccolti coprono tutto il dataset.
      if (seenReservationIds.size >= reportedTotal) break
      // GATE A CONVERGENZA (FIX 03/06/2026): `reportedTotal` (totalItems)
      // conta i duplicati di paginazione, quindi `distinct >= reportedTotal`
      // puo' non avverarsi MAI (Cavallino: max ~3306 distinti vs 3886
      // dichiarati). Se questa passata NON ha aggiunto nuovi `_id` distinti,
      // ri-camminare con la stessa pageSize dara' pagine identiche (ordine
      // stabile, verificato col probe): l'unione non crescera' piu'. Ci
      // fermiamo: abbiamo tutto cio' che la paginazione riesce a consegnare.
      if (pass > 1 && seenReservationIds.size <= distinctBeforePass) {
        nonResumableConverged = true
        // eslint-disable-next-line no-console
        console.log(
          `[v0] BRiG completeness CONVERGED hotel=${options.hotelId} pass=${pass} ` +
            `distinct=${seenReservationIds.size}/${reportedTotal} (no new rows) -> stop`,
        )
        break
      }
      // Gap residuo: logghiamo e ripetiamo (se restano passate). Ogni passata
      // ha una finestra di deriva diversa, quindi l'unione puo' crescere.
      if (pass < maxCompletenessPasses) {
        // eslint-disable-next-line no-console
        console.log(
          `[v0] BRiG completeness gate hotel=${options.hotelId} pass=${pass} ` +
            `distinct=${seenReservationIds.size}/${reportedTotal} -> re-pass`,
        )
      }
    }
  }

  const distinctSeen = seenReservationIds.size

  // ---- Modalita' resumabile: completezza su conteggio DB + cursore ----
  let sweepActive: boolean | undefined
  let sweepNextPage: number | undefined
  let dbRowCount: number | undefined
  let complete: boolean

  if (partitioned) {
    // Modalita' partizionata: `complete` riflette se tutte le finestre del
    // range sono state percorse (cursore azzerato). Non usiamo `reportedTotal`
    // (per-finestra non e' significativo) ne' il conteggio DB globale.
    complete = partitionComplete === true
  } else if (resumable) {
    // Conteggio REALE delle righe gia' accumulate in DB (zero quota BRiG).
    // E' la base della completezza: il set in-memory si azzera tra i run, il
    // DB no.
    const { count: dbCount, error: cntErr } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", options.hotelId)
    if (cntErr) {
      errors.push(`conteggio DB fallito: ${cntErr.message}`)
    }
    dbRowCount = dbCount ?? undefined

    // `totalItems` da BRiG puo' non essere stato letto in questo run (es. 429
    // alla prima pagina): usiamo il massimo tra run corrente e cursore.
    const effectiveTotal = Math.max(reportedTotal, cursorPrev?.reportedTotal ?? 0)
    const recovered =
      effectiveTotal > 0 &&
      typeof dbRowCount === "number" &&
      dbRowCount >= effectiveTotal
    complete = recovered

    const now = new Date().toISOString()
    const writeCursor = async (state: BrigSweepCursorState | null) => {
      const newConfig: Record<string, unknown> = { ...integrationConfig }
      if (state) newConfig.brigSweepCursor = state
      else delete newConfig.brigSweepCursor
      const { error: cfgErr } = await supabase
        .from("pms_integrations")
        .update({ config: newConfig })
        .eq("hotel_id", options.hotelId)
        .eq("pms_name", "brig")
        .eq("integration_mode", "api")
      if (cfgErr) errors.push(`update cursore fallito: ${cfgErr.message}`)
    }

    if (recovered) {
      // Dataset completo in DB: chiudi il recupero.
      sweepActive = false
      await writeCursor(null)
    } else if (dailyQuotaExceeded || errors.length > 0) {
      // Quota o errore: riparti dalla pagina che ha fallito (nessun dato letto
      // da quella pagina), mantenendo il conteggio camminate.
      sweepNextPage = Math.max(1, sweepLastPage)
      sweepActive = true
      await writeCursor({
        nextPage: sweepNextPage,
        reportedTotal: effectiveTotal,
        walks: cursorPrev?.walks ?? 0,
        startedAt: cursorPrev?.startedAt ?? now,
        updatedAt: now,
        walkStartDbRowCount: cursorPrev?.walkStartDbRowCount,
      })
    } else if (sweepReachedEnd) {
      // Camminata completa del feed. Decidiamo se: (a) abbiamo converso
      // (questa camminata non ha aggiunto nuove righe -> stop), (b) riprovare
      // un'altra finestra di deriva (pagina 1), o (c) arrendersi a MAX_WALKS.
      const walks = (cursorPrev?.walks ?? 0) + 1
      // GATE A CONVERGENZA (FIX 03/06/2026): confronta il conteggio DB a fine
      // camminata con quello memorizzato all'inizio della STESSA camminata.
      // Se non e' cresciuto, ri-camminare con la stessa pageSize dara' pagine
      // identiche (ordine stabile, verificato col probe): inutile insistere
      // verso `totalItems`, che e' gonfiato dai duplicati e non e'
      // raggiungibile. Ci fermiamo e marchiamo `complete` (= tutto cio' che la
      // paginazione consegna e' in DB). NB: la prima camminata non ha un
      // `walkStartDbRowCount` memorizzato -> non puo' convergere, e si apre
      // una seconda camminata che lo registra.
      const walkStart = cursorPrev?.walkStartDbRowCount
      const converged =
        typeof walkStart === "number" &&
        typeof dbRowCount === "number" &&
        dbRowCount > 0 &&
        dbRowCount <= walkStart
      if (converged) {
        sweepActive = false
        complete = true
        await writeCursor(null)
        // eslint-disable-next-line no-console
        console.log(
          `[v0] BRiG resumable sweep CONVERGED hotel=${options.hotelId} ` +
            `dbRows=${dbRowCount} (walkStart=${walkStart}) /${effectiveTotal} ` +
            `walks=${walks} -> stop (no new rows)`,
        )
      } else if (walks >= MAX_SWEEP_WALKS) {
        // Non riusciamo a raggiungere `totalItems`: smettiamo di ciclare. Il
        // cron tornera' a forzare uno sweep alla cadenza normale.
        sweepActive = false
        await writeCursor(null)
        // eslint-disable-next-line no-console
        console.warn(
          `[v0] BRiG resumable sweep give-up hotel=${options.hotelId} ` +
            `dbRows=${dbRowCount}/${effectiveTotal} walks=${walks}`,
        )
      } else {
        // Apri una nuova camminata da pagina 1 e MEMORIZZA il conteggio DB
        // attuale come baseline: se la prossima camminata non lo supera,
        // convergeremo e ci fermeremo.
        sweepNextPage = 1
        sweepActive = true
        await writeCursor({
          nextPage: 1,
          reportedTotal: effectiveTotal,
          walks,
          startedAt: cursorPrev?.startedAt ?? now,
          updatedAt: now,
          walkStartDbRowCount: dbRowCount,
        })
      }
    } else {
      // Budget esaurito a meta' feed: continua dalla pagina successiva.
      sweepNextPage = sweepLastPage + 1
      sweepActive = true
      await writeCursor({
        nextPage: sweepNextPage,
        reportedTotal: effectiveTotal,
        walks: cursorPrev?.walks ?? 0,
        startedAt: cursorPrev?.startedAt ?? now,
        updatedAt: now,
        walkStartDbRowCount: cursorPrev?.walkStartDbRowCount,
      })
    }

    // eslint-disable-next-line no-console
    console.log(
      `[v0] BRiG resumable sweep hotel=${options.hotelId} ` +
        `from=${resumeStartPage} lastPage=${sweepLastPage} ` +
        `dbRows=${dbRowCount ?? "?"}/${effectiveTotal} ` +
        `reachedEnd=${sweepReachedEnd} active=${sweepActive} ` +
        `nextPage=${sweepNextPage ?? "-"} complete=${complete}`,
    )
  } else {
    // `complete` = "abbiamo l'intero dataset in DB". Il cron lo legge per NON
    // ri-schedulare un altro full sweep. Va quindi marcato true SOLO se:
    //  - nessun errore (un sync con fetch fallita non ha visto nulla)
    //  - abbiamo davvero scaricato record (totalFetched > 0)
    //  - e o BRiG non espone totalItems (reportedTotal 0 -> non verificabile,
    //    ma abbiamo comunque dati) oppure i distinti coprono il totale.
    // PRIMA: `reportedTotal === 0 || distinctSeen >= reportedTotal` dava un
    // FALSO POSITIVO `complete:true` quando tutto falliva (0 fetched, 0 total),
    // facendo credere al cron che il dataset fosse a posto. (Cavallino
    // 01/06/2026)
    // `nonResumableConverged`: i distinti si sono stabilizzati sotto
    // `reportedTotal` (totalItems gonfiato dai duplicati). E' completo "quanto
    // basta": abbiamo tutto cio' che la paginazione consegna, inutile che il
    // cron forzi altri sweep. (FIX 03/06/2026)
    complete =
      errors.length === 0 &&
      totalFetched > 0 &&
      (reportedTotal === 0 ||
        distinctSeen >= reportedTotal ||
        nonResumableConverged)
  }

  // ---- Bump last_seen_at + reset tombstone per le prenotazioni avvistate ----
  // FIX 04/06/2026 (cancellazioni stale): aggiorniamo `last_seen_at=now()` per
  // OGNI prenotazione vista nel feed in questo run (inserite, aggiornate E
  // invariate: tutte quelle in `seenReservationIds`), indipendentemente dal
  // diff su `raw_data`. E' il timestamp di "ultimo avvistamento" su cui si basa
  // la riconciliazione delle cancellazioni: una prenotazione viva viene
  // ri-avvistata di continuo (l'unione dei dati si ricicla tra i run), una
  // rimossa dal feed BRiG resta "ferma" e dopo la finestra di grazia viene
  // marcata cancellata. Lo stesso update azzera `is_stale_cancelled` cosi' una
  // prenotazione che RICOMPARE nel feed viene automaticamente de-tombstonata
  // (auto-correzione, immune al diff perche' il tombstone non vive in raw_data).
  let staleSighted = 0
  if (seenReservationIds.size > 0) {
    const nowIso = new Date().toISOString()
    const ids = Array.from(seenReservationIds)
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { error: seenErr, count } = await supabase
        .schema("connectors")
        .from("brig_raw_bookings")
        .update(
          { last_seen_at: nowIso, is_stale_cancelled: false },
          { count: "exact" },
        )
        .eq("hotel_id", options.hotelId)
        .in("brig_reservation_id", chunk)
      if (seenErr) {
        errors.push(`last_seen bump fallito: ${seenErr.message}`)
        break
      }
      staleSighted += count ?? chunk.length
    }
  }

  return {
    hotelId: options.hotelId,
    ok: errors.length === 0,
    durationMs: Date.now() - startedAt,
    totalFetched,
    totalInserted,
    totalUpdated,
    totalUnchanged,
    pagesFetched,
    earlyExitedOnUnchangedStreak,
    dailyQuotaExceeded,
    reportedTotal,
    distinctSeen,
    completenessPasses,
    complete,
    sweepActive,
    sweepNextPage,
    dbRowCount,
    partitionsProcessed: partitioned ? partitionsProcessed : undefined,
    partitionNextWindowStart: partitioned ? partitionNextWindowStart ?? null : undefined,
    staleSighted,
    errors,
  }
}

/** Giorni di grazia prima di marcare una prenotazione come cancellata stale. */
export const BRIG_STALE_CANCEL_GRACE_DAYS = 7

export interface BrigStaleReconcileResult {
  ok: boolean
  /** Candidati (checkout futuro, attivi, non avvistati da > grace giorni). */
  candidates: number
  /** Quanti effettivamente marcati `is_stale_cancelled=true`. */
  tombstoned: number
  /** True se il guardrail ha bloccato l'operazione (troppi candidati). */
  skippedUnsafe: boolean
  /** Denominatore del guardrail: prenotazioni attive con checkout futuro. */
  futureActive: number
  /**
   * Candidati "salvati" dal tombstone (NON cancellati) perche' ri-avvistati
   * nella verifica mirata o protetti da un fratello di gruppo ancora vivo.
   */
  rescued?: number
  /** Quante finestre giornaliere di verifica mirata sono state eseguite. */
  verifiedWindows?: number
  /** Quanti candidati restano non verificati (oltre il cap del run). */
  deferred?: number
  /** True se la quota giornaliera BRiG si e' esaurita durante la verifica. */
  quotaExceeded?: boolean
  error?: string
}

/**
 * Cap di finestre giornaliere di verifica mirata per singolo run del reconcile.
 * Ogni finestra costa ~1-6 chiamate BRiG (paginazione di UN giorno di checkin):
 * la sandbox impone 100 req/giorno totali, quindi limitiamo per non bruciare la
 * quota condivisa con il sync principale. I candidati oltre il cap restano
 * intatti (conservativo) e verranno verificati nei run successivi.
 */
export const BRIG_RECONCILE_MAX_VERIFY_WINDOWS = 8
/** Pagine massime per finestra giornaliera (un giorno ha pochissime prenotazioni). */
const BRIG_RECONCILE_MAX_PAGES_PER_WINDOW = 6

/**
 * Riconciliazione SICURA delle cancellazioni "stale" per un hotel BRiG.
 *
 * CONTESTO: la disponibilita' BRiG e' DERIVATA dalle prenotazioni e la
 * paginazione del feed `daily-occupancy-filters` e' inaffidabile (ri-ordina
 * tra le richieste: un singolo sweep vede solo ~60% delle prenotazioni). Quindi
 * NON possiamo dedurre una cancellazione dall'assenza in UN singolo sweep:
 * marcheremmo per errore centinaia di prenotazioni valide -> camere
 * falsamente libere -> overbooking. (Vedi memory drift 04/06/2026.)
 *
 * APPROCCIO: finestra di grazia su `last_seen_at`. Poiche' l'UNIONE dei dati si
 * ricicla su piu' run nell'arco di giorni, una prenotazione VIVA viene
 * ri-avvistata regolarmente (e `last_seen_at` torna a now()), mentre una
 * rimossa dal feed BRiG resta "ferma". Solo dopo `graceDays` SENZA avvistamenti
 * (e con checkout futuro) la marchiamo `is_stale_cancelled=true`, cosi' il
 * processor availability smette di contarla. Se ricompare, il bump in
 * `syncBrigForHotel` azzera il flag (auto-correzione).
 *
 * GUARDRAIL ANTI-CATASTROFE: se i candidati superano il 10% (o 25 in assoluto)
 * delle prenotazioni attive future, NON marchiamo nulla e logghiamo un warning.
 * Un numero anomalo = problema del feed (outage BRiG), non centinaia di
 * cancellazioni reali: meglio non liberare in massa camere vendute.
 */
export async function reconcileBrigStaleCancellations(
  hotelId: string,
  opts: { graceDays?: number } = {},
): Promise<BrigStaleReconcileResult> {
  const graceDays = Math.max(1, opts.graceDays ?? BRIG_STALE_CANCEL_GRACE_DAYS)
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    // Stesso fallback usato da lib/supabase/server.ts (PROD_URL): in alcuni
    // ambienti (es. cron/job) NEXT_PUBLIC_SUPABASE_URL non e' iniettata.
    "https://aeynirkfixurikshxfov.supabase.co"
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const base: BrigStaleReconcileResult = {
    ok: false,
    candidates: 0,
    tombstoned: 0,
    skippedUnsafe: false,
    futureActive: 0,
  }
  if (!supabaseUrl || !serviceKey) {
    return { ...base, error: "SUPABASE env mancanti" }
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const today = new Date().toISOString().slice(0, 10)
  const thresholdIso = new Date(
    Date.now() - graceDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Denominatore guardrail: prenotazioni con checkout futuro non gia'
  // tombstonate (include le poche DELETED, trascurabili per il rapporto).
  const { count: futureActive, error: cntErr } = await supabase
    .schema("connectors")
    .from("brig_raw_bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("is_stale_cancelled", false)
    .gte("checkout", today)
  if (cntErr) return { ...base, error: `conteggio attivi fallito: ${cntErr.message}` }
  base.futureActive = futureActive ?? 0

  // Candidati: checkout futuro, non gia' tombstonati, last_seen_at oltre la
  // soglia. Carichiamo anche `checkin` e `reservation_parent_code` per la
  // verifica mirata e la protezione gruppi. Escludiamo in JS quelli gia'
  // cancellati nativamente (status_code=4 o raw_data.status='DELETED'): il
  // processor li scarta gia', tombstonarli sarebbe inutile.
  type Cand = { id: string; checkin: string | null; parent: string | null }
  const candRows: Cand[] = []
  const PAGE = 1000
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .select(
        "brig_reservation_id, status_code, checkin, reservation_parent_code, brig_status:raw_data->>status",
      )
      .eq("hotel_id", hotelId)
      .eq("is_stale_cancelled", false)
      .gte("checkout", today)
      .lt("last_seen_at", thresholdIso)
      .range(offset, offset + PAGE - 1)
    if (error) return { ...base, error: `lettura candidati fallita: ${error.message}` }
    const rows = (data ?? []) as Array<{
      brig_reservation_id: string
      status_code: number | null
      checkin: string | null
      reservation_parent_code: string | null
      brig_status: string | null
    }>
    for (const r of rows) {
      if (r.status_code === 4 || r.brig_status === "DELETED") continue
      candRows.push({
        id: r.brig_reservation_id,
        checkin: r.checkin,
        parent: r.reservation_parent_code,
      })
    }
    if (rows.length < PAGE) break
    offset += PAGE
    if (offset > 200_000) break
  }
  base.candidates = candRows.length

  if (candRows.length === 0) return { ...base, ok: true }

  // Guardrail: troppi candidati = anomalia del feed, non cancellazioni reali.
  const cap = Math.max(25, Math.ceil(0.1 * (base.futureActive || 0)))
  if (candRows.length > cap) {
    // eslint-disable-next-line no-console
    console.warn(
      `[v0] BRiG stale-cancel reconcile SKIP (unsafe) hotel=${hotelId} ` +
        `candidates=${candRows.length} > cap=${cap} (futureActive=${base.futureActive}) ` +
        `-> nessuna cancellazione applicata (probabile anomalia feed)`,
    )
    return { ...base, ok: true, skippedUnsafe: true }
  }

  // ── PROTEZIONE GRUPPI ──────────────────────────────────────────────────────
  // Una prenotazione di gruppo (stesso `reservation_parent_code`, piu' camere)
  // e' proprio cio' che la deriva di paginazione del feed spezza piu' spesso.
  // Se ALMENO UN fratello dello stesso gruppo e' stato avvistato di recente
  // (last_seen_at entro la grazia, non tombstonato), il gruppo e' vivo: NON
  // marchiamo stale le sorelle, le "salviamo".
  const candParents = [...new Set(candRows.map((c) => c.parent).filter(Boolean))] as string[]
  const aliveParents = new Set<string>()
  if (candParents.length > 0) {
    const PCHUNK = 200
    for (let i = 0; i < candParents.length; i += PCHUNK) {
      const chunk = candParents.slice(i, i + PCHUNK)
      const { data, error } = await supabase
        .schema("connectors")
        .from("brig_raw_bookings")
        .select("reservation_parent_code")
        .eq("hotel_id", hotelId)
        .eq("is_stale_cancelled", false)
        .gte("last_seen_at", thresholdIso)
        .in("reservation_parent_code", chunk)
      if (error) return { ...base, error: `lettura gruppi fallita: ${error.message}` }
      for (const r of (data ?? []) as Array<{ reservation_parent_code: string | null }>) {
        if (r.reservation_parent_code) aliveParents.add(r.reservation_parent_code)
      }
    }
  }

  const rescueIds = new Set<string>()
  const toVerify: Cand[] = []
  for (const c of candRows) {
    if (c.parent && aliveParents.has(c.parent)) rescueIds.add(c.id)
    else toVerify.push(c)
  }

  // ── VERIFICA MIRATA (finestra GIORNALIERA) ─────────────────────────────────
  // La deriva di paginazione esiste anche nella finestra mensile del full sweep
  // (Cavallino luglio: 223 dichiarate, solo ~172 distinte rese). Una finestra
  // GIORNALIERA sul checkin del candidato ha pochissime prenotazioni e deriva
  // ~zero: e' la prova affidabile di "ancora viva" vs "davvero cancellata".
  // Costruiamo il client BRiG best-effort: se non disponibile, NON tombstoniamo
  // nulla di non verificato (conservativo).
  let client: BrigClient | null = null
  try {
    const { data: integ } = await supabase
      .from("pms_integrations")
      .select("api_key, property_id, endpoint_url")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "brig")
      .eq("integration_mode", "api")
      .maybeSingle()
    const baseUrl = integ?.endpoint_url || process.env.BRIG_BASE_URL
    if (integ?.api_key && integ?.property_id && baseUrl) {
      client = new BrigClient({ baseUrl, apiKey: integ.api_key, structureId: integ.property_id })
    }
  } catch {
    /* best-effort: lasciamo client=null */
  }

  const seenInVerify = new Set<string>()
  const verifiedDates = new Set<string>()
  let verifiedWindows = 0
  let quotaExceeded = false
  const datesToVerify = [
    ...new Set(toVerify.map((c) => c.checkin?.slice(0, 10)).filter(Boolean) as string[]),
  ].sort()

  if (client) {
    for (const date of datesToVerify) {
      if (verifiedWindows >= BRIG_RECONCILE_MAX_VERIFY_WINDOWS) break
      const next = new Date(`${date}T00:00:00.000Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      const endIso = next.toISOString().slice(0, 10)
      try {
        for (let page = 1; page <= BRIG_RECONCILE_MAX_PAGES_PER_WINDOW; page++) {
          const resp = await client.getReservations({
            page,
            pageSize: 50,
            extra: buildCheckinWindowFilter(date, endIso),
          })
          const items = resp.items ?? resp.data ?? resp.reservations ?? []
          for (const it of items) if (it._id) seenInVerify.add(it._id)
          if (items.length < 50 || resp.lastPage === true) break
        }
        verifiedDates.add(date)
        verifiedWindows++
      } catch (err) {
        const body = err instanceof BrigError ? err.body : String(err)
        if (isBrigDailyQuotaExceeded(body)) {
          quotaExceeded = true
          break
        }
        // Errore transitorio su questa finestra: non verificata, candidati
        // di questo giorno restano intatti (deferred). Proseguiamo.
      }
    }
  }

  // Classificazione finale.
  const tombstoneIds: string[] = []
  let deferred = 0
  for (const c of toVerify) {
    const d = c.checkin?.slice(0, 10)
    if (seenInVerify.has(c.id)) {
      rescueIds.add(c.id) // ri-avvistata nel feed → viva
    } else if (d && verifiedDates.has(d)) {
      tombstoneIds.push(c.id) // verificata assente nel giorno → cancellazione reale
    } else {
      deferred++ // non verificata in questo run → intatta (conservativo)
    }
  }

  // Rescue: bump last_seen_at (e flag a false) per i salvati, cosi' non
  // ritornano candidati ad ogni run.
  if (rescueIds.size > 0) {
    const nowIso = new Date().toISOString()
    const ids = [...rescueIds]
    const CHUNK = 500
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { error } = await supabase
        .schema("connectors")
        .from("brig_raw_bookings")
        .update({ last_seen_at: nowIso, is_stale_cancelled: false })
        .eq("hotel_id", hotelId)
        .in("brig_reservation_id", chunk)
      if (error) return { ...base, error: `rescue fallito: ${error.message}` }
    }
  }

  // Applica il tombstone SOLO ai verificati-assenti (chunked).
  let tombstoned = 0
  const CHUNK = 500
  for (let i = 0; i < tombstoneIds.length; i += CHUNK) {
    const chunk = tombstoneIds.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .schema("connectors")
      .from("brig_raw_bookings")
      .update({ is_stale_cancelled: true }, { count: "exact" })
      .eq("hotel_id", hotelId)
      .in("brig_reservation_id", chunk)
    if (error) return { ...base, tombstoned, error: `tombstone fallito: ${error.message}` }
    tombstoned += count ?? chunk.length
  }

  // eslint-disable-next-line no-console
  console.log(
    `[v0] BRiG stale-cancel reconcile hotel=${hotelId} graceDays=${graceDays} ` +
      `candidates=${candRows.length} rescued=${rescueIds.size} tombstoned=${tombstoned} ` +
      `deferred=${deferred} verifiedWindows=${verifiedWindows}${quotaExceeded ? " (quota esaurita)" : ""} ` +
      `(futureActive=${base.futureActive})`,
  )
  return {
    ...base,
    ok: true,
    tombstoned,
    rescued: rescueIds.size,
    verifiedWindows,
    deferred,
    quotaExceeded,
  }
}
