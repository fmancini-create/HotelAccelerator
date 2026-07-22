/**
 * GET /api/admin/connectors-health/diagnose
 *
 * Endpoint diagnostico read-only multi-provider (Scidoo + BRiG). Affianca
 * il check generico drift% di /superadmin/connectors-health con metriche
 * azionabili che separano le 4 cause distinte di disallineamento RAW↔RMS:
 *
 *  1. backlog ETL          -> raw con processed=false (basta forzare l'ETL)
 *  2. raw orphan           -> raw senza booking (mapping fail / bug ETL)
 *  3. rms orphan           -> booking senza raw (residuo storico / sync incompleto)
 *  4. status drift         -> raw cancellato ma booking attivo, o viceversa
 *
 * 19/05/2026: aggiunto supporto BRiG. Schema diverso da Scidoo:
 *  - tabella raw `brig_raw_bookings`
 *  - chiave naturale `brig_reservation_id` (mappata a bookings.pms_booking_id)
 *  - cancellazione tramite `cancellation_date IS NOT NULL` (Scidoo usa `status='annullata'`)
 *  - niente concetto di rate_id nel raw -> bookings_missing_rate_* sempre 0
 * Le diff RAW/RMS funzionano comunque (Set comparison sugli ID).
 */
import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Lasciamo respiro: 19k+17k IDs su Barronci richiedono ~37 round-trip
export const maxDuration = 60

const PAGE_SIZE = 1000

// 19/05/2026: configurazione per provider per evitare branching ovunque.
// Scidoo: `status='annullata'` segna le cancellate, raw ha `rate_id` per
//   il backfill anti-"Be Safe su OTA".
// BRiG:   `cancellation_date IS NOT NULL` segna le cancellate, lo schema
//   non ha rate_id (info di tariffa serializzate altrove).
type ProviderName = "scidoo" | "brig"

interface ProviderConfig {
  rawTable: string
  rawIdField: string // colonna RAW da mappare a bookings.pms_booking_id
  hasRateInRaw: boolean
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  scidoo: { rawTable: "scidoo_raw_bookings", rawIdField: "scidoo_booking_id", hasRateInRaw: true },
  brig: { rawTable: "brig_raw_bookings", rawIdField: "brig_reservation_id", hasRateInRaw: false },
}

interface RawIdRow {
  raw_id: string // scidoo_booking_id o brig_reservation_id (alias normalizzato)
  is_cancelled: boolean // calcolato lato JS in base al provider
}
interface BookingIdRow {
  pms_booking_id: string
  is_cancelled: boolean
}

interface HotelDiagnose {
  hotel_id: string
  hotel_name: string
  provider: ProviderName
  raw: { total: number; unprocessed: number; cancelled: number }
  rms: { total: number; cancelled: number }
  match: {
    matched: number
    raw_orphan: number
    rms_orphan: number
    status_drift_pms_cancelled_rms_active: number
    status_drift_pms_active_rms_cancelled: number
  }
  /**
   * Booking con rate_id IS NULL — count totale.
   * Mantenuto per backward compat. Per la UI di anomalia usare i due
   * campi sotto che distinguono FIXABLE vs LEGITIMATE (vedi commento).
   */
  bookings_missing_rate: number
  /**
   * Booking con bookings.rate_id IS NULL MA il raw Scidoo contiene un
   * `rate_id` valido. Sono i veri "missed" del sync — devono essere
   * backfillati altrimenti il Guard attribuisce rate sbagliate (es.
   * "Be Safe" sui booking OTA, vedi memoria 30/04/2026).
   */
  bookings_missing_rate_fixable: number
  /**
   * Booking con bookings.rate_id IS NULL E il raw Scidoo NON ha rate_id.
   * Sono prenotazioni create direttamente nel PMS senza tariffa
   * associata (scenario legittimo per case vacanze e gruppi). NON sono
   * un'anomalia — solo un dato informativo. Il Guard cadra' sul
   * fallback any-rate e classifichera' "warning: tariffa non monitorata".
   */
  bookings_missing_rate_legitimate: number
  verdict: "healthy" | "backlog" | "etl_drift" | "historical_drift" | "status_drift" | "mixed"
  issues: string[]
  durationMs: number
}

