import { type NextRequest, NextResponse, after } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getCallerIdentity, adminUserIdPerDatabase } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { indexSource } from "@/lib/ai/ingest"
import { testoFonteDaLacuna, titoloFonteDaLacuna } from "@/lib/ai/gaps"

export const dynamic = "force-dynamic"

/**
 * Le lacune di conoscenza e la loro approvazione.
 *
 * L'approvazione e' l'unico punto in cui l'esperienza delle conversazioni entra
 * in una base di conoscenza. Tutto quello che accade qui e' deliberatamente
 * esplicito, perche' una fonte approvata verra' usata per rispondere a tutti gli
 * ospiti futuri.
 */

/** Sotto questa lunghezza una "risposta" non e' conoscenza utilizzabile. */
const MIN_RISPOSTA = 10

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const stato = request.nextUrl.searchParams.get("status") ?? "aperta"

    let query = supabase
      .from("knowledge_gaps")
      .select(
        "id, conversation_id, channel, knowledge_base_id, question, ai_answer, similarity, threshold, occurrences, first_seen_at, last_seen_at, status, approved_answer, resolved_at, source_id, seen_after_resolution",
      )
      .eq("property_id", propertyId)
      // Le piu' chieste in cima: e' l'unico ordine che risponde alla domanda
      // "cosa conviene sistemare per primo".
      .order("occurrences", { ascending: false })
      // Secondo criterio univoco: senza di questo due lacune con lo stesso
      // numero di ripetizioni possono scambiarsi di posto fra due caricamenti.
      .order("last_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(200)

    if (stato !== "tutte") query = query.eq("status", stato)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    // I conteggi per stato, cosi' la pagina puo' dire quante sono in attesa
    // senza caricarle tutte.
    const { data: tutte } = await supabase.from("knowledge_gaps").select("status").eq("property_id", propertyId)
    const conteggi = { aperta: 0, approvata: 0, ignorata: 0 }
    for (const r of tutte ?? []) {
      const s = r.status as keyof typeof conteggi
      if (s in conteggi) conteggi[s] += 1
    }

    return NextResponse.json({ gaps: data ?? [], counts: conteggi })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const id = typeof body.id === "string" ? body.id : null
    const azione = body.action as "approva" | "ignora"
    if (!id) return NextResponse.json({ error: "Lacuna mancante" }, { status: 400 })
    if (azione !== "approva" && azione !== "ignora") {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: lacuna } = await supabase
      .from("knowledge_gaps")
      .select("id, question, status, knowledge_base_id")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!lacuna) return NextResponse.json({ error: "Lacuna non trovata" }, { status: 404 })

    // Approvare due volte creerebbe due fonti con lo stesso contenuto, e la
    // seconda resterebbe nella base senza che nessuno sappia perche'.
    if (lacuna.status !== "aperta") {
      return NextResponse.json({ error: `Lacuna già ${lacuna.status}` }, { status: 409 })
    }

    const identity = await getCallerIdentity(request)
    const chiHaDeciso = adminUserIdPerDatabase(identity?.adminUserId)
    const adesso = new Date().toISOString()

    if (azione === "ignora") {
      const { error } = await supabase
        .from("knowledge_gaps")
        .update({ status: "ignorata", resolved_by: chiHaDeciso, resolved_at: adesso, updated_at: adesso })
        .eq("id", id)
        .eq("property_id", propertyId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, status: "ignorata" })
    }

    // APPROVAZIONE: serve una risposta scritta da una persona.
    //
    // Non si usa mai come predefinita la frase dell'assistente: in modo
    // "conversational" quella frase e', per costruzione, un "non ho questa
    // informazione" (il prompt gli vieta di inventare fatti sulla struttura).
    // Metterla nella base insegnerebbe all'assistente a non sapere.
    const risposta = typeof body.answer === "string" ? body.answer.trim() : ""
    if (risposta.length < MIN_RISPOSTA) {
      return NextResponse.json(
        { error: `La risposta da inserire nella base deve contenere almeno ${MIN_RISPOSTA} caratteri` },
        { status: 400 },
      )
    }

    // La base di destinazione: quella del canale da cui e' nata la lacuna,
    // oppure una scelta esplicita (serve quando quella base e' stata eliminata).
    const baseRichiesta = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : null
    const baseId = baseRichiesta ?? lacuna.knowledge_base_id
    if (!baseId) {
      return NextResponse.json({ error: "Indicare la base di conoscenza di destinazione" }, { status: 400 })
    }

    const { data: base } = await supabase
      .from("knowledge_bases")
      .select("id")
      .eq("id", baseId)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (!base) return NextResponse.json({ error: "Base di conoscenza non trovata" }, { status: 404 })

    // Prima la fonte, poi la lacuna: se la fonte non nasce, la lacuna resta
    // aperta. Il contrario direbbe "approvata" con niente nella base.
    const { data: fonte, error: erroreFonte } = await supabase
      .from("knowledge_sources")
      .insert({
        property_id: propertyId,
        knowledge_base_id: baseId,
        type: "conversation",
        title: titoloFonteDaLacuna(lacuna.question),
        content: testoFonteDaLacuna(lacuna.question, risposta).slice(0, 200_000),
        status: "pending",
        created_by: chiHaDeciso,
      })
      .select("id, type, title, status, created_at")
      .single()

    if (erroreFonte || !fonte) {
      throw new Error(erroreFonte?.message ?? "Creazione della fonte fallita")
    }

    const { error: erroreLacuna } = await supabase
      .from("knowledge_gaps")
      .update({
        status: "approvata",
        approved_answer: risposta,
        knowledge_base_id: baseId,
        source_id: fonte.id,
        resolved_by: chiHaDeciso,
        resolved_at: adesso,
        updated_at: adesso,
      })
      .eq("id", id)
      .eq("property_id", propertyId)

    if (erroreLacuna) {
      // La fonte esiste gia' nella base: va detto, altrimenti la pagina
      // mostrerebbe la lacuna ancora aperta e una nuova approvazione
      // creerebbe un duplicato.
      console.log(`[v0] lacuna approvata ma stato non aggiornato: ${erroreLacuna.message}`)
      return NextResponse.json(
        { error: "Fonte creata, ma lo stato della lacuna non è stato aggiornato", sourceId: fonte.id },
        { status: 500 },
      )
    }

    // Indicizzazione dopo la risposta, come per le altre fonti: la pagina vede
    // subito lo stato "pending" e il cron di reindicizzazione e' la rete di
    // sicurezza.
    after(async () => {
      try {
        await indexSource(fonte.id, propertyId)
      } catch (err) {
        console.log(`[v0] indexSource lacuna fallita: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

    return NextResponse.json({ ok: true, status: "approvata", source: fonte })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
