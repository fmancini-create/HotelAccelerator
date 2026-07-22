import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// DECISIONE 30/06/2026 (fix falsi mismatch Guard): vedi /api/guard/scan. Stesso
// comportamento qui per coerenza tra i due entrypoint: confronto SOLO
// all'occupancy reale della prenotazione, nessun fallback a occupancy=2.
const GUARD_OCC2_FALLBACK = false

/**
 * POST /api/guard/check
 *
 * On-demand guard check for a batch of bookings supplied by the caller.
 * Same logic as /api/guard/scan, but:
 *  - does NOT load bookings from DB (caller provides them)
 *  - iterates night-by-night over each booking
 *  - applies both % tolerance and time tolerance (minutes)
 *
 * Body: {
 *   hotelId: string,
 *   bookings: [{
 *     bookingId: string,
 *     bookingDate: string (ISO datetime, when the booking was placed),
 *     checkinDate: string (YYYY-MM-DD),
 *     checkoutDate?: string (YYYY-MM-DD) - if present, multi-night check
 *     roomTypeId: string,
 *     rateId?: string | null,
 *     occupancy: number,
 *     bookedPrice: number,
 *   }]
 * }
 */

type LastSentRow = {
  last_price: number
  sent_at: string
  rate_id: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotelId, bookings } = body as {
      hotelId: string
      bookings: {
        bookingId: string
        bookingDate: string
        checkinDate: string
        checkoutDate?: string
        roomTypeId: string
        rateId?: string | null
        occupancy: number
        bookedPrice: number
      }[]
    }

    if (!hotelId || !bookings || bookings.length === 0) {
      return NextResponse.json(
        { error: "hotelId and bookings[] required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: config } = await supabase
      .from("autopilot_configs")
      .select("guard_tolerance_pct, guard_time_tolerance_min")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    const tolerancePct = Number(config?.guard_tolerance_pct ?? 5)
    const timeToleranceMin = Number(config?.guard_time_tolerance_min ?? 60)

    const results: {
      bookingId: string
      nightDate: string
      nightIndex: number
      result: "ok" | "warning" | "mismatch"
      bookedPrice: number
      expectedPrice: number | null
      differencePct: number | null
      tolerancePct: number
      minutesBeforeBooking: number | null
    }[] = []

    const guardInserts: Record<string, unknown>[] = []

    for (const b of bookings) {
      const checkIn = new Date(b.checkinDate + "T00:00:00Z")
      const checkOut = b.checkoutDate
        ? new Date(b.checkoutDate + "T00:00:00Z")
        : new Date(checkIn.getTime() + 86_400_000) // default 1 night
      let nightIdx = 0
      for (
        let d = new Date(checkIn);
        d < checkOut;
        d.setUTCDate(d.getUTCDate() + 1), nightIdx++
      ) {
        const nightStr = d.toISOString().split("T")[0]
        const expected = await findExpectedPrice(supabase, {
          hotelId,
          roomTypeId: b.roomTypeId,
          rateId: b.rateId ?? null,
          occupancy: b.occupancy,
          targetDate: nightStr,
          bookingTimestamp: b.bookingDate,
        })

        if (!expected || expected.last_price == null) {
          results.push({
            bookingId: b.bookingId,
            nightDate: nightStr,
            nightIndex: nightIdx,
            result: "warning",
            bookedPrice: b.bookedPrice,
            expectedPrice: null,
            differencePct: null,
            tolerancePct,
            minutesBeforeBooking: null,
          })
          guardInserts.push({
            hotel_id: hotelId,
            booking_id: b.bookingId,
            booking_date: b.bookingDate,
            checkin_date: nightStr,
            checkout_date: b.checkoutDate || null,
            room_type_id: b.roomTypeId,
            rate_id: b.rateId || null,
            occupancy: b.occupancy,
            booked_price: b.bookedPrice,
            expected_price: null,
            difference_pct: null,
            tolerance_pct: tolerancePct,
            result: "warning",
            night_index: nightIdx,
            notes: "Nessun prezzo di riferimento memorizzato per questa notte",
          })
          continue
        }

        const bookingMs = new Date(b.bookingDate).getTime()
        const sentMs = new Date(expected.sent_at).getTime()
        const minutesBefore = Math.max(
          0,
          Math.round((bookingMs - sentMs) / 60000)
        )

        const expectedPriceA = Number(expected.last_price)
        let expectedPriceB: number | null = null
        if (minutesBefore < timeToleranceMin) {
          const prev = await findExpectedPriceBefore(supabase, {
            hotelId,
            roomTypeId: b.roomTypeId,
            rateId: b.rateId ?? null,
            occupancy: b.occupancy,
            targetDate: nightStr,
            beforeTimestamp: expected.sent_at,
          })
          if (prev?.last_price != null) {
            expectedPriceB = Number(prev.last_price)
          }
        }

        // FIX 30/04/2026 — stessa logica firmata di /api/guard/scan:
        // difference_pct ora e' FIRMATO (positivo = booked > expected = favorevole,
        // negativo = sotto-prezzo). result = mismatch/warning SOLO se sotto-prezzo
        // oltre soglia. Sovra-prezzi sono sempre OK (sorpresa positiva, badge verde).
        const signedDiffA = signedPctDiff(b.bookedPrice, expectedPriceA)
        const signedDiffB =
          expectedPriceB != null ? signedPctDiff(b.bookedPrice, expectedPriceB) : null
        const bestSignedDiff =
          signedDiffB != null
            ? signedDiffA >= signedDiffB
              ? signedDiffA
              : signedDiffB
            : signedDiffA
        const bestExpected =
          signedDiffB != null && signedDiffB > signedDiffA ? expectedPriceB! : expectedPriceA

        const absDiff = Math.abs(bestSignedDiff)
        const isUnderpriced = bestSignedDiff < 0

        let result: "ok" | "warning" | "mismatch"
        if (isUnderpriced && absDiff > tolerancePct) result = "mismatch"
        else if (isUnderpriced && absDiff > tolerancePct / 2) result = "warning"
        else result = "ok"

        const notesParts: string[] = []
        if (signedDiffB != null) {
          notesParts.push(
            `Tolleranza temporale applicata: prezzo inviato ${minutesBefore} min prima del booking, valutato anche il prezzo precedente. Diff migliore: ${bestSignedDiff.toFixed(2)}%`,
          )
        }
        if (!isUnderpriced && absDiff > tolerancePct / 2) {
          notesParts.push(
            `Sovra-prezzo del ${absDiff.toFixed(1)}% rispetto al prezzo atteso: favorevole alla struttura, classificato OK.`,
          )
        }
        const notes = notesParts.length > 0 ? notesParts.join(" | ") : null

        results.push({
          bookingId: b.bookingId,
          nightDate: nightStr,
          nightIndex: nightIdx,
          result,
          bookedPrice: b.bookedPrice,
          expectedPrice: Math.round(bestExpected * 100) / 100,
          differencePct: Math.round(bestSignedDiff * 100) / 100,
          tolerancePct,
          minutesBeforeBooking: minutesBefore,
        })

        guardInserts.push({
          hotel_id: hotelId,
          booking_id: b.bookingId,
          booking_date: b.bookingDate,
          checkin_date: nightStr,
          checkout_date: b.checkoutDate || null,
          room_type_id: b.roomTypeId,
          // FIX 30/04/2026: stesso fix di /api/guard/scan: non salvare
          // rate inferito da any-rate fallback come rate del booking.
          rate_id: b.rateId ?? null,
          occupancy: b.occupancy,
          booked_price: b.bookedPrice,
          expected_price: Math.round(bestExpected * 100) / 100,
          difference_pct: Math.round(bestSignedDiff * 100) / 100,
          tolerance_pct: tolerancePct,
          result,
          night_index: nightIdx,
          sent_at: expected.sent_at,
          minutes_before_booking: minutesBefore,
          notes,
        })
      }
    }

    if (guardInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("price_guard_checks")
        .insert(guardInserts)

      if (insertError) {
        console.error("[guard/check] Error inserting checks:", insertError.message)
      }
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.result === "ok").length,
      warning: results.filter((r) => r.result === "warning").length,
      mismatch: results.filter((r) => r.result === "mismatch").length,
    }

    return NextResponse.json({
      results,
      summary,
      tolerancePct,
      timeToleranceMin,
    })
  } catch (err) {
    console.error("[guard/check] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/guard/check?hotelId=xxx&limit=50&result=mismatch
 *
 * Returns historical guard checks for the dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const limitStr = searchParams.get("limit")
    const resultFilter = searchParams.get("result")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    const supabase = await createClient()
    const limit = Math.min(parseInt(limitStr || "50"), 200)

    // Ambito tariffe (richiesta utente 16/07/2026): allineato allo scan.
    // 'active' (default) mostra solo i check su tariffe attive; 'all' mostra
    // tutti i check, incluse le tariffe non attive/derivate.
    const { data: guardConfig } = await supabase
      .from("autopilot_configs")
      .select("guard_rate_scope")
      .eq("hotel_id", hotelId)
      .maybeSingle()
    const rateScope = (guardConfig?.guard_rate_scope as string) === "all" ? "all" : "active"

    let query = supabase
      .from("price_guard_checks")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("checked_at", { ascending: false })
      .limit(limit)

    // Optional date filter on booking_date (date di ricevimento prenotazione).
    // We intentionally filter by booking_date, not by checked_at, so the user
    // sees "bookings received in the last N days" — same scope as the scan.
    const daysParam = searchParams.get("days")
    if (daysParam) {
      const days = Math.min(365, Math.max(0.04, Number(daysParam) || 2))
      const since = new Date(Date.now() - days * 86_400_000)
        .toISOString()
        .split("T")[0]
      query = query.gte("booking_date", since)
    }

    if (resultFilter && ["ok", "warning", "mismatch"].includes(resultFilter)) {
      query = query.eq("result", resultFilter)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: `Errore lettura guard checks: ${error.message}` },
        { status: 500 }
      )
    }

    const checks = data || []

    // Enrich each check with booking-level info (channel, guest name, nights)
    // so the UI can show a channel column and open a detail dialog without an
    // extra round-trip per row. We join manually via pms_booking_id because
    // price_guard_checks.booking_id stores the PMS id (not an internal uuid).
    const bookingIds = Array.from(
      new Set(
        checks
          .map((c: any) => c.booking_id)
          .filter((x: any) => typeof x === "string" && x.length > 0)
      )
    ) as string[]

    let bookingInfo: Record<string, {
      channel: string | null
      guest_name: string | null
      check_in_date: string | null
      check_out_date: string | null
      number_of_nights: number | null
      rate_id: string | null
      rate_name: string | null
      rate_code: string | null
      // FEATURE 01/05/2026 (incident Barronci #4867): flag multi-tariffa
      // per esporre nella UI il badge informativo.
      is_multi_rate: boolean
    }> = {}

    if (bookingIds.length > 0) {
      const { data: bookingsRows } = await supabase
        .from("bookings")
        .select(
          "pms_booking_id, channel, guest_name, check_in_date, check_out_date, number_of_nights, rate_id, rate_name, rate_code, is_multi_rate"
        )
        .eq("hotel_id", hotelId)
        .in("pms_booking_id", bookingIds)

      for (const b of bookingsRows || []) {
        bookingInfo[String(b.pms_booking_id)] = {
          channel: b.channel,
          guest_name: b.guest_name,
          check_in_date: b.check_in_date,
          check_out_date: b.check_out_date,
          number_of_nights: b.number_of_nights,
          rate_id: b.rate_id,
          rate_name: b.rate_name,
          rate_code: b.rate_code,
          is_multi_rate: !!b.is_multi_rate,
        }
      }
    }

    // FIX 30/04/2026: lookup nome tariffa via rates table per le righe che
    // hanno rate_id ma il nome non e' direttamente sulla bookings (es. dati
    // legacy o PMS che non popolano rate_name in bookings).
    const rateIds = Array.from(
      new Set(
        checks
          .map((c: any) => c.rate_id)
          .filter((x: any) => typeof x === "string" && x.length > 0)
      )
    ) as string[]

    let rateLookup: Record<string, { name: string | null; code: string | null }> = {}
    if (rateIds.length > 0) {
      const { data: ratesRows } = await supabase
        .from("rates")
        .select("id, name, code")
        .eq("hotel_id", hotelId)
        .in("id", rateIds)

      for (const r of ratesRows || []) {
        rateLookup[String(r.id)] = { name: r.name, code: r.code }
      }
    }

    // TARIFFE ATTIVE (richiesta utente 30/06/2026, resa configurabile 16/07/2026):
    // con rateScope='active' (default) mostriamo SOLO i check su tariffe
    // gestite/pubblicate attivamente da Santaddeo (`rates.is_active`). Con
    // rateScope='all' NON filtriamo: mostriamo tutti i check, incluse le
    // tariffe non attive/derivate (che altrimenti non comparirebbero mai in
    // pagina, ne' nel filtro tariffe — che si popola da questi check).
    // Il filtro e' a read-time per coerenza immediata: i record storici su
    // tariffe disattivate restano in tabella e ricompaiono se si passa a 'all'.
    let activeChecks = checks
    if (rateScope === "active") {
      const { data: activeRatesRows } = await supabase
        .from("rates")
        .select("id")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
      const activeRateIds = new Set((activeRatesRows || []).map((r) => String(r.id)))

      // Tieni solo i check la cui tariffa EFFETTIVA e' attiva. Tariffa effettiva
      // = override per-notte se presente, altrimenti la rate REALE del booking
      // (fonte di verita'), con fallback su c.rate_id per righe legacy senza
      // booking agganciato. Se non risolve a una rate attiva, il check non e'
      // confrontabile in modo significativo -> escluso.
      activeChecks = checks.filter((c: any) => {
        const bk = bookingInfo[c.booking_id]
        const effRate = c.rate_id_override ?? bk?.rate_id ?? c.rate_id
        return effRate != null && activeRateIds.has(String(effRate))
      })
    }

    const enriched = activeChecks.map((c: any) => {
      const bk = bookingInfo[c.booking_id]
      // FIX 30/04/2026 (v4 — bug visibile su Barronci 30648/30650/30652):
      // Per i check storici creati PRIMA del fix di /api/guard/scan, il
      // valore `c.rate_id` salvato in `price_guard_checks` NON e' la rate
      // del booking ma `expected.rate_id` (la rate pushata che ha matchato
      // any-rate fallback). Lookuparlo in `rates` produce nomi sbagliati:
      // es. "BeSafe Rate" su prenotazioni Booking/Expedia.
      //
      // Strategia: usiamo `fromRates` SOLO se il booking originale aveva
      // davvero un `rate_id` valido (`bk.rate_id != null`). Altrimenti
      // `c.rate_id` e' inattendibile e viene IGNORATO; ricadiamo su
      // bookings.rate_code grezzo (es. "256491") come label di fallback —
      // brutto ma onesto, mai inventiamo nomi che non corrispondono.
      const bookingHasRateId = !!bk?.rate_id
      const fromRates =
        c.rate_id && bookingHasRateId ? rateLookup[String(c.rate_id)] : null

      // Priorita' v4 (rate del booking come fonte di verita', mai expected):
      //   1. bookings.rate_name  (snapshot reale del PMS sul booking)
      //   2. rates.name canonico (SOLO se bk.rate_id valido — gating sopra)
      //   3. "Tariffa #<code>"   (formattato leggibile su rate_code)
      //   4. rates.code (idem solo se bk.rate_id valido)
      //   5. null
      let rate_name: string | null
      if (bk?.rate_name) {
        rate_name = bk.rate_name
      } else if (fromRates?.name) {
        rate_name = fromRates.name
      } else if (bk?.rate_code) {
        rate_name = `Tariffa #${bk.rate_code}`
      } else if (fromRates?.code) {
        rate_name = `Tariffa #${fromRates.code}`
      } else {
        rate_name = null
      }

      return {
        ...c,
        channel: bk?.channel ?? null,
        guest_name: bk?.guest_name ?? null,
        stay_nights: bk?.number_of_nights ?? null,
        rate_name,
        is_multi_rate: bk?.is_multi_rate ?? false,
        // Per-night override flag: true se l'utente ha assegnato manualmente
        // una rate diversa a questa notte (multi-rate booking). Espongo
        // un flag esplicito cosi' la UI puo' mostrare un badge "override"
        // accanto al nome rate per distinguere dal valore PMS.
        is_overridden: !!c.rate_id_override,
      }
    })

    return NextResponse.json({ checks: enriched })
  } catch (err) {
    console.error("[guard/check] GET error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

// ============================================================================
// Helpers (kept local to this route to avoid cross-file coupling)
// ============================================================================

function pctDiff(booked: number, expected: number): number {
  if (!expected || expected <= 0) return 0
  return Math.abs(((booked - expected) / expected) * 100)
}

/**
 * Signed pct diff: positivo = sovra-prezzo (favorevole), negativo = sotto-prezzo.
 * Vedi /api/guard/scan/route.ts per la documentazione completa della scelta.
 */
function signedPctDiff(booked: number, expected: number): number {
  if (!expected || expected <= 0) return 0
  return ((booked - expected) / expected) * 100
}

/**
 * RATE MATCHING POLICY (FIX 30/04/2026):
 * vedi /api/guard/scan/route.ts per la documentazione completa. Sintesi:
 * - rate_id presente sulla prenotazione -> SOLO match esatto sulla rate
 *   (no cross-rate fallback). Se non trova, ritorna null e il caller
 *   marca "warning - tariffa non confrontabile".
 * - rate_id assente -> any-rate fallback ammesso (PMS senza rate_id).
 */
/**
 * FIX 04/05/2026: vedi commento in /api/guard/scan/route.ts.
 * `last_sent_prices` e' tabella di stato. Storico vero in price_change_log.
 */
async function lookupPriceChangeLogPms(
  supabase: any,
  args: {
    hotelId: string
    roomTypeId: string
    rateId: string | null
    occupancy: number
    targetDate: string
    upToTimestamp: string
    inclusive: boolean
  }
): Promise<LastSentRow | null> {
  let q = supabase
    .from("price_change_log")
    .select("new_price, changed_at, rate_id")
    .eq("hotel_id", args.hotelId)
    .eq("room_type_id", args.roomTypeId)
    .eq("occupancy", args.occupancy)
    .eq("target_date", args.targetDate)
    .eq("action_taken", "pms")
    .not("new_price", "is", null)
  q = args.inclusive
    ? q.lte("changed_at", args.upToTimestamp)
    : q.lt("changed_at", args.upToTimestamp)
  if (args.rateId) q = q.eq("rate_id", args.rateId)
  const { data } = await q
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data?.new_price == null) return null
  return {
    last_price: Number(data.new_price),
    sent_at: data.changed_at,
    rate_id: (data.rate_id as string | null) ?? null,
  }
}

async function findExpectedPrice(
  supabase: any,
  args: {
    hotelId: string
    roomTypeId: string
    rateId: string | null
    occupancy: number
    targetDate: string
    bookingTimestamp: string
  }
): Promise<LastSentRow | null> {
  if (args.rateId) {
    const { data } = await supabase
      .from("last_sent_prices")
      .select("last_price, sent_at, rate_id")
      .eq("hotel_id", args.hotelId)
      .eq("room_type_id", args.roomTypeId)
      .eq("rate_id", args.rateId)
      .eq("occupancy", args.occupancy)
      .eq("target_date", args.targetDate)
      .lte("sent_at", args.bookingTimestamp)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.last_price != null) return data as LastSentRow

    if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
      const { data: base } = await supabase
        .from("last_sent_prices")
        .select("last_price, sent_at, rate_id")
        .eq("hotel_id", args.hotelId)
        .eq("room_type_id", args.roomTypeId)
        .eq("rate_id", args.rateId)
        .eq("occupancy", 2)
        .eq("target_date", args.targetDate)
        .lte("sent_at", args.bookingTimestamp)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (base?.last_price != null) return base as LastSentRow
    }

    // FIX 04/05/2026: storico vero in price_change_log per la stessa rate.
    const fromLog = await lookupPriceChangeLogPms(supabase, {
      hotelId: args.hotelId,
      roomTypeId: args.roomTypeId,
      rateId: args.rateId,
      occupancy: args.occupancy,
      targetDate: args.targetDate,
      upToTimestamp: args.bookingTimestamp,
      inclusive: true,
    })
    if (fromLog) return fromLog
    if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
      const fromLogBase = await lookupPriceChangeLogPms(supabase, {
        hotelId: args.hotelId,
        roomTypeId: args.roomTypeId,
        rateId: args.rateId,
        occupancy: 2,
        targetDate: args.targetDate,
        upToTimestamp: args.bookingTimestamp,
        inclusive: true,
      })
      if (fromLogBase) return fromLogBase
    }
    return null
  }

  const { data: anyRate } = await supabase
    .from("last_sent_prices")
    .select("last_price, sent_at, rate_id")
    .eq("hotel_id", args.hotelId)
    .eq("room_type_id", args.roomTypeId)
    .eq("occupancy", args.occupancy)
    .eq("target_date", args.targetDate)
    .lte("sent_at", args.bookingTimestamp)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (anyRate?.last_price != null) return anyRate as LastSentRow

  if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
    const { data: base } = await supabase
      .from("last_sent_prices")
      .select("last_price, sent_at, rate_id")
      .eq("hotel_id", args.hotelId)
      .eq("room_type_id", args.roomTypeId)
      .eq("occupancy", 2)
      .eq("target_date", args.targetDate)
      .lte("sent_at", args.bookingTimestamp)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (base?.last_price != null) return base as LastSentRow
  }

  // FIX 04/05/2026: storico vero in price_change_log any-rate.
  const fromLogAny = await lookupPriceChangeLogPms(supabase, {
    hotelId: args.hotelId,
    roomTypeId: args.roomTypeId,
    rateId: null,
    occupancy: args.occupancy,
    targetDate: args.targetDate,
    upToTimestamp: args.bookingTimestamp,
    inclusive: true,
  })
  if (fromLogAny) return fromLogAny
  if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
    const fromLogAnyBase = await lookupPriceChangeLogPms(supabase, {
      hotelId: args.hotelId,
      roomTypeId: args.roomTypeId,
      rateId: null,
      occupancy: 2,
      targetDate: args.targetDate,
      upToTimestamp: args.bookingTimestamp,
      inclusive: true,
    })
    if (fromLogAnyBase) return fromLogAnyBase
  }

  return null
}

