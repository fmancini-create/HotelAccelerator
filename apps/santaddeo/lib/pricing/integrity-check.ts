/**
 * Pricing integrity checks — rileva i due sintomi dell'incidente "i prezzi
 * spariscono" (15/07/2026, wipe parametri Barronci set-dic):
 *
 *   A. MASS DELETE (wipe): una singola transazione DB cancella DECINE di
 *      param_key diversi da pricing_algo_params. E' la firma inconfondibile
 *      del bug "DELETE a prodotto cartesiano" (data × chiave). Una
 *      cancellazione LEGITTIMA (utente che svuota una cella o azzera un
 *      singolo parametro su un range) tocca 1-2 param_key: quindi filtriamo
 *      per numero di CHIAVI DISTINTE cancellate nello stesso txid, non per
 *      conteggio grezzo -> zero falsi positivi sui clear legittimi.
 *
 *   B. HORIZON GAP: un hotel ha la tariffa di partenza (base_rate) compilata
 *      fino a una data lontana ma con un BUCO in mezzo (es. dati fino a fine
 *      anno ma vuoti da settembre). E' il sintomo diretto del danno visibile
 *      in griglia. Ignoriamo gli hotel senza base_rate (non compilati) e i
 *      buchi di 1 solo giorno (rumore).
 *
 * Entrambe le funzioni sono PURE rispetto al DB (accettano il client), cosi'
 * il cron le orchestra e l'unico effetto collaterale (insert alert + email)
 * resta nel route handler.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/** Firma del wipe: quante param_key DISTINTE deve toccare un singolo txid
 *  perche' sia considerato una cancellazione di massa (non un clear manuale). */
export const MASS_DELETE_MIN_DISTINCT_KEYS = 12
/** Guardia aggiuntiva: righe totali minime nel txid (evita rumore). */
export const MASS_DELETE_MIN_ROWS = 40
/** Buco minimo (giorni mancanti) perche' un horizon gap sia segnalato. */
export const HORIZON_GAP_MIN_MISSING = 5
/** Non segnaliamo buchi se l'orizzonte compilato e' cortissimo (hotel appena
 *  avviato): la max date deve essere almeno N giorni nel futuro. */
export const HORIZON_MIN_MAX_DAYS_AHEAD = 21
/** Quota di camere fuori servizio oltre la quale un giorno e' considerato di
 *  CHIUSURA EFFETTIVA (ferie/manutenzione) e quindi NON un buco: su un giorno
 *  chiuso e' legittimo non avere base_rate. Sopra questa soglia (o con capacita'
 *  netta 0) l'hotel non sta realmente vendendo. Vedi falso positivo Moriano
 *  01-10/02/2027 (9/10 camere in ferie, base_rate mai creata -> nessuna perdita
 *  dati, audit vuoto). NB: il rilevatore di PERDITA DATI reale (mass_delete,
 *  basato sull'audit) resta autoritativo e non e' influenzato da questa soglia. */
export const CLOSURE_OOS_RATIO = 0.8

export interface MassDeleteFinding {
  txid: string
  hotelId: string | null
  hotelName: string | null
  deletedRows: number
  distinctKeys: number
  sampleKeys: string[]
  dateRange: { min: string | null; max: string | null }
  ts: string
  sessionUser: string | null
  applicationName: string | null
  clientAddr: string | null
}