/**
 * Fetch paginato per superare il limite Supabase di 1000 righe.
 * Restituisce TUTTE le righe filtrate per hotel_id.
 */
async function fetchAllPaged<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // Loop limit di sicurezza per evitare infinite loop su bug di paginazione.
  for (let i = 0; i < 100; i++) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetcher(from, to)
    if (error) throw new Error(`Pagination error: ${JSON.stringify(error)}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function diagnoseHotel(
  supabase: ReturnType<typeof createServiceClient>,
  hotel: { id: string; name: string; provider: ProviderName },
): Promise<HotelDiagnose> {
  const start = Date.now()
  const cfg = PROVIDERS[hotel.provider]

  // ─── Counts aggregati lato server (HEAD requests, velocissimi) ───────────
  // Cancellate: Scidoo via `status='annullata'`, BRiG via `cancellation_date IS NOT NULL`.
  const cancelledRawQuery =
    hotel.provider === "scidoo"
      ? supabase
          .from(cfg.rawTable)
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("status", "annullata")
      : supabase
          .from(cfg.rawTable)
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .not("cancellation_date", "is", null)

  const [rawTotal, rawUnprocessed, rawCancelled, rmsTotal, rmsCancelled, bookingsMissingRate] = await Promise.all([
    supabase
      .from(cfg.rawTable)
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .then((r) => r.count ?? 0),
    supabase
      .from(cfg.rawTable)
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("processed", false)
      .then((r) => r.count ?? 0),
    cancelledRawQuery.then((r) => r.count ?? 0),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("source", hotel.provider)
      .then((r) => r.count ?? 0),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("source", hotel.provider)
      .eq("is_cancelled", true)
      .then((r) => r.count ?? 0),
    // bookings_missing_rate ha senso solo per Scidoo (BRiG non veicola rate_id nel raw)
    cfg.hasRateInRaw
      ? supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("source", hotel.provider)
          .is("rate_id", null)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ])

  // ─── Pull degli ID per il diff (paginato) ────────────────────────────────
  // Scidoo: status (text) → cancellata se 'annullata'. BRiG: cancellation_date.
  const rawSelectFields =
    hotel.provider === "scidoo"
      ? `${cfg.rawIdField}, status`
      : `${cfg.rawIdField}, cancellation_date`

  const [rawRowsRaw, bookingRows] = await Promise.all([
    fetchAllPaged<Record<string, unknown>>((from, to) =>
      supabase
        .from(cfg.rawTable)
        .select(rawSelectFields)
        .eq("hotel_id", hotel.id)
        .range(from, to),
    ),
    fetchAllPaged<BookingIdRow>((from, to) =>
      supabase
        .from("bookings")
        .select("pms_booking_id, is_cancelled")
        .eq("hotel_id", hotel.id)
        .eq("source", hotel.provider)
        .range(from, to),
    ),
  ])

  // Normalizza il payload raw a { raw_id, is_cancelled }
  const rawRows: RawIdRow[] = rawRowsRaw.map((r) => {
    const id = String(r[cfg.rawIdField] ?? "")
    const cancelled =
      hotel.provider === "scidoo"
        ? String(r.status ?? "").toLowerCase() === "annullata"
        : r.cancellation_date != null
    return { raw_id: id, is_cancelled: cancelled }
  })

  // ─── Set comparison in memoria ───────────────────────────────────────────
  const rawById = new Map<string, RawIdRow>()
  for (const r of rawRows) {
    if (r.raw_id) rawById.set(r.raw_id, r)
  }

  let matched = 0
  let rmsOrphan = 0
  let statusDriftRawCancelledRmsActive = 0
  let statusDriftRawActiveRmsCancelled = 0
  const matchedRawIds = new Set<string>()

  for (const b of bookingRows) {
    const r = rawById.get(b.pms_booking_id)
    if (!r) {
      rmsOrphan++
      continue
    }
    matched++
    matchedRawIds.add(b.pms_booking_id)
    if (r.is_cancelled && !b.is_cancelled) statusDriftRawCancelledRmsActive++
    if (!r.is_cancelled && b.is_cancelled) statusDriftRawActiveRmsCancelled++
  }

  const rawOrphan = rawRows.length - matchedRawIds.size

  // ─── Split bookings_missing_rate in FIXABLE vs LEGITIMATE ────────────────
  // Solo Scidoo: BRiG non veicola rate_id nel raw, quindi non c'e' niente da
  // backfillare. Per BRiG i due contatori restano 0.
  let fixable = 0
  let legitimate = 0
  if (cfg.hasRateInRaw && bookingsMissingRate > 0) {
    // Set degli scidoo_rate_id realmente presenti in `rates` per questo hotel.
    // Un booking e' "fixable" dal backfill SOLO se il rate_id del raw esiste
    // ANCORA in `rates`: altrimenti il backfill non ha una FK da assegnare e
    // rate_id resta NULL (il run marca solo missingRateRow e rate_code col
    // sentinel/pms_rate_id). Senza questo controllo il diagnose contava come
    // "recuperabili dal raw" anche booking che puntano a tariffe DISMESSE in
    // Scidoo (es. Tenuta Moriano: 2 booking di inizio 2025 col rate 110448 non
    // piu' esposto da Scidoo e assente da `rates`). Risultato: card rossa
    // "Senza tariffa 2" che restava tale all'infinito perche' il backfill non
    // poteva farci nulla. Ora quei booking cadono in `legitimate` (tariffa
    // dismessa, niente da backfillare) e non generano piu' un falso allarme.
    const rateIdSet = new Set<string>()
    {
      const { data: ratesRows } = await supabase
        .from("rates")
        .select("scidoo_rate_id")
        .eq("hotel_id", hotel.id)
      for (const rr of ratesRows || []) {
        if (rr.scidoo_rate_id != null) rateIdSet.add(String(rr.scidoo_rate_id).trim())
      }
    }

    // 1) Pms_booking_id dei booking con rate_id null (paginate, cap 5000).
    const missingIds: string[] = []
    let from = 0
    for (let i = 0; i < 5; i++) {
      const to = from + PAGE_SIZE - 1
      const { data } = await supabase
        .from("bookings")
        .select("pms_booking_id")
        .eq("hotel_id", hotel.id)
        .eq("source", hotel.provider)
        .is("rate_id", null)
        .range(from, to)
      if (!data || data.length === 0) break
      for (const r of data) {
        if (r.pms_booking_id) missingIds.push(r.pms_booking_id)
      }
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    // 2) Per quegli ID, leggo solo `raw_data->'rate_id'` (lato JS visto
    //    che il Supabase JS client non supporta path operators nativi).
    //    Batch da 500 ID alla volta per evitare URL troppo lunghi.
    if (missingIds.length > 0) {
      const BATCH = 500
      for (let off = 0; off < missingIds.length; off += BATCH) {
        const slice = missingIds.slice(off, off + BATCH)
        const { data: rawSlice } = await supabase
          .from(cfg.rawTable)
          .select(`${cfg.rawIdField}, raw_data`)
          .eq("hotel_id", hotel.id)
          .in(cfg.rawIdField, slice)
        for (const r of rawSlice || []) {
          const rawRateId = r.raw_data?.rate_id
          // Scidoo serializza spesso "rate_id" come stringa o numero. None,
          // string vuota, "0", "null" sono trattati come "raw senza rate".
          const normRawRateId = rawRateId != null ? String(rawRateId).trim() : ""
          const hasRateInRaw =
            normRawRateId !== "" &&
            normRawRateId !== "0" &&
            normRawRateId.toLowerCase() !== "null"
          // Fixable SOLO se la tariffa del raw esiste ancora in `rates`:
          // altrimenti e' dismessa e il backfill non puo' assegnare il rate_id.
          if (hasRateInRaw && rateIdSet.has(normRawRateId)) fixable++
          else legitimate++
        }
        // Booking missing senza match nel raw (raro: orphan): considerati
        // legittimi perche' non c'e' nulla da backfillare.
        legitimate += slice.length - (rawSlice?.length || 0)
      }
    }
  }

  // ─── Verdict + issue list ────────────────────────────────────────────────
  const flags: HotelDiagnose["verdict"][] = []
  const issues: string[] = []

  if (rawUnprocessed > 0) {
    flags.push("backlog")
    issues.push(`${rawUnprocessed} righe RAW non ancora elaborate dall'ETL — eseguire "Forza ETL"`)
  }
  if (rawOrphan > 0) {
    flags.push("etl_drift")
    issues.push(`${rawOrphan} righe RAW senza prenotazione corrispondente — possibile bug di mapping`)
  }
  if (rmsOrphan > 0) {
    flags.push("historical_drift")
    issues.push(`${rmsOrphan} prenotazioni in RMS senza RAW di origine — residuo storico o sync parziale`)
  }
  const totalStatusDrift = statusDriftRawCancelledRmsActive + statusDriftRawActiveRmsCancelled
  if (totalStatusDrift > 0) {
    flags.push("status_drift")
    issues.push(
      `${totalStatusDrift} prenotazioni con cancellazione disallineata (${statusDriftRawCancelledRmsActive} attive in RMS ma annullate in RAW, ${statusDriftRawActiveRmsCancelled} viceversa)`,
    )
  }

  let verdict: HotelDiagnose["verdict"]
  if (flags.length === 0) verdict = "healthy"
  else if (flags.length === 1) verdict = flags[0]
  else verdict = "mixed"

  return {
    hotel_id: hotel.id,
    hotel_name: hotel.name,
    provider: hotel.provider,
    raw: { total: rawTotal, unprocessed: rawUnprocessed, cancelled: rawCancelled },
    rms: { total: rmsTotal, cancelled: rmsCancelled },
    match: {
      matched,
      raw_orphan: rawOrphan,
      rms_orphan: rmsOrphan,
  status_drift_pms_cancelled_rms_active: statusDriftRawCancelledRmsActive,
  status_drift_pms_active_rms_cancelled: statusDriftRawActiveRmsCancelled,
  },
    bookings_missing_rate: bookingsMissingRate,
    bookings_missing_rate_fixable: fixable,
    bookings_missing_rate_legitimate: legitimate,
    verdict,
    issues,
    durationMs: Date.now() - start,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const onlyHotel = url.searchParams.get("hotel_id") || null

  // Auth: super_admin only
  const { user, supabase: authClient } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Service-role client per bypassare RLS sulle tabelle dell'hotel-scoping
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  )

  // Trova gli hotel con integration Scidoo o BRiG (gli unici provider con
  // pipeline RAW pienamente normalizzata in `bookings`).
  const { data: integrations, error: integErr } = await supabase
    .from("pms_integrations")
    .select("hotel_id, pms_name, hotels(id, name)")
    .in("pms_name", Object.keys(PROVIDERS))
  if (integErr) {
    return NextResponse.json({ error: "integrations_query_failed", detail: integErr.message }, { status: 500 })
  }

  const hotels = (integrations || [])
    .map(
      (row: {
        hotel_id: string
        pms_name: string
        hotels: { id: string; name: string } | null
      }) => ({
        id: row.hotels?.id || row.hotel_id,
        name: row.hotels?.name || "Hotel sconosciuto",
        provider: row.pms_name as ProviderName,
      }),
    )
    .filter((h) => (onlyHotel ? h.id === onlyHotel : true))

  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  // Diagnostica in parallelo (ogni hotel è indipendente)
  const results = await Promise.all(hotels.map((h) => diagnoseHotel(supabase, h)))
  results.sort((a, b) => a.hotel_name.localeCompare(b.hotel_name))

  return NextResponse.json({
    ok: true,
    computedAt: startedAt,
    totalDurationMs: Date.now() - t0,
    hotels: results,
  })
}
