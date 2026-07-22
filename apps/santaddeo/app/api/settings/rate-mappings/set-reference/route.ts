/**
 * GET/POST /api/settings/rate-mappings/set-reference
 *
 * Letture e scritture della "tariffa di riferimento" dell'hotel
 * (`pricing_algo_params.param_key='reference_rate_id'`), il valore che il
 * pricing engine usa come BAR principale e da cui deriva tutte le altre
 * tariffe via `rate_adj_<id>` daily.
 *
 * Storia: il param e' gia' settabile da `/accelerator/pricing/settings`, ma
 * sezionato in mezzo a parametri algoritmici tecnici. Per il flusso "Reference
 * Rate + offset" stile RoomPriceGenie l'utente lo deve poter cambiare
 * direttamente dalla pagina mappatura (un solo punto = la BAR dell'hotel).
 *
 * Pattern di salvataggio: `pricing_algo_params` e' date-keyed. Per simulare
 * un valore "globale" lo scriviamo per un range di 365 giorni in avanti.
 * Stessa strategia gia' usata in `/accelerator/pricing/settings/page.tsx`.
 *
 * Body POST:
 *  - hotel_id (string, required)
 *  - rate_id (string|null, required) - null = clear, stringa = nuovo valore
 *
 * Response GET (?hotel_id=...): { reference_rate_id: string | null }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addDays, format } from "date-fns"

export const dynamic = "force-dynamic"

// Quanti giorni avanti scrivere il valore. 1 anno e' coerente con la finestra
// massima di pricing che gli hotel gestiscono (max 12 mesi avanti).
const HORIZON_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const hotelId = new URL(request.url).searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }

    // Prendiamo qualsiasi riga "reference_rate_id" (sono uguali fra le date
    // recenti) per quel hotel. Ordiniamo per date desc per privilegiare il
    // valore piu' aggiornato in caso di disallineamento legacy.
    const { data, error } = await supabase
      .from("pricing_algo_params")
      .select("param_value")
      .eq("hotel_id", hotelId)
      .eq("param_key", "reference_rate_id")
      .gte("date", format(new Date(), "yyyy-MM-dd"))
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("[v0] set-reference GET error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      reference_rate_id: data?.param_value || null,
    })
  } catch (e) {
    console.error("[v0] set-reference GET fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore interno" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // BUG FIX 30/04/2026: auth check mancava. La reference rate dell'hotel
    // determina come vengono pushati TUTTI i prezzi: chiunque potesse
    // cambiarla aveva pieno controllo della pricing strategy. Ora richiediamo
    // utente loggato + accesso al hotel.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const body = await request.json()
    const { hotel_id, rate_id } = body

    if (!hotel_id || typeof hotel_id !== "string") {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const isSuperAdmin = profile?.role === "super_admin" || profile?.role === "superadmin"
    if (!isSuperAdmin) {
      const { data: access } = await supabase
        .from("hotel_users")
        .select("hotel_id")
        .eq("user_id", user.id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (!access) {
        return NextResponse.json(
          { error: "Accesso negato a questo hotel" },
          { status: 403 },
        )
      }
    }

    // rate_id puo' essere null (clear) o stringa.
    if (rate_id !== null && typeof rate_id !== "string") {
      return NextResponse.json(
        { error: "rate_id deve essere uuid o null" },
        { status: 400 },
      )
    }

    // Validazione: se settiamo un rate, deve appartenere a questo hotel.
    if (rate_id) {
      const { data: rate } = await supabase
        .from("rates")
        .select("id, hotel_id, name")
        .eq("id", rate_id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (!rate) {
        return NextResponse.json(
          { error: "La tariffa selezionata non appartiene a questo hotel" },
          { status: 400 },
        )
      }
    }

    // Genera il range di date (oggi -> oggi+HORIZON_DAYS).
    const today = new Date()
    const dates: string[] = []
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      dates.push(format(addDays(today, i), "yyyy-MM-dd"))
    }

    // BUG FIX 30/04/2026: prima usavo DELETE + INSERT separati.
    // Se l'INSERT falliva (rete, RLS, vincolo), la DELETE era gia' passata
    // e l'utente perdeva la reference rate per 365 giorni — il pricing
    // engine cadeva sul fallback `rates[0]` (random!) per quel range.
    //
    // Ora uso UPSERT con onConflict sulla chiave unica `(hotel_id, param_key,
    // date)` (vedi `scripts/create-pricing-recalc-queue.sql:112`). Atomico
    // per riga, idempotente, no window di "valore mancante".
    //
    // Per il caso "clear" (rate_id=null) restiamo sul DELETE puro, che e'
    // anch'esso atomico e non ha il rischio dell'insert mancato.
    if (rate_id === null) {
      const { error: delErr } = await supabase
        .from("pricing_algo_params")
        .delete()
        .eq("hotel_id", hotel_id)
        .eq("param_key", "reference_rate_id")
        .gte("date", dates[0])

      if (delErr) {
        console.error("[v0] set-reference delete error:", delErr)
        return NextResponse.json(
          { error: "Errore cancellazione valore", details: delErr.message },
          { status: 500 },
        )
      }
    } else {
      const nowIso = new Date().toISOString()
      const rows = dates.map((d) => ({
        hotel_id,
        param_key: "reference_rate_id",
        date: d,
        param_value: rate_id,
        updated_at: nowIso,
      }))

      // Batch da 200 per stare sotto i limiti supabase su payload grande.
      const BATCH = 200
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH)
        const { error: upsertErr } = await supabase
          .from("pricing_algo_params")
          .upsert(slice, { onConflict: "hotel_id,param_key,date" })
        if (upsertErr) {
          console.error("[v0] set-reference upsert error:", upsertErr)
          return NextResponse.json(
            { error: "Errore nel salvataggio", details: upsertErr.message },
            { status: 500 },
          )
        }
      }

      // BUG FIX 30/04/2026 (audit #3): se in passato l'utente aveva esteso la
      // finestra oltre +365gg (es. setting custom in pricing/settings con
      // 500gg), e oggi cambiamo reference rate, le date oltre +365 restano
      // con il valore VECCHIO. Quando l'utente arrivera' a quel range,
      // il pricing engine usera' la reference rate sbagliata.
      // Soluzione: dopo l'upsert, cancelliamo le righe oltre l'orizzonte
      // dove il param_value e' DIVERSO da quello appena settato.
      // (Le righe oltre +365 con lo stesso valore sono benigne e le lasciamo.)
      const horizonEnd = format(addDays(today, HORIZON_DAYS), "yyyy-MM-dd")
      const { error: cleanupErr } = await supabase
        .from("pricing_algo_params")
        .delete()
        .eq("hotel_id", hotel_id)
        .eq("param_key", "reference_rate_id")
        .gt("date", horizonEnd)
        .neq("param_value", rate_id)
      if (cleanupErr) {
        // Non blocchiamo: l'upsert sulla finestra primaria e' gia' avvenuto.
        console.warn("[v0] set-reference far-future cleanup error:", cleanupErr.message)
      }
    }

    return NextResponse.json({
      success: true,
      reference_rate_id: rate_id || null,
      datesAffected: dates.length,
    })
  } catch (e) {
    console.error("[v0] set-reference POST fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore interno" },
      { status: 500 },
    )
  }
}