export interface HorizonGapFinding {
  hotelId: string
  hotelName: string | null
  maxDate: string
  presentDays: number
  expectedDays: number
  missingDays: number
  missingRanges: Array<{ from: string; to: string }>
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

/**
 * A. Rileva transazioni di cancellazione di massa nell'audit log entro la
 * finestra `sinceIso`. Raggruppa per txid; una transazione e' un wipe se
 * cancella >= MASS_DELETE_MIN_DISTINCT_KEYS param_key distinte.
 */
export async function detectMassDeletes(
  supabase: SupabaseLike,
  sinceIso: string,
): Promise<MassDeleteFinding[]> {
  const { data, error } = await supabase
    .from("pricing_algo_params_audit")
    .select(
      "txid, hotel_id, ts, param_key, date, session_user_name, application_name, client_addr",
    )
    .eq("operation", "DELETE")
    .gte("ts", sinceIso)
    .order("ts", { ascending: false })
    .limit(50000)

  if (error) throw new Error(`audit read failed: ${error.message}`)
  const rows = (data || []) as Array<{
    txid: number | string | null
    hotel_id: string | null
    ts: string
    param_key: string | null
    date: string | null
    session_user_name: string | null
    application_name: string | null
    client_addr: string | null
  }>

  // Raggruppa per txid (un txid puo' toccare piu' hotel in teoria; qui la
  // chiave e' txid+hotel per attribuzione corretta).
  const groups = new Map<
    string,
    {
      txid: string
      hotelId: string | null
      rows: number
      keys: Set<string>
      dates: string[]
      ts: string
      sessionUser: string | null
      applicationName: string | null
      clientAddr: string | null
    }
  >()

  for (const r of rows) {
    if (r.txid == null) continue
    const gk = `${r.txid}|${r.hotel_id ?? "null"}`
    let g = groups.get(gk)
    if (!g) {
      g = {
        txid: String(r.txid),
        hotelId: r.hotel_id,
        rows: 0,
        keys: new Set(),
        dates: [],
        ts: r.ts,
        sessionUser: r.session_user_name,
        applicationName: r.application_name,
        clientAddr: r.client_addr,
      }
      groups.set(gk, g)
    }
    g.rows++
    if (r.param_key) g.keys.add(r.param_key)
    if (r.date) g.dates.push(r.date)
    // tieni il ts piu' recente della transazione
    if (r.ts > g.ts) g.ts = r.ts
  }

  const findings: MassDeleteFinding[] = []
  for (const g of groups.values()) {
    if (
      g.keys.size >= MASS_DELETE_MIN_DISTINCT_KEYS &&
      g.rows >= MASS_DELETE_MIN_ROWS
    ) {
      const sortedDates = g.dates.filter(Boolean).sort()
      findings.push({
        txid: g.txid,
        hotelId: g.hotelId,
        hotelName: null, // risolto dal cron
        deletedRows: g.rows,
        distinctKeys: g.keys.size,
        sampleKeys: Array.from(g.keys).slice(0, 8),
        dateRange: {
          min: sortedDates[0] ?? null,
          max: sortedDates[sortedDates.length - 1] ?? null,
        },
        ts: g.ts,
        sessionUser: g.sessionUser,
        applicationName: g.applicationName,
        clientAddr: g.clientAddr,
      })
    }
  }
  // piu' righe cancellate prima
  return findings.sort((a, b) => b.deletedRows - a.deletedRows)
}

/**
 * Carica l'insieme dei giorni di CHIUSURA EFFETTIVA di un hotel in [min,max]:
 * un giorno e' chiuso se la capacita' netta della struttura e' 0 oppure se la
 * quota di camere fuori servizio supera CLOSURE_OOS_RATIO. Serve a NON contare
 * come "buco" i periodi di ferie/manutenzione, dove e' normale non avere una
 * tariffa di partenza. Se per un giorno non esistono righe di disponibilita'
 * (dato non sincronizzato), il giorno NON e' marcato chiuso -> comportamento
 * conservativo (un eventuale buco reale resta segnalabile).
 */
async function loadClosedDates(
  supabase: SupabaseLike,
  hotelId: string,
  minIso: string,
  maxIso: string,
): Promise<Set<string>> {
  const totalByDate = new Map<string, { total: number; oos: number }>()
  let offset = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase
      .from("daily_availability")
      .select("date, total_rooms, rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .gte("date", minIso)
      .lte("date", maxIso)
      .order("date", { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`availability read failed (${hotelId}): ${error.message}`)
    const chunk = (data || []) as Array<{
      date: string
      total_rooms: number | null
      rooms_out_of_service: number | null
    }>
    for (const r of chunk) {
      const cur = totalByDate.get(r.date) || { total: 0, oos: 0 }
      cur.total += r.total_rooms || 0
      cur.oos += Math.max(0, r.rooms_out_of_service || 0)
      totalByDate.set(r.date, cur)
    }
    if (chunk.length < pageSize) break
    offset += pageSize
  }
  const closed = new Set<string>()
  for (const [date, { total, oos }] of totalByDate) {
    if (total <= 0) continue
    const net = total - oos
    if (net <= 0 || oos / total >= CLOSURE_OOS_RATIO) closed.add(date)
  }
  return closed
}

/**
 * B. Rileva buchi nell'orizzonte della tariffa di partenza (base_rate) per
 * ogni hotel attivo. Un buco = giorni senza base_rate compresi tra oggi e
 * l'ultima data compilata dell'hotel, ESCLUSI i giorni di chiusura effettiva
 * (ferie/manutenzione), dove e' legittimo non avere una tariffa.
 */
export async function detectHorizonGaps(
  supabase: SupabaseLike,
): Promise<HorizonGapFinding[]> {
  const { data: hotels, error: hErr } = await supabase
    .from("hotels")
    .select("id, name")
    .eq("is_active", true)
  if (hErr) throw new Error(`hotels read failed: ${hErr.message}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = isoDate(today)

  const findings: HorizonGapFinding[] = []

  for (const hotel of (hotels || []) as Array<{ id: string; name: string | null }>) {
    // Carica tutte le date base_rate >= oggi (1 riga/giorno; pagina a 1000).
    const dates: string[] = []
    let offset = 0
    const pageSize = 1000
    for (;;) {
      const { data, error } = await supabase
        .from("pricing_algo_params")
        .select("date")
        .eq("hotel_id", hotel.id)
        .eq("param_key", "base_rate")
        .gte("date", todayIso)
        .order("date", { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) throw new Error(`base_rate read failed (${hotel.id}): ${error.message}`)
      const chunk = (data || []) as Array<{ date: string }>
      for (const c of chunk) dates.push(c.date)
      if (chunk.length < pageSize) break
      offset += pageSize
    }

    if (dates.length === 0) continue // hotel non compilato: non e' un buco

    const maxDate = dates[dates.length - 1]
    const maxDaysAhead = Math.round(
      (new Date(maxDate).getTime() - today.getTime()) / 86_400_000,
    )
    if (maxDaysAhead < HORIZON_MIN_MAX_DAYS_AHEAD) continue // orizzonte corto: skip

    // Giorni di chiusura effettiva (ferie/manutenzione): non sono buchi.
    const closed = await loadClosedDates(supabase, hotel.id, todayIso, maxDate)

    const present = new Set(dates)
    const expectedDays = maxDaysAhead + 1
    const missingRanges: Array<{ from: string; to: string }> = []
    let missingDays = 0
    let runStart: string | null = null
    let prevMissing = false

    for (let i = 0; i < expectedDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const di = isoDate(d)
      // Un giorno chiuso e' trattato come "presente" (nessun buco): su una
      // struttura in ferie e' normale non avere tariffa di partenza.
      const isMissing = !present.has(di) && !closed.has(di)
      if (isMissing) {
        missingDays++
        if (!prevMissing) runStart = di
        // se e' l'ultimo giorno, chiudi il run
        if (i === expectedDays - 1 && runStart) {
          missingRanges.push({ from: runStart, to: di })
        }
      } else if (prevMissing && runStart) {
        // chiudi il run al giorno precedente
        const prev = new Date(today)
        prev.setDate(prev.getDate() + i - 1)
        missingRanges.push({ from: runStart, to: isoDate(prev) })
        runStart = null
      }
      prevMissing = isMissing
    }

    if (missingDays >= HORIZON_GAP_MIN_MISSING) {
      findings.push({
        hotelId: hotel.id,
        hotelName: hotel.name,
        maxDate,
        presentDays: dates.length,
        expectedDays,
        missingDays,
        missingRanges: missingRanges.slice(0, 6),
      })
    }
  }

  return findings.sort((a, b) => b.missingDays - a.missingDays)
}