async function findExpectedPriceBefore(
  supabase: any,
  args: {
    hotelId: string
    roomTypeId: string
    rateId: string | null
    occupancy: number
    targetDate: string
    beforeTimestamp: string
  }
): Promise<LastSentRow | null> {
  if (args.rateId) {
    const { data } = await supabase
      .from("last_sent_prices")
      .select("last_price, sent_at, rate_id")
      .eq("hotel_id", args.hotelId)
      .eq("room_type_id", args.roomTypeId)
      .eq("rate_id", args.rateId)
      .eq("occupancy", args.occupancy)
      .eq("target_date", args.targetDate)
      .lt("sent_at", args.beforeTimestamp)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.last_price != null) return data as LastSentRow

    if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
      const { data: base } = await supabase
        .from("last_sent_prices")
        .select("last_price, sent_at, rate_id")
        .eq("hotel_id", args.hotelId)
        .eq("room_type_id", args.roomTypeId)
        .eq("rate_id", args.rateId)
        .eq("occupancy", 2)
        .eq("target_date", args.targetDate)
        .lt("sent_at", args.beforeTimestamp)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (base?.last_price != null) return base as LastSentRow
    }

    // FIX 04/05/2026: storico vero in price_change_log.
    const fromLog = await lookupPriceChangeLogPms(supabase, {
      hotelId: args.hotelId,
      roomTypeId: args.roomTypeId,
      rateId: args.rateId,
      occupancy: args.occupancy,
      targetDate: args.targetDate,
      upToTimestamp: args.beforeTimestamp,
      inclusive: false,
    })
    if (fromLog) return fromLog
    if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
      const fromLogBase = await lookupPriceChangeLogPms(supabase, {
        hotelId: args.hotelId,
        roomTypeId: args.roomTypeId,
        rateId: args.rateId,
        occupancy: 2,
        targetDate: args.targetDate,
        upToTimestamp: args.beforeTimestamp,
        inclusive: false,
      })
      if (fromLogBase) return fromLogBase
    }
    return null
  }

  const { data: anyRate } = await supabase
    .from("last_sent_prices")
    .select("last_price, sent_at, rate_id")
    .eq("hotel_id", args.hotelId)
    .eq("room_type_id", args.roomTypeId)
    .eq("occupancy", args.occupancy)
    .eq("target_date", args.targetDate)
    .lt("sent_at", args.beforeTimestamp)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (anyRate?.last_price != null) return anyRate as LastSentRow

  if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
    const { data: base } = await supabase
      .from("last_sent_prices")
      .select("last_price, sent_at, rate_id")
      .eq("hotel_id", args.hotelId)
      .eq("room_type_id", args.roomTypeId)
      .eq("occupancy", 2)
      .eq("target_date", args.targetDate)
      .lt("sent_at", args.beforeTimestamp)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (base?.last_price != null) return base as LastSentRow
  }

  // FIX 04/05/2026: storico vero in price_change_log any-rate.
  const fromLogAny = await lookupPriceChangeLogPms(supabase, {
    hotelId: args.hotelId,
    roomTypeId: args.roomTypeId,
    rateId: null,
    occupancy: args.occupancy,
    targetDate: args.targetDate,
    upToTimestamp: args.beforeTimestamp,
    inclusive: false,
  })
  if (fromLogAny) return fromLogAny
  if (GUARD_OCC2_FALLBACK && args.occupancy !== 2) {
    const fromLogAnyBase = await lookupPriceChangeLogPms(supabase, {
      hotelId: args.hotelId,
      roomTypeId: args.roomTypeId,
      rateId: null,
      occupancy: 2,
      targetDate: args.targetDate,
      upToTimestamp: args.beforeTimestamp,
      inclusive: false,
    })
    if (fromLogAnyBase) return fromLogAnyBase
  }

  return null
}
