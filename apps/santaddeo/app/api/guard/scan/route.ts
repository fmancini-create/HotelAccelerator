import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// DECISIONE 30/06/2026 (fix falsi mismatch Guard): confronto SOLO all'occupancy
// reale della prenotazione. Il vecchio fallback "stessa rate, occupancy=2"
// (convenzione BAR base Scidoo) generava scostamenti finti sulle prenotazioni a
// 3-4 ospiti. Lasciato gated dietro questa costante: se non esiste un prezzo
// pushato all'occupancy esatta, `expected` resta null -> warning "non
// monitorata" (percorso gia' esistente), invece di un confronto disomogeneo.
const GUARD_OCC2_FALLBACK = false

/**
 * POST /api/guard/scan
 *
 * For every recent booking, verifies (night by night) that the price actually
 * charged matches the price Santaddeo last pushed to the PMS/channel before
 * the booking was placed.
 *
 * Tolerances:
 *   - guard_tolerance_pct    : % tolerance on price (existing)
 *   - guard_time_tolerance_min : minute tolerance on timing (NEW)
 *       If the price was sent within this window BEFORE the booking, also the
 *       version that was live just before is considered valid. This accounts
 *       for propagation lag on OTAs (Booking.com, Expedia, ...).
 *
 * For multi-night bookings (check_out - check_in > 1) we create one check row
 * per night. This avoids false mismatches when different nights have different
 * rates but the PMS reports a single averaged `price_per_night`.
 *
 * Body: { hotelId: string, days?: number, force?: boolean }
 */

