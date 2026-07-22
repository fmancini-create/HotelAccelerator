import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// Single-hotel run, incrementale: tipicamente < 30s. Settato 120s come safety net.
export const maxDuration = 120

/**
 * POST /api/superadmin/backfill-rate-fields
 *
 * Ripopola le colonne `bookings.rate_id`, `rate_name`, `rate_code` sulle
 * prenotazioni storiche, leggendo `scidoo_raw_bookings.raw_data.rate_id` /
 * `raw_data.rate_name` e facendo lookup contro la tabella `rates`.
 *
 * Necessario perche' fino al 30/04/2026 il sync NON popolava questi campi:
 *   - /dati/bookings mostrava "Tariffa: -" per ogni booking storico
 *   - /dati/guard faceva any-rate fallback su last_sent_prices, attribuendo
 *     tariffe non vendute su quel canale (es. Be Safe Barronci a Booking).
 *
 * Body opzionale:
 *   - hotelId?: string — limita a un singolo hotel (raccomandato dalla UI).
 *   - maxBookings?: number — cap di sicurezza per evitare timeout su Vercel
 *     (default 5000). La UI puo' richiamare l'endpoint piu' volte se "done=false".
 *
 * INCREMENTALE: lavora SOLO sui bookings con `rate_id IS NULL`. Alla seconda
 * esecuzione consecutiva su un hotel gia' processato e' praticamente no-op
 * (~1s). Idempotente.
 *
 * Solo super_admin.
 */
