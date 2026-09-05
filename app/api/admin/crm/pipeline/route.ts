import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getCallerIdentity, adminUserIdPerDatabase } from "@/lib/auth/admin-access"
import {
  acquisitaDalSito,
  classificaConversazione,
  faseDi,
  notaEsitoIA,
  FASI,
  type FaseKey,
} from "@/lib/crm/date-requests"
import { syncPipelineSalesAttribution } from "@/lib/crm/sales-attribution-store"

/**
 * Pipeline commerciale: le richieste di date in `contact_date_requests`.
 *
 * ─── DUE BLOCCHI, MAI SOMMATI ───
 *
 * Le righe di gestionale (scidoo, myrestoo) sono conferme di prenotazioni fatte
 * sul sito, non trattative lavorate da qualcuno: stanno in un elenco separato e
 * non entrano nei conteggi per fase. Mescolarle direbbe che il lavoro
 * commerciale ha convertito 181 richieste su 200, quando le richieste vere sono
 * poche decine.
 *
 * ─── COSA VIENE ESCLUSO, E PERCHÉ SI CONTA ───
 *
 * L'estrattore legge date da qualunque email le contenga. Fra le righe "di
 * persone" finiscono così pratiche interne (rimborsi, richieste di intervento)
 * e conversazioni di prova. Vengono escluse, ma il loro numero è DICHIARATO
 * nella risposta: un'esclusione silenziosa è indistinguibile da una perdita di
 * dati, e chi guarda deve poter dire "sono 8, non sono spariti".
 *
 * MISURATO ALLA SCRITTURA: 200 righe totali — 173 dal gestionale, 27 da
 * conversazioni di persone, di cui 6 interne e 2 di prova escluse, e 1 conferma
 * del gestionale riconosciuta dall'oggetto e spostata fra le acquisite.
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
  stage: string | null
  stage_set_by: string | null
  stage_set_at: string | null
  created_at: string | null
}

export interface RichiestaPipeline extends RigaDb {
  fase: FaseKey
  /** Nome del contatto se collegato, altrimenti dalla conversazione. */
  chi: string | null
  /** Canale della conversazione d'origine, quando disponibile. */
  canale: string | null
  /** Oggetto della conversazione: serve a capire di cosa si tratta. */
  oggetto: string | null
  /** Cosa ha letto l'IA, come nota. Mai usato per collocare la riga. */
  nota_ia: string | null
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
    /** Righe senza data di arrivo estratta. */
    senza_data: number
    /** Escluse perché non sono richieste di clienti, con il perché. */
    escluse: { interne: number; prove: number }
    /** Conferme del gestionale riconosciute dall'oggetto e spostate. */
    conferme_da_oggetto: number
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

    const { data: struttura, error: erroreStruttura } = await supabase
      .from("properties")
      .select("domain, custom_domain")
      .eq("id", propertyId)
      .maybeSingle()
    if (erroreStruttura) throw erroreStruttura
    const dominio = struttura?.domain ?? struttura?.custom_domain ?? null

    const { data, error } = await supabase
      .from("contact_date_requests")
      .select(
        "id, conversation_id, contact_id, requested_check_in, requested_check_out, nights, guests_adults, outcome, source, quoted_rate_cents, stage, stage_set_by, stage_set_at, created_at",
      )
      .eq("property_id", propertyId)
      .order("requested_check_in", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(TETTO + 1)
    if (error) throw error

    const tutte = (data ?? []) as RigaDb[]
    const troncato = tutte.length > TETTO
    const righe = troncato ? tutte.slice(0, TETTO) : tutte

    const idConversazioni = Array.from(
      new Set(righe.map((r) => r.conversation_id).filter((v): v is string => Boolean(v))),
    )
    const dettagli = new Map<
      string,
      { chi: string | null; canale: string | null; oggetto: string | null; email: string | null }
    >()
    for (let i = 0; i < idConversazioni.length; i += 200) {
      const lotto = idConversazioni.slice(i, i + 200)
      const { data: conv, error: erroreConv } = await supabase
        .from("conversations")
        .select("id, contact_name, contact_email, subject, channel")
        .eq("property_id", propertyId)
        .in("id", lotto)
      if (erroreConv) throw erroreConv
      for (const c of conv ?? []) {
        const nome = (c.contact_name ?? "").trim() || (c.contact_email ?? "").trim() || null
        dettagli.set(c.id as string, {
          chi: nome,
          canale: (c.channel as string) ?? null,
          oggetto: (c.subject as string) ?? null,
          email: (c.contact_email as string) ?? null,
        })
      }
    }

    const richieste: RichiestaPipeline[] = []
    const acquisite: RichiestaPipeline[] = []
    const escluse = { interne: 0, prove: 0 }
    let conferme_da_oggetto = 0

    for (const r of righe) {
      const extra = r.conversation_id ? dettagli.get(r.conversation_id) : undefined
      const arricchita: RichiestaPipeline = {
        ...r,
        fase: faseDi(r),
        chi: extra?.chi ?? null,
        canale: extra?.canale ?? null,
        oggetto: extra?.oggetto ?? null,
        nota_ia: notaEsitoIA(r.outcome),
      }

      if (acquisitaDalSito(r.source ?? "")) {
        acquisite.push(arricchita)
        continue
      }

      const classe = classificaConversazione(
        { contact_email: extra?.email ?? null, subject: extra?.oggetto ?? null },
        dominio,
      )
      if (classe === "interna") {
        escluse.interne += 1
        continue
      }
      if (classe === "prova") {
        escluse.prove += 1
        continue
      }
      if (classe === "conferma_gestionale") {
        conferme_da_oggetto += 1
        acquisite.push(arricchita)
        continue
      }
      richieste.push(arricchita)
    }

    const per_fase = Object.fromEntries(FASI.map((f) => [f.key, 0])) as Record<FaseKey, number>
    for (const r of richieste) per_fase[r.fase] += 1

    const risposta: RispostaPipeline = {
      richieste,
      acquisite,
      riepilogo: {
        totale: righe.length,
        richieste: richieste.length,
        acquisite: acquisite.length,
        per_fase,
        senza_data: richieste.filter((r) => !r.requested_check_in).length,
        escluse,
        conferme_da_oggetto,
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
 * Fase e valore sono decisioni umane. Oltre alla pipeline, questo endpoint
 * aggiorna il read model commerciale usato dai KPI: una modifica futura non
 * deve richiedere di rileggere Gmail per sapere chi ha inviato un preventivo o
 * chi ha chiuso una trattativa.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Struttura non trovata." }, { status: 404 })
    }

    const corpo = (await request.json().catch(() => null)) as
      | { id?: unknown; tariffa_cents?: unknown; fase?: unknown }
      | null
    const id = typeof corpo?.id === "string" ? corpo.id.trim() : ""
    if (!id) {
      return NextResponse.json({ error: "Richiesta non indicata." }, { status: 400 })
    }

    const identity = await getCallerIdentity(request)
    const actorId = adminUserIdPerDatabase(identity?.adminUserId)
    const actionAt = new Date().toISOString()
    const modifiche: Record<string, unknown> = {}
    let quoteValueWasSet = false

    if (corpo && "fase" in corpo) {
      const grezza = corpo.fase
      if (grezza === null) {
        modifiche.stage = null
        modifiche.stage_set_by = null
        modifiche.stage_set_at = null
      } else if (typeof grezza === "string" && FASI.some((f) => f.key === grezza)) {
        modifiche.stage = grezza
        modifiche.stage_set_by = actorId
        modifiche.stage_set_at = actionAt
      } else {
        return NextResponse.json(
          { error: `Fase non valida. Ammesse: ${FASI.map((f) => f.key).join(", ")}, oppure null.` },
          { status: 400 },
        )
      }
    }

    if (corpo && "tariffa_cents" in corpo) {
      const grezza = corpo.tariffa_cents
      if (grezza === null) {
        modifiche.quoted_rate_cents = null
      } else if (
        typeof grezza === "number" &&
        Number.isInteger(grezza) &&
        grezza >= 0 &&
        grezza <= 100_000_000
      ) {
        modifiche.quoted_rate_cents = grezza === 0 ? null : grezza
        quoteValueWasSet = grezza > 0
      } else {
        return NextResponse.json(
          { error: "Tariffa non valida: attesi centesimi interi fra 0 e 100.000.000, oppure null." },
          { status: 400 },
        )
      }
    }

    if (Object.keys(modifiche).length === 0) {
      return NextResponse.json({ error: "Nessuna modifica indicata." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contact_date_requests")
      .update(modifiche)
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("id, conversation_id, outcome, quoted_rate_cents, stage, stage_set_by, stage_set_at")
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "Richiesta non trovata in questa struttura." }, { status: 404 })
    }

    let salesAttributionSynced = true
    try {
      await syncPipelineSalesAttribution(supabase, propertyId, data, {
        actorId,
        at: actionAt,
        quoteValueWasSet,
      })
    } catch (salesError) {
      // La pipeline è la fonte primaria e non va fatta fallire dopo un UPDATE
      // già riuscito. Il backfill admin può ricostruire questo read model.
      salesAttributionSynced = false
      console.error("[crm-pipeline] sales attribution sync failed", {
        propertyId,
        dateRequestId: data.id,
        error: salesError instanceof Error ? salesError.message : "unknown",
      })
    }

    return NextResponse.json({
      id: data.id,
      quoted_rate_cents: data.quoted_rate_cents,
      stage: data.stage,
      stage_set_at: data.stage_set_at,
      fase: faseDi(data as { stage: string | null; quoted_rate_cents: number | null }),
      nota_ia: notaEsitoIA(data.outcome),
      sales_attribution_synced: salesAttributionSynced,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const messaggio = error instanceof Error ? error.message : "Errore"
    const stato = messaggio.includes("autenticat") || messaggio.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: messaggio }, { status: stato })
  }
}
