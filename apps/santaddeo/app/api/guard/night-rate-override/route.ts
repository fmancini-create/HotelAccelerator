import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

/**
 * POST /api/guard/night-rate-override
 *
 * Imposta o rimuove un override di tariffa per una specifica notte di una
 * specifica prenotazione. Usato per le prenotazioni multi-tariffa (es. 2
 * notti B&B + 1 notte Pernottamento) dove il PMS espone una sola rate ma
 * in realta' ne sono state usate piu' d'una.
 *
 * Body:
 *   - hotel_id: string (uuid, required)
 *   - booking_id: string (pms_booking_id, required)
 *   - checkin_date: string (YYYY-MM-DD, required) — la data della NOTTE
 *     da overrideare (NON la data di check-in del booking, ma la data
 *     specifica del soggiorno notte per notte; coincide col campo
 *     `price_guard_checks.checkin_date`).
 *   - rate_id: string | null — l'uuid della rate da assegnare a quella
 *     notte. Passare `null` per rimuovere l'override e tornare alla
 *     rate del booking.
 *
 * Auth: super_admin o membro hotel (stesso pattern di guard-multi-rate-toggle).
 *
 * Effetto immediato sui guard checks: la riga `price_guard_checks` per
 * (booking_id, checkin_date) viene aggiornata con il nuovo
 * `rate_id_override` E `rate_id` (cosi' la UI riflette il cambio senza
 * dover ri-scansionare). Il prossimo scan (anche con force=true)
 * preservera' l'override grazie al loading-before-wipe in
 * /api/guard/scan/route.ts.
 *
 * Response:
 *   - { success: true, ratename: string | null } se ok
 *   - { error: string } in caso di errore
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const body = await request.json()
    const hotel_id: unknown = body?.hotel_id
    const booking_id: unknown = body?.booking_id
    const checkin_date: unknown = body?.checkin_date
    const rate_id: unknown = body?.rate_id // string | null

    if (typeof hotel_id !== "string" || !hotel_id) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }
    if (typeof booking_id !== "string" || !booking_id) {
      return NextResponse.json({ error: "booking_id obbligatorio" }, { status: 400 })
    }
    if (typeof checkin_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(checkin_date)) {
      return NextResponse.json(
        { error: "checkin_date obbligatorio (formato YYYY-MM-DD)" },
        { status: 400 },
      )
    }
    if (rate_id !== null && (typeof rate_id !== "string" || !rate_id)) {
      return NextResponse.json(
        { error: "rate_id deve essere uuid o null per rimuovere l'override" },
        { status: 400 },
      )
    }

    // FIX 02/05/2026 (incident "Override tariffa non riuscito: Forbidden"):
    // il check precedente usava `profiles.hotel_id` che NON esiste in
    // questo schema (profiles ha solo `organization_id`). Risultato:
    // .select("role, hotel_id") falliva silenziosamente, profile arrivava
    // null e tutti gli utenti — inclusi i super_admin — ricevevano 403.
    //
    // Usiamo `validateHotelAccess()` che e' la utility ufficiale e gestisce
    // correttamente i 3 casi: super_admin (full access), hotel_users
    // (junction table multi-hotel) e organization_id (legacy single-org).
    // Stesso pattern usato dagli altri endpoint protetti.
    const denied = await validateHotelAccess(hotel_id)
    if (denied) return denied

    // Se rate_id e' specificato, verifica che esista e appartenga all'hotel.
    let rateName: string | null = null
    if (rate_id) {
      const { data: rate, error: rateErr } = await supabase
        .from("rates")
        .select("id, name, hotel_id")
        .eq("id", rate_id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (rateErr || !rate) {
        return NextResponse.json(
          { error: "Tariffa non trovata o non appartiene a questo hotel" },
          { status: 400 },
        )
      }
      rateName = rate.name
    }

    // Update della riga price_guard_checks. Nota: cambiamo SIA
    // `rate_id_override` che `rate_id` cosi' la UI mostra subito la rate
    // corretta senza aspettare un re-scan. Il prossimo scan ricalcolera'
    // expected_price/difference_pct/result usando la rate aggiornata.
    const { data: updateResult, error: updErr } = await supabase
      .from("price_guard_checks")
      .update({
        rate_id_override: rate_id,
        rate_id: rate_id,
      })
      .eq("hotel_id", hotel_id)
      .eq("booking_id", booking_id)
      .eq("checkin_date", checkin_date)
      .select("id")

    if (updErr) {
      return NextResponse.json(
        { error: `Errore update: ${updErr.message}` },
        { status: 500 },
      )
    }

    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nessuna riga price_guard_checks trovata per questa notte. " +
            "Lancia uno scan Guard prima di assegnare un override.",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      rate_name: rateName,
      updated: updateResult.length,
    })
  } catch (err) {
    console.error("[guard/night-rate-override] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    )
  }
}