export async function POST(request: NextRequest) {
  // Auth: super_admin only - allineato a /api/admin/connectors-health/* (force-etl, diagnose,
  // reconcile-cancellations). Usa getAuthUserOrDev che gestisce correttamente i casi
  // dev/sandbox quando i cookies non sono propagati al worker (motivo per cui il pattern
  // createClient() diretto restituiva 403 dalla pagina diagnose).
  const { user, supabase: authClient } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: { hotelId?: string; maxBookings?: number } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const filterHotelId: string | null = body.hotelId || null
  // Cap di sicurezza per stare sotto i 120s di Vercel anche su Barronci.
  // 5000 update *.eq().eq() impiegano ~30-60s. La UI re-invoca finche' done=false.
  const maxBookings = Math.max(100, Math.min(20000, body.maxBookings ?? 5000))

  const svc = await createServiceRoleClient()

  // Carica gli hotel da processare.
  const hotelsQuery = svc.from("hotels").select("id, name")
  const { data: hotels, error: hotelsErr } = filterHotelId
    ? await hotelsQuery.eq("id", filterHotelId)
    : await hotelsQuery
  if (hotelsErr) {
    return NextResponse.json({ error: hotelsErr.message }, { status: 500 })
  }
  if (!hotels || hotels.length === 0) {
    return NextResponse.json({ error: "Nessun hotel trovato" }, { status: 404 })
  }

  const results: Array<{
    hotel_id: string
    hotel: string
    target: number // bookings con rate_id IS NULL trovati (cap a maxBookings per chunk)
    matched: number // bookings che il raw aveva rate_id
    updated: number // update riusciti
    missingRateRow: number // pms_rate_id non in rates
    bookingsWithoutRawRate: number // raw senza rate_id
    healedRates: number // rates auto-allineate scidoo_rate_id <-> pms_rate_id
    /** Top-10 pms_rate_id che non matchano nessuna riga in rates, ordinati per frequenza. */
    missingRateIdSamples?: Array<{
      pms_rate_id: string
      count: number
      rate_name_in_raw: string | null
      /** Booking di esempio che usa questo pms_rate_id (arrivo + ospite, per identificare la tariffa). */
      sample_booking?: {
        /** Identificativo PMS della prenotazione (campo neutro per Guard UI). */
        pms_ref: string
        check_in_date: string | null
        guest_name: string | null
      } | null
    }>
    /** Sample dei rate_id presenti in rates per confronto formato. */
    presentRateIds?: Array<{ pms_rate_id: string; name: string | null; code: string | null }>
    done: boolean // true se nessun bookings con rate_id IS NULL e' rimasto
    error?: string
    durationMs?: number
  }> = []

  for (const hotel of hotels) {
    const hotelStart = Date.now()
    let healedRates = 0
    try {
      // 0. AUTO-HEAL rimosso (RETTIFICA 30/04/2026 sera): la colonna
      //    `pms_rate_id` su `rates` NON esiste in questo schema. La memoria
      //    precedente che documentava "due colonne legacy" era un errore.
      //    Ogni UPDATE/SELECT su `pms_rate_id` ritornava error 42703 silenzioso
      //    e bloccava la POST `/api/settings/rate-mappings/create` con il
      //    messaggio "Could not find the 'pms_rate_id' column of 'rates' in
      //    the schema cache". `healedRates` resta a 0 per backward compat
      //    della response shape.

      // 1. Cache rates scidoo_rate_id -> { id, name, code } per questo hotel.
      const rateCache = new Map<
        string,
        { id: string; name: string | null; code: string | null }
      >()
      const { data: ratesRows, error: ratesErr } = await svc
        .from("rates")
        .select("id, scidoo_rate_id, name, code")
        .eq("hotel_id", hotel.id)
      if (ratesErr) {
        console.error(
          `[v0] backfill-rate-fields ${hotel.name}: rate cache load failed (non-fatal):`,
          ratesErr.message,
        )
      }
      for (const r of ratesRows || []) {
        if (r.scidoo_rate_id) {
          rateCache.set(String(r.scidoo_rate_id), {
            id: r.id,
            name: r.name,
            code: r.code,
          })
        }
      }

      // 2. Pesco SOLO i bookings con rate_id IS NULL E rate_code IS NULL.
      //    Il filtro su rate_code esclude i booking gia' "marcati" da un run
      //    precedente con un sentinel (WALKIN_NO_RATE / OTA_NO_RATE): senza
      //    questa esclusione il backfill ripescherebbe all'infinito le
      //    prenotazioni per cui Scidoo non trasmette il rate_id (~1164 su
      //    Barronci: walk-in inseriti manualmente + OTA che non comunicano
      //    la tariffa). Vedi sentinel logic piu' sotto.
      const { data: targetBookings, error: bookErr } = await svc
        .from("bookings")
        // FEATURE 01/05/2026: aggiunti check_in_date + guest_name per il
        // sample booking nel diagnostic panel.
        .select("id, pms_booking_id, check_in_date, guest_name")
        .eq("hotel_id", hotel.id)
        .is("rate_id", null)
        .is("rate_code", null)
        .limit(maxBookings)
      if (bookErr) throw bookErr

      const target = targetBookings?.length ?? 0
      if (target === 0) {
        results.push({
          hotel_id: hotel.id,
          hotel: hotel.name,
          target: 0,
          matched: 0,
          updated: 0,
          missingRateRow: 0,
          bookingsWithoutRawRate: 0,
          healedRates,
          done: true,
          durationMs: Date.now() - hotelStart,
        })
        continue
      }

      // 3. Pesco i raw corrispondenti (chunk IN(...) per evitare query enorme).
      const pmsIds = (targetBookings || [])
        .map((b) => b.pms_booking_id)
        .filter((x): x is string => !!x)
      const rawByPmsId = new Map<
        string,
        {
          rate_id: unknown
          rate_name: string | null
          origin: unknown
          // Tipo esplicito del payload Scidoo. Valori osservati su Barronci:
          //  - "Senza Soggiorno"   => day-use / centro benessere / eventi
          //  - "Ristorante"        => coperti del ristorante
          //  - "Testata (Gruppo)"  => riga-padre di prenotazione di gruppo
          //  - null / "camera"     => camera reale (deve avere rate_id)
          type: unknown
        }
      >()
      const FETCH_CHUNK = 200
      for (let i = 0; i < pmsIds.length; i += FETCH_CHUNK) {
        const slice = pmsIds.slice(i, i + FETCH_CHUNK)
        const { data: rawRows, error: rawErr } = await svc
          .from("scidoo_raw_bookings")
          .select("scidoo_booking_id, raw_data")
          .eq("hotel_id", hotel.id)
          .in("scidoo_booking_id", slice)
        if (rawErr) throw rawErr
        for (const row of rawRows || []) {
          const raw = (row.raw_data as Record<string, unknown>) || {}
          rawByPmsId.set(String(row.scidoo_booking_id), {
            rate_id: raw.rate_id,
            rate_name: typeof raw.rate_name === "string" ? raw.rate_name : null,
            // `origin` resta solo come info diagnostica (canale OTA / walk-in);
            // la classificazione del sentinel adesso usa `type` come fonte
            // primaria perche' molto piu' affidabile (vedi sotto).
            origin: raw.origin,
            type: raw.type,
          })
        }
      }

      // 4. Calcolo gli update.
      let matched = 0
      let updated = 0
      let missingRateRow = 0
      let bookingsWithoutRawRate = 0
      // Diagnostic: contiamo le occorrenze dei pms_rate_id che non matchano
      // nessuna riga in rates, cosi' la UI puo' mostrare i top-N e capire se
      // sono rate dismesse (Scidoo non le restituisce piu') o un mismatch di
      // formato (es. trim/case/leading-zero/typeof number vs string).
      const missingRateIdCounts = new Map<string, number>()
      const sampleRateNamesPerMissingId = new Map<string, string>()
      // FEATURE 01/05/2026 (richiesta utente "dai la possibilita' di far
      // aprire la prenotazione cosi' da verificare"): per ogni pms_rate_id
      // mancante salviamo UN booking di esempio con check-in + ospite. Cosi'
      // il superadmin puo' aprirlo per riconoscere la tariffa quando il
      // raw Scidoo non ha piu' il `rate_name` (rate archiviata).
      const sampleBookingPerMissingId = new Map<
        string,
        { pms_ref: string; check_in_date: string | null; guest_name: string | null }
      >()
      const updates: Array<{
        pms_booking_id: string
        rate_id: string | null
        rate_name: string | null
        rate_code: string | null
      }> = []
      for (const b of targetBookings || []) {
        if (!b.pms_booking_id) continue
        const raw = rawByPmsId.get(b.pms_booking_id)
        if (!raw) {
          // Booking senza raw corrispondente (RMS orphan): non possiamo
          // backfillare. Saltiamo, non e' un errore.
          continue
        }
        const pmsRateId =
          raw.rate_id != null && String(raw.rate_id).trim() !== ""
            ? String(raw.rate_id)
            : null
        if (!pmsRateId) {
          // Il PMS non ha trasmesso un rate_id per questo booking. NON e'
          // un errore di sync: e' un fenomeno strutturale di Scidoo.
          //
          // Verifica su Barronci (1164 bookings, 15/05/2026):
          //   - 61% type="Senza Soggiorno"  -> day-use / centro benessere / eventi
          //   - 23% type="Testata (Gruppo)" -> riga-padre di gruppo (i figli hanno rate_id)
          //   - 16% type="Ristorante"       -> coperti del ristorante
          //   -  0% camere reali rotte
          //
          // Marchiamo il booking con un sentinel su `rate_code` (lasciando
          // `rate_id` NULL: non possiamo inventare una FK). Il filtro al
          // punto 2 esclude i sentinel dai run successivi, cosi' non
          // ripeschiamo questi 1000+ bookings all'infinito.
          bookingsWithoutRawRate++
          const rawType =
            typeof (raw as { type?: unknown }).type === "string"
              ? (raw as { type: string }).type.trim()
              : ""
          const rawOrigin =
            typeof (raw as { origin?: unknown }).origin === "string" ||
            typeof (raw as { origin?: unknown }).origin === "number"
              ? String((raw as { origin: unknown }).origin)
              : ""

          // Classifica sul `type` esplicito di Scidoo. Fallback su `origin`
          // solo se type e' vuoto (vecchi raw senza il campo).
          let sentinelCode: string
          let sentinelName: string
          if (
            rawType.toLowerCase().includes("senza soggiorno") ||
            rawType.toLowerCase().includes("day use") ||
            rawType.toLowerCase().includes("benessere")
          ) {
            sentinelCode = "EXTRA_NO_STAY"
            sentinelName = "Servizio extra (no pernotto)"
          } else if (rawType.toLowerCase().includes("ristorante")) {
            sentinelCode = "EXTRA_RESTAURANT"
            sentinelName = "Ristorante"
          } else if (
            rawType.toLowerCase().includes("testata") ||
            rawType.toLowerCase().includes("gruppo")
          ) {
            sentinelCode = "GROUP_HEADER"
            sentinelName = "Testata gruppo (no tariffa)"
          } else if (rawOrigin === "0" || rawOrigin === "") {
            sentinelCode = "WALKIN_NO_RATE"
            sentinelName = "Diretta (no tariffa)"
          } else {
            sentinelCode = "OTA_NO_RATE"
            sentinelName = "OTA (tariffa non trasmessa)"
          }
          updates.push({
            pms_booking_id: b.pms_booking_id,
            rate_id: null,
            rate_name: sentinelName,
            rate_code: sentinelCode,
          })
          continue
        }
        const rateInfo = rateCache.get(pmsRateId)
        if (!rateInfo) {
          missingRateRow++
          missingRateIdCounts.set(pmsRateId, (missingRateIdCounts.get(pmsRateId) ?? 0) + 1)
          if (raw.rate_name && !sampleRateNamesPerMissingId.has(pmsRateId)) {
            sampleRateNamesPerMissingId.set(pmsRateId, raw.rate_name)
          }
          // Salva il primo booking di esempio per questo pms_rate_id orfano
          // (utile per identificare manualmente la tariffa).
          if (!sampleBookingPerMissingId.has(pmsRateId) && b.pms_booking_id) {
            sampleBookingPerMissingId.set(pmsRateId, {
              pms_ref: b.pms_booking_id,
              check_in_date: (b as { check_in_date?: string | null }).check_in_date ?? null,
              guest_name: (b as { guest_name?: string | null }).guest_name ?? null,
            })
          }
        }
        updates.push({
          pms_booking_id: b.pms_booking_id,
          rate_id: rateInfo?.id || null,
          rate_name: raw.rate_name || rateInfo?.name || null,
          rate_code: pmsRateId,
        })
        matched++
      }

      // Top-10 pms_rate_id mancanti (ordinati per frequenza) + sample dei
      // rate_id presenti in rates per confronto immediato dei formati.
      const missingRateIdSamples = Array.from(missingRateIdCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([rid, count]) => ({
          pms_rate_id: rid,
          count,
          rate_name_in_raw: sampleRateNamesPerMissingId.get(rid) ?? null,
          sample_booking: sampleBookingPerMissingId.get(rid) ?? null,
        }))
      const presentRateIds = Array.from(rateCache.entries())
        .slice(0, 10)
        .map(([rid, info]) => ({
          pms_rate_id: rid,
          name: info.name,
          code: info.code,
        }))

      // 5. Update parallelizzato in chunk da 50.
      const UPDATE_CHUNK = 50
      for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
        const slice = updates.slice(i, i + UPDATE_CHUNK)
        const tasks = slice.map((u) =>
          svc
            .from("bookings")
            .update({
              rate_id: u.rate_id,
              rate_name: u.rate_name,
              rate_code: u.rate_code,
              updated_at: new Date().toISOString(),
            })
            .eq("hotel_id", hotel.id)
            .eq("pms_booking_id", u.pms_booking_id),
        )
        const settled = await Promise.allSettled(tasks)
        for (const s of settled) {
          if (s.status === "fulfilled" && !s.value.error) updated++
        }
      }

      // 6. Verifica se ci sono ancora bookings con rate_id IS NULL non
      //    coperti da questo run (= target ha raggiunto il cap maxBookings).
      const done = target < maxBookings

      console.log(
        `[v0] backfill-rate-fields ${hotel.name}: target=${target} matched=${matched} updated=${updated} done=${done} elapsed=${Date.now() - hotelStart}ms`,
      )

      results.push({
        hotel_id: hotel.id,
        hotel: hotel.name,
        target,
        matched,
        updated,
        missingRateRow,
        bookingsWithoutRawRate,
        healedRates,
        missingRateIdSamples,
        presentRateIds,
        done,
        durationMs: Date.now() - hotelStart,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[v0] backfill-rate-fields error for", hotel.name, msg)
      results.push({
        hotel_id: hotel.id,
        hotel: hotel.name,
        target: 0,
        matched: 0,
        updated: 0,
        missingRateRow: 0,
        bookingsWithoutRawRate: 0,
        healedRates: 0,
        done: false,
        error: msg,
        durationMs: Date.now() - hotelStart,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    hotels: results,
    summary: {
      hotels: results.length,
      totalUpdated: results.reduce((s, r) => s + r.updated, 0),
      totalMatched: results.reduce((s, r) => s + r.matched, 0),
      allDone: results.every((r) => r.done),
    },
  })
}