type LastSentRow = {
  last_price: number
  sent_at: string
  rate_id: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotelId, days = 2, force = false } = body as {
      hotelId: string
      days?: number
      force?: boolean
    }

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    // Clamp days: min 1, max 365. Fractional days supported for sub-day scans
    // (e.g. 0.5 = ultime 12 h). Keeps the API flexible for cron triggers.
    const daysClamped = Math.min(365, Math.max(0.04, Number(days) || 2))

    const supabase = await createClient()

    // -------------------------------------------------------------------------
    // 1. Load config (% tolerance + time tolerance)
    // -------------------------------------------------------------------------
    const { data: config } = await supabase
      .from("autopilot_configs")
      .select("guard_tolerance_pct, guard_time_tolerance_min, guard_rate_scope")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    const tolerancePct = Number(config?.guard_tolerance_pct ?? 5)
    const timeToleranceMin = Number(config?.guard_time_tolerance_min ?? 60)
    // Ambito tariffe (richiesta utente 16/07/2026): 'active' (default) confronta
    // SOLO le prenotazioni su tariffe attive in Santaddeo; 'all' confronta tutte
    // le tariffe (incluse derived/-OTA/promo). Vedi filtro allo step 5b.
    const rateScope = (config?.guard_rate_scope as string) === "all" ? "all" : "active"

    // -------------------------------------------------------------------------
    // 2. Load recent non-cancelled bookings
    // -------------------------------------------------------------------------
    // We filter by booking_date (date of receipt of the booking), not by
    // check-in. This matches the user's mental model: "controlla le
    // prenotazioni ricevute nelle ultime N ore/giorni".
    const sinceDate = new Date(Date.now() - daysClamped * 86_400_000)
    const sinceDateStr = sinceDate.toISOString().split("T")[0]

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, hotel_id, room_type_id, rate_id, pms_booking_id, booking_date, booking_datetime, check_in_date, check_out_date, price_per_night, total_price, number_of_guests, adults, guest_name"
      )
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .gte("booking_date", sinceDateStr)
      .not("price_per_night", "is", null)
      .gt("price_per_night", 0)
      .order("booking_date", { ascending: false })

    if (bookingsError) {
      return NextResponse.json(
        { error: `Errore lettura prenotazioni: ${bookingsError.message}` },
        { status: 500 }
      )
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({
        summary: { total: 0, verified: 0, ok: 0, warning: 0, mismatch: 0, skipped: 0, nights: 0 },
        message: "Nessuna prenotazione trovata nel periodo",
      })
    }

    // -------------------------------------------------------------------------
    // 3. Load existing per-night rate overrides BEFORE wiping. The user can
    //    set a different rate per night for multi-rate bookings (es. 2 notti
    //    B&B + 1 Pernottamento) — questi override devono sopravvivere ad un
    //    re-scan con force=true. Mappa: `${booking_id}__${checkin_date}` ->
    //    rate_id_override (uuid).
    // -------------------------------------------------------------------------
    const bookingIds = bookings.map((b) => b.pms_booking_id || b.id)
    const overrideMap = new Map<string, string>()
    {
      const { data: overrideRows } = await supabase
        .from("price_guard_checks")
        .select("booking_id, checkin_date, rate_id_override")
        .eq("hotel_id", hotelId)
        .in("booking_id", bookingIds)
        .not("rate_id_override", "is", null)
      for (const r of overrideRows || []) {
        if (r.booking_id && r.checkin_date && r.rate_id_override) {
          overrideMap.set(`${r.booking_id}__${r.checkin_date}`, r.rate_id_override)
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4. Force mode = wipe existing checks for this hotel (user-driven re-scan).
    //    Gli override caricati sopra verranno re-iniettati nelle nuove righe.
    // -------------------------------------------------------------------------
    if (force) {
      await supabase.from("price_guard_checks").delete().eq("hotel_id", hotelId)
    }

    // -------------------------------------------------------------------------
    // 5. Dedup: fetch (booking_id, checkin_date) pairs already checked
    //    We still scan them, but skip at insert time.
    // -------------------------------------------------------------------------
    const { data: existingChecks } = await supabase
      .from("price_guard_checks")
      .select("booking_id, checkin_date")
      .eq("hotel_id", hotelId)
      .in("booking_id", bookingIds)

    const alreadyChecked = new Set(
      (existingChecks || []).map((c) => `${c.booking_id}__${c.checkin_date}`)
    )

    // -------------------------------------------------------------------------
    // 5. Scan each booking × each night
    // -------------------------------------------------------------------------
    const guardInserts: Record<string, unknown>[] = []
    // FEATURE 01/05/2026 (incident Barronci #4867): Scidoo non ci dice
    // esplicitamente quando una prenotazione e' multi-tariffa (es. 2 notti
    // B&B + 1 Pernottamento). L'unico segnale e' il prezzo medio anomalo
    // rispetto a quello atteso. Heuristica: se il booked_price > expected
    // * 1.20 (overpaying >= 20%) e nights >= 2, marchiamo
    // `bookings.is_multi_rate=true`. La soglia e' conservativa: i normali
    // sovra-prezzi favorevoli alla struttura raramente superano +20%, e
    // i sotto-prezzi (sconti OTA) non scattano la condizione.
    const multiRateBookingDbIds = new Set<string>()
    // Cache per accumulare il segnale per booking, perche' un booking ha
    // N notti e ne basta UNA con overpaying >= 20% per dichiarare il flag.
    // Salviamo l'id (uuid) di `bookings`, NON il pms_booking_id.
    const bookingDbIdByPmsId = new Map<string, string>()
    for (const b of bookings) {
      const pmsId = b.pms_booking_id || b.id
      if (b.id) bookingDbIdByPmsId.set(pmsId, b.id)
    }

    // -------------------------------------------------------------------------
    // 5b. TARIFFE ATTIVE (richiesta utente 30/06/2026): il Guard ha senso SOLO
    //     sulle tariffe che Santaddeo gestisce/pubblica attivamente
    //     (`rates.is_active = true`). Le prenotazioni su tariffe disattivate
    //     (es. derived/promo/-OTA non piu' gestite) NON vanno confrontate:
    //     produrrebbero solo falsi mismatch contro un riferimento che non
    //     manteniamo piu'. Le saltiamo del tutto (nessuna riga creata) e ne
    //     contiamo il numero per trasparenza nel sommario.
    const { data: activeRatesRows } = await supabase
      .from("rates")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
    const activeRateIds = new Set((activeRatesRows || []).map((r) => String(r.id)))

    let okCount = 0
    let warningCount = 0
    let mismatchCount = 0
    let skippedCount = 0
    let skippedInactiveRate = 0
    let nightsTotal = 0

    for (const b of bookings) {
      const bookingIdForCheck = b.pms_booking_id || b.id
      const bookedPrice = Number(b.price_per_night)
      const occupancy = b.adults || b.number_of_guests || 0

      // SKIP: missing minimum required fields. rate_id is NOT required here
      // because most PMS imports don't store it. We'll use the last-sent row
      // regardless of rate.
      if (!b.room_type_id || !occupancy || occupancy <= 0 || !b.check_in_date || !b.check_out_date) {
        skippedCount++
        continue
      }

      const bookingTimestamp =
        b.booking_datetime || `${b.booking_date}T23:59:59Z`

      // Iterate every night of the stay: [check_in, check_out)
      const checkIn = new Date(b.check_in_date + "T00:00:00Z")
      const checkOut = new Date(b.check_out_date + "T00:00:00Z")
      let nightIdx = 0
      for (
        let d = new Date(checkIn);
        d < checkOut;
        d.setUTCDate(d.getUTCDate() + 1), nightIdx++
      ) {
        const nightStr = d.toISOString().split("T")[0]
        nightsTotal++

        // Skip already-checked (booking, night) pair
        const dedupKey = `${bookingIdForCheck}__${nightStr}`
        if (alreadyChecked.has(dedupKey)) continue

        // Per-night rate override: se l'utente ha assegnato manualmente una
        // tariffa diversa a questa specifica notte (multi-rate booking),
        // usiamo quella per cercare il prezzo atteso. Sennò la rate del
        // booking. Questo permette di gestire correttamente "2 notti B&B + 1
        // Pernottamento" senza falsi mismatch.
        const overrideRateId = overrideMap.get(dedupKey)
        const effectiveRateId = overrideRateId ?? b.rate_id

        // FILTRO TARIFFE ATTIVE (solo se rateScope='active'): confronta solo se
        // la tariffa effettiva di questa notte e' tra quelle attive in
        // Santaddeo. Se la rate e' disattivata (o assente), la prenotazione non
        // e' confrontabile in modo significativo -> la saltiamo senza creare
        // alcuna riga. Con rateScope='all' NON saltiamo nulla per tariffa: il
        // match sul prezzo atteso avviene comunque per room_type/occ/notte/ora.
        if (rateScope === "active" && (!effectiveRateId || !activeRateIds.has(String(effectiveRateId)))) {
          skippedInactiveRate++
          continue
        }

        // ---------------------------------------------------------------------
        // Find the expected price for this night.
        // Strategy:
        //   (a) prefer match on exact rate_id if booking has one
        //   (b) otherwise pick the MOST RECENT last_sent_prices row for
        //       (hotel, room_type, occupancy, night) sent before the booking,
        //       regardless of rate.
        //   (c) if no match for the booking's occupancy, try occupancy=2
        //       (Scidoo "base rate" convention: the stored price is the
        //       BAR for 2 guests, adjustments are computed at sale time).
        // ---------------------------------------------------------------------
        const expected = await findExpectedPrice(supabase, {
          hotelId,
          roomTypeId: b.room_type_id,
          rateId: effectiveRateId,
          occupancy,
          targetDate: nightStr,
          bookingTimestamp,
        })

        if (!expected || expected.last_price == null) {
          // Diagnose WHY the expected price is missing so the user can
          // tell apart: (a) no autopilot push has ever reached this cell
          // (most common when autopilot is misconfigured or just enabled),
          // (b) all pushes happened AFTER the booking (timing issue).
          const { data: anySent } = await supabase
            .from("last_sent_prices")
            .select("sent_at, last_price")
            .eq("hotel_id", hotelId)
            .eq("room_type_id", b.room_type_id)
            .eq("target_date", nightStr)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          // FIX 30/04/2026: ulteriore diagnosi per rate_id non mappata.
          // Se la prenotazione ha rate_id e CI SONO prezzi inviati per altre
          // tariffe (anySent != null) ma non per quella specifica, lo diciamo
          // esplicitamente. Cosi' l'utente sa che NON e' un mismatch reale,
          // ma una tariffa non monitorata.
          let diagNote: string
          if (!anySent) {
            diagNote =
              "Nessun prezzo mai inviato al PMS per questa cella " +
              "(camera/notte). Possibile causa: Autopilot non ha ancora " +
              "spinto i prezzi calcolati."
          } else if (b.rate_id) {
            // C'e' stato un push per la cella ma su tariffa diversa.
            // Verifichiamo se almeno UNA volta abbiamo spinto su QUESTA rate.
            const { data: anyOnRate } = await supabase
              .from("last_sent_prices")
              .select("sent_at")
              .eq("hotel_id", hotelId)
              .eq("room_type_id", b.room_type_id)
              .eq("rate_id", b.rate_id)
              .eq("target_date", nightStr)
              .order("sent_at", { ascending: false })
              .limit(1)
              .maybeSingle()

            if (!anyOnRate) {
              diagNote =
                "Tariffa non monitorata: nessun prezzo e' mai stato inviato " +
                "al PMS per questa specifica tariffa. Verifica la mappatura " +
                "delle tariffe in Impostazioni o attiva l'invio prezzi anche " +
                "per questa rate. La prenotazione NON e' confrontabile."
            } else {
              const sentTs = new Date(anyOnRate.sent_at).toISOString()
              diagNote =
                `Per questa tariffa l'ultimo invio (${sentTs}) e' DOPO ` +
                `la prenotazione: nessun prezzo di riferimento valido al ` +
                `momento del booking.`
            }
          } else {
            const sentTs = new Date(anySent.sent_at).toISOString()
            diagNote =
              `Prezzi inviati per questa cella esistono ma tutti DOPO ` +
              `la prenotazione (ultimo invio: ${sentTs}). Nessun ` +
              `riferimento valido al momento del booking.`
          }

          skippedCount++
          guardInserts.push({
            hotel_id: hotelId,
            booking_id: bookingIdForCheck,
            booking_date: bookingTimestamp,
            checkin_date: nightStr,
            checkout_date: b.check_out_date,
            room_type_id: b.room_type_id,
            // Salviamo la rate EFFETTIVAMENTE usata per il check di questa
            // notte: override se presente, sennò quella del booking. Cosi'
            // la UI mostra coerentemente la tariffa attribuita per notte.
            rate_id: effectiveRateId ?? null,
            rate_id_override: overrideRateId ?? null,
            occupancy,
            booked_price: bookedPrice,
            expected_price: null,
            difference_pct: null,
            tolerance_pct: tolerancePct,
            result: "warning",
            night_index: nightIdx,
            notes: diagNote,
          })
          warningCount++
          continue
        }

        // ---------------------------------------------------------------------
        // Time tolerance logic:
        //   If expected.sent_at is within <timeToleranceMin> minutes BEFORE
        //   the booking, also consider the PREVIOUS sent price as valid
        //   (channels may not have propagated the new value in time).
        //   The booking passes if EITHER the new OR the previous price
        //   is within the % tolerance.
        // ---------------------------------------------------------------------
        const bookingMs = new Date(bookingTimestamp).getTime()
        const sentMs = new Date(expected.sent_at).getTime()
        const minutesBefore = Math.max(
          0,
          Math.round((bookingMs - sentMs) / 60000)
        )

        let expectedPriceA = Number(expected.last_price)
        let expectedPriceB: number | null = null
        if (minutesBefore < timeToleranceMin) {
          const prev = await findExpectedPriceBefore(supabase, {
            hotelId,
            roomTypeId: b.room_type_id,
            rateId: effectiveRateId,
            occupancy,
            targetDate: nightStr,
            beforeTimestamp: expected.sent_at,
          })
          if (prev?.last_price != null) {
            expectedPriceB = Number(prev.last_price)
          }
        }

        // Evaluate against BOTH candidates (if B exists) and keep the BETTER
        // outcome: OK beats warning beats mismatch.
        //
        // FIX 30/04/2026: difference_pct e' ora FIRMATO per semantica chiara
        //   - positivo  => booked > expected = favorevole alla struttura
        //   - negativo  => booked < expected = sotto-prezzo (problema)
        //   - zero      => match perfetto
        // La logica result usa il valore FIRMATO migliore (cioe' meno
        // negativo = piu' favorevole) e considera "mismatch" SOLO i sotto-prezzi
        // oltre la tolleranza. Sovra-prezzi qualsiasi entita' = sempre ok
        // (sorpresa positiva, va segnalata in verde).
        const signedDiffA = signedPctDiff(bookedPrice, expectedPriceA)
        const signedDiffB =
          expectedPriceB != null ? signedPctDiff(bookedPrice, expectedPriceB) : null

        // "Migliore" = meno negativo. Se almeno uno dei due e' >= 0
        // (favorevole), prendiamo quello.
        const bestSignedDiff =
          signedDiffB != null
            ? signedDiffA >= signedDiffB
              ? signedDiffA
              : signedDiffB
            : signedDiffA
        const bestExpected =
          signedDiffB != null && signedDiffB > signedDiffA ? expectedPriceB! : expectedPriceA

        // |diff| usato per le soglie (la tolleranza e' simmetrica per definizione,
        // ma la classificazione finale e' ASIMMETRICA: ok se favorevole o entro
        // soglia, warning/mismatch SOLO se sotto-prezzo oltre soglia).
        const absDiff = Math.abs(bestSignedDiff)
        const isUnderpriced = bestSignedDiff < 0

        let result: "ok" | "warning" | "mismatch"
        if (isUnderpriced && absDiff > tolerancePct) {
          // Sotto-prezzo oltre soglia mismatch: problema serio.
          result = "mismatch"
          mismatchCount++
        } else if (isUnderpriced && absDiff > tolerancePct / 2) {
          // Sotto-prezzo oltre soglia warning ma entro mismatch: attenzione.
          result = "warning"
          warningCount++
        } else {
          // Tutti gli altri casi: match perfetto, dentro tolleranza o
          // sovra-prezzo (qualsiasi entita').
          result = "ok"
          okCount++
        }

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

        // Multi-rate auto-detect: overpaying >= 20% AND booking >= 2 notti.
        // Vedi commento al Set `multiRateBookingDbIds` per la logica.
        const totalNights = Math.max(
          1,
          Math.round(
            (new Date(b.check_out_date + "T00:00:00Z").getTime() -
              new Date(b.check_in_date + "T00:00:00Z").getTime()) /
              (24 * 3600 * 1000),
          ),
        )
        if (
          totalNights >= 2 &&
          !isUnderpriced &&
          bestExpected > 0 &&
          bookedPrice > bestExpected * 1.2
        ) {
          const dbId = b.id ?? bookingDbIdByPmsId.get(bookingIdForCheck)
          if (dbId) multiRateBookingDbIds.add(dbId)
          notesParts.push(
            `Possibile prenotazione multi-tariffa: booked > expected * 1.20 su una ` +
              `prenotazione di ${totalNights} notti (es. l'ospite ha esteso il soggiorno ` +
              `con tariffa diversa, oppure ha cambiato camera durante lo stay).`,
          )
        }

        guardInserts.push({
          hotel_id: hotelId,
          booking_id: bookingIdForCheck,
          booking_date: bookingTimestamp,
          checkin_date: nightStr,
          checkout_date: b.check_out_date,
          room_type_id: b.room_type_id,
          // Rate effettiva usata per questa notte: override manuale se
          // presente, sennò la rate dichiarata dal PMS sul booking. NON
          // usiamo `expected.rate_id` (any-rate fallback) per evitare
          // attribuzioni fittizie come "Be Safe su prenotazioni OTA"
          // (vedi FIX 30/04/2026).
          rate_id: effectiveRateId ?? null,
          rate_id_override: overrideRateId ?? null,
          occupancy,
          booked_price: bookedPrice,
          expected_price: Math.round(bestExpected * 100) / 100,
          difference_pct: Math.round(bestSignedDiff * 100) / 100,
          tolerance_pct: tolerancePct,
          result,
          night_index: nightIdx,
          sent_at: expected.sent_at,
          minutes_before_booking: minutesBefore,
          notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
        })
      }
    }

    // -------------------------------------------------------------------------
    // 6. Batch insert
    // -------------------------------------------------------------------------
    let insertErrors = 0
    for (let i = 0; i < guardInserts.length; i += 100) {
      const batch = guardInserts.slice(i, i + 100)
      const { error: insertError } = await supabase
        .from("price_guard_checks")
        .insert(batch)

      if (insertError) {
        console.error("[guard/scan] Insert error:", insertError.message)
        insertErrors++
      }
    }

    // Persist multi-rate flag in batch. Solo per gli id che NON sono gia'
    // multi_rate=true (idempotente, evita race con override manuale).
    let multiRateFlagged = 0
    if (multiRateBookingDbIds.size > 0) {
      const idsArr = Array.from(multiRateBookingDbIds)
      const { count, error: mrErr } = await supabase
        .from("bookings")
        .update({ is_multi_rate: true }, { count: "exact" })
        .in("id", idsArr)
        .eq("is_multi_rate", false)
      if (mrErr) {
        console.error("[guard/scan] multi-rate update error:", mrErr.message)
      } else {
        multiRateFlagged = count ?? 0
      }
    }

    const verified = okCount + warningCount + mismatchCount

    return NextResponse.json({
      summary: {
        total: bookings.length,
        nights: nightsTotal,
        verified,
        ok: okCount,
        warning: warningCount,
        mismatch: mismatchCount,
        skipped: skippedCount,
        skippedInactiveRate,
        multiRateFlagged,
      },
      message:
        `${verified} notti verificate su ${nightsTotal} (${bookings.length} prenotazioni). ` +
        `${skippedCount} saltate per dati incompleti o prezzo mancante` +
        (skippedInactiveRate > 0
          ? `; ${skippedInactiveRate} notti ignorate perché su tariffe non attive in Santaddeo.`
          : `.`),
      tolerancePct,
      timeToleranceMin,
      insertErrors,
    })
  } catch (err) {
    console.error("[guard/scan] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

// ============================================================================
// Helpers
// ============================================================================

function pctDiff(booked: number, expected: number): number {
  if (!expected || expected <= 0) return 0
  return Math.abs(((booked - expected) / expected) * 100)
}

/**
 * Signed percentage difference: booked vs expected.
 *  - positivo => booked > expected (favorevole alla struttura)
 *  - negativo => booked < expected (sotto-prezzo, problema)
 *  - zero     => match perfetto
 *
 * FIX 30/04/2026: usato dalla guard logic per classificare i mismatch in
 * modo ASIMMETRICO. Solo i sotto-prezzi oltre soglia diventano mismatch/warning;
 * i sovra-prezzi sono sempre OK (sorpresa positiva).
 */
function signedPctDiff(booked: number, expected: number): number {
  if (!expected || expected <= 0) return 0
  return ((booked - expected) / expected) * 100
}

/**
 * Try to find the expected price with progressively relaxed filters.
 *
 * RATE MATCHING POLICY (FIX 30/04/2026):
 * Confrontare tariffe diverse e' un BUG che genera falsi mismatch. Esempio:
 *   - Prenotazione su rate "B&B Not Refundable" (€85)
 *   - Nessun prezzo inviato su quella tariffa specifica
 *   - Prezzo inviato di "B&B Standard" e' €100
 * Lo step 2 "any rate_id" pre-fix tornava il €100 -> guard segnalava
 * mismatch "sotto-prezzo del 15%" che NON ESISTE. Le due tariffe hanno
 * politiche di prezzo intenzionalmente diverse.
 *
 * Nuova policy:
 *   - rate_id presente sulla prenotazione -> SOLO match esatto sulla rate.
 *     Se non trovo, tornioamo null (caller marca come "warning - tariffa
 *     non confrontabile"). Mai cross-rate.
 *   - rate_id assente sulla prenotazione (PMS che non lo passa, es.
 *     Bedzzle/gsheets) -> consentiamo "any rate_id" come fallback unico.
 *
 * Step di occupancy=2: stessa rate, occupancy diversa. Conserviamo perche'
 * Scidoo memorizza prezzi base BAR per pax=2 e applica adjustment a sale.
 * Quindi NON e' "mele con pere", e' la stessa tariffa.
 */
/**
 * FIX 04/05/2026 (incident "Push dopo prenotazione" su Massabò):
 * `last_sent_prices` e' una tabella di STATO (UPSERT, una sola riga per
 * cella che rappresenta l'ULTIMO push). Se l'ultimo push e' DOPO il
 * booking, una query `lte("sent_at", bookingTimestamp)` non trova nulla
 * anche quando in passato ci sono stati N push validi PRIMA del booking.
 *
 * Lo storico vero dei push e' in `price_change_log` con `action_taken='pms'`.
 * Quindi: prima usiamo `last_sent_prices` (caso comune, indici ottimi);
 * se non trova nulla, ricadiamo su `price_change_log` filtrato per push
 * effettivi al PMS prima del booking. Cosi' il Guard distingue
 * correttamente "push reale dopo il booking" (warning) da "stato attuale
 * dopo il booking ma in passato c'erano push prima" (mismatch comparabile).
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
  // Step 1 (rate_id presente): match esatto sulla tariffa.
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

    // Stessa rate, occupancy=2 fallback (solo se diverso da 2):
    // ipotesi BAR + adjustment, verra' annotato in note dal caller.
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

    // FIX 04/05/2026: prima di dichiarare "Push dopo prenotazione",
    // controlliamo lo storico dei push reali in price_change_log.
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

    // Rate esplicita ma niente match: NON cadere su any-rate.
    return null
  }

  // Step 2 (rate_id assente): caller PMS non passa la tariffa, fallback
  // any-rate accettabile. E' best-effort per Bedzzle/gsheets.
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

  // FIX 04/05/2026: any-rate fallback in price_change_log.
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

/**
 * Find the price that was live IMMEDIATELY BEFORE another one (used for
 * time tolerance: was the "old" price still what Booking.com was showing?).
 *
 * Stessa policy di findExpectedPrice: se rate_id presente NON ricadiamo
 * su any-rate, restiamo dentro la stessa tariffa.
 */
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

    // FIX 04/05/2026: storico vero in price_change_log per la stessa rate.
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
