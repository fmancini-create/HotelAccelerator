import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { acquisitaDalSito, faseDi, type FaseKey } from "@/lib/crm/date-requests"

/**
 * Pipeline commerciale: le richieste di date in `contact_date_requests`.
 *
 * DUE BLOCCHI, MAI SOMMATI. Le righe con `source` di gestionale (scidoo,
 * myrestoo) sono conferme di prenotazioni fatte sul sito, non trattative
 * lavorate da qualcuno: stanno in un elenco separato e non entrano nei conteggi
 * per fase. Mescolarle direbbe che il lavoro commerciale ha convertito 181
 * richieste su 200, quando le richieste vere sono 27.
 *
 * MISURATO AL MOMENTO DELLA SCRITTURA: 200 righe, 173 da Scidoo e 27 da
 * conversazioni di persone; esiti "confermata" 181, "aperta" 18, nessun esito 1;
 * zero tariffe, perché nessun payload delle estrazioni contiene un prezzo.
 */

/** Tetto di righe lette, con troncamento DICHIARATO nella risposta. */
const TETTO = 5000

interface RigaDb {
  id: string
  conversation_id: string | null
  contact_id: string | null
  requested_check_in: string | null
  requested_check_out: string | null
  nights: number | null
  guests_adults: number | null
  outcome: string | null
  source: string | null
  quoted_rate_cents: number | null
  created_at: string | null
}

export interface RichiestaPipeline extends RigaDb {
  fase: FaseKey
  /** Nome del contatto se collegato, altrimenti dalla conversazione. */
  chi: string | null
  /** Canale della conversazione d'origine, quando disponibile. */
  canale: string | null
}

export interface RispostaPipeline {
  /** Le richieste lavorabili: persone che hanno scritto. */
  richieste: RichiestaPipeline[]
  /** Le prenotazioni arrivate dal sito, dichiarate come tali. */
  acquisite: RichiestaPipeline[]
  riepilogo: {
    totale: number
    richieste: number
    acquisite: number
    /** Conteggi per fase, calcolati SOLO sulle richieste lavorabili. */
    per_fase: Record<FaseKey, number>
    /** Righe senza data di arrivo estratta (esistono: 12 alla scrittura). */
    senza_data: number
    troncato: boolean
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Struttura non trovata." }, { status: 404 })
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("contact_date_requests")
      .select(
        "id, conversation_id, contact_id, requested_check_in, requested_check_out, nights, guests_adults, outcome, source, quoted_rate_cents, created_at",
      )
      .eq("property_id", propertyId)
      // Le richieste più imminenti in cima; `id` come ultima chiave per un
      // ordine univoco, altrimenti la paginazione può ripetere o saltare righe.
      .order("requested_check_in", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(TETTO + 1)
    if (error) throw error

    const tutte = (data ?? []) as RigaDb[]
    const troncato = tutte.length > TETTO
    const righe = troncato ? tutte.slice(0, TETTO) : tutte

    // Nomi: si leggono dalle conversazioni collegate. `contact_id` è vuoto su
    // tutte le righe misurate (le conversazioni non sono agganciate a un
    // contatto), quindi senza questo passaggio la colonna "chi" sarebbe vuota.
    const idConversazioni = Array.from(
      new Set(righe.map((r) => r.conversation_id).filter((v): v is string => Boolean(v))),
    )
    const nomi = new Map<string, { chi: string | null; canale: string | null }>()
    for (let i = 0; i < idConversazioni.length; i += 200) {
      const lotto = idConversazioni.slice(i, i + 200)
      const { data: conv, error: erroreConv } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_email, channel")
        .eq("property_id", propertyId)
        .in("id", lotto)
      if (erroreConv) throw erroreConv
      for (const c of conv ?? []) {
        const nome = (c.contact_name ?? "").trim() || (c.contact_email ?? "").trim() || null
        nomi.set(c.id as string, { chi: nome, canale: (c.channel as string) ?? null })
      }
    }

    const arricchite: RichiestaPipeline[] = righe.map((r) => {
      const extra = r.conversation_id ? nomi.get(r.conversation_id) : undefined
      return {
        ...r,
        fase: faseDi(r),
        chi: extra?.chi ?? null,
        canale: extra?.canale ?? null,
      }
    })

    const acquisite = arricchite.filter((r) => acquisitaDalSito(r.source ?? ""))
    const richieste = arricchite.filter((r) => !acquisitaDalSito(r.source ?? ""))

    const per_fase: Record<FaseKey, number> = {
      da_qualificare: 0,
      aperta: 0,
      preventivo_inviato: 0,
      confermata: 0,
      persa: 0,
    }
    // SOLO sulle richieste lavorabili: è il punto per cui i blocchi sono due.
    for (const r of richieste) per_fase[r.fase] += 1

    const risposta: RispostaPipeline = {
      richieste,
      acquisite,
      riepilogo: {
        totale: arricchite.length,
        richieste: richieste.length,
        acquisite: acquisite.length,
        per_fase,
        senza_data: arricchite.filter((r) => !r.requested_check_in).length,
        troncato,
      },
    }

    return NextResponse.json(risposta)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const messaggio = error instanceof Error ? error.message : "Errore"
    const stato = messaggio.includes("autenticat") || messaggio.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: messaggio }, { status: stato })
  }
}

/**
 * Tariffa preventivata, inserita a mano.
 *
 * È l'unico campo scrivibile: le estrazioni non contengono prezzi (verificato su
 * tutti i 1.333 payload), quindi senza questo la fase "Preventivo inviato"
 * sarebbe irraggiungibile — una colonna che non può riempirsi.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Struttura non trovata." }, { status: 404 })
    }

    const corpo = (await request.json().catch(() => null)) as
      | { id?: unknown; tariffa_cents?: unknown }
      | null
    const id = typeof corpo?.id === "string" ? corpo.id.trim() : ""
    if (!id) {
      return NextResponse.json({ error: "Richiesta non indicata." }, { status: 400 })
    }

    // `null` cancella la tariffa; un numero la imposta. Validato qui e non solo
    // nell'interfaccia: la rotta è raggiungibile anche senza passare da lei.
    const grezza = corpo?.tariffa_cents
    let tariffa: number | null
    if (grezza === null) {
      tariffa = null
    } else if (typeof grezza === "number" && Number.isInteger(grezza) && grezza >= 0 && grezza <= 100_000_000) {
      tariffa = grezza === 0 ? null : grezza
    } else {
      return NextResponse.json(
        { error: "Tariffa non valida: attesi centesimi interi fra 0 e 100.000.000, oppure null." },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // Lo scope per `property_id` sta nella UPDATE, non in un controllo prima:
    // così una richiesta di un'altra struttura non aggiorna nulla invece di
    // essere trovata e poi scartata dal codice.
    const { data, error } = await supabase
      .from("contact_date_requests")
      .update({ quoted_rate_cents: tariffa })
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("id, outcome, quoted_rate_cents")
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Richiesta non trovata in questa struttura." }, { status: 404 })
    }

    return NextResponse.json({
      id: data.id,
      quoted_rate_cents: data.quoted_rate_cents,
      // La fase si ricalcola qui: l'interfaccia non deve dedurla per conto suo,
      // o le due regole divergerebbero.
      fase: faseDi(data as { outcome: string | null; quoted_rate_cents: number | null }),
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const messaggio = error instanceof Error ? error.message : "Errore"
    const stato = messaggio.includes("autenticat") || messaggio.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: messaggio }, { status: stato })
  }
}
