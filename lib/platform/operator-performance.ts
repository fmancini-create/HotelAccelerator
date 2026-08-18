import type { SupabaseClient } from "@supabase/supabase-js"

import { listAnalyticsSources, canaleIncluso, type AnalyticsFilter } from "@/lib/platform/analytics-sources"

/**
 * Performance degli operatori: quante risposte, con che attesa.
 *
 * Tre scelte che nascono da misure fatte su questa struttura, non da preferenze:
 *
 * 1. NESSUNA CONVERSIONE. Non esiste una fonte che la misuri: `contact_date_requests`
 *    ha 0 righe, le conversazioni chiuse sono 0 su 7.692, e le 155 prenotazioni
 *    camera + 78 ristorante che si vedono in archivio arrivano da notifiche
 *    automatiche di Scidoo/Myrestoo, cioe' da prenotazioni fatte sul sito. Attribuirle
 *    a un operatore sarebbe un merito inventato. La pagina dichiara che il dato manca
 *    invece di stimarlo.
 *
 * 2. L'IA STA FUORI CLASSIFICA. Ha inviato 37 delle 54 risposte e risponde in
 *    pochi secondi: in una graduatoria di velocita' vincerebbe sempre, rendendo il
 *    confronto fra persone illeggibile. Compare come riga a se', con i suoi numeri.
 *
 * 3. SOTTO UNA SOGLIA NON C'E' GRADUATORIA. Oggi le risposte umane attribuite sono
 *    3 in tutto: una persona con 1 risposta (attesa 1 minuto) e una con 2 (attese
 *    109 e 3.067 minuti). Un podio direbbe che la prima e' la piu' veloce della
 *    struttura, che e' solo il caso di un singolo messaggio.
 */

/** Sotto questo numero di risposte la persona non entra in graduatoria. */
export const SOGLIA_GRADUATORIA = 5

/** Finestra predefinita, in giorni. */
export const GIORNI_PREDEFINITI = 30

export type OperatoreRiga = {
  /** Id dell'operatore, oppure null per IA e non attribuite. */
  id: string | null
  nome: string
  /** "persona" | "ia" | "non-attribuite" */
  genere: "persona" | "ia" | "non-attribuite"
  risposte: number
  /** Conversazioni distinte toccate. */
  conversazioni: number
  /**
   * Mediana dell'attesa in SECONDI, oppure null se nessuna risposta ha una domanda
   * precedente da cui misurare. L'unita' sta nel nome del campo perche' un
   * `attesaMediana` generico che contiene secondi e' un'etichetta che mente.
   *
   * Mediana e non media: con pochi dati un singolo valore anomalo (una risposta
   * dopo il fine settimana) sposterebbe la media di giorni. Misurato: per una delle
   * due persone le attese sono 109 e 3.067 minuti, la media direbbe 1.588 e non
   * descriverebbe nessuna delle due.
   */
  attesaMedianaSec: number | null
  /** Su quante risposte e' calcolata l'attesa: il denominatore va mostrato. */
  attesaSu: number
  /** Vero quando la persona ha abbastanza risposte per la graduatoria. */
  inGraduatoria: boolean
}

export type PerformanceResult = {
  righe: OperatoreRiga[]
  /** Giorni della finestra: pubblicato come dato, non promesso in una frase. */
  giorni: number
  totaleRisposte: number
  risposteUmaneAttribuite: number
  risposteNonAttribuite: number
  risposteIa: number
  /** Vero quando nessuna persona raggiunge la soglia. */
  graduatoriaNonDisponibile: boolean
  soglia: number
  /** Sorgenti escluse dalle statistiche, da dichiarare a schermo. */
  sorgentiEscluse: number
  /**
   * La conversione non e' calcolabile: nessuna fonte la registra. Il motivo viaggia
   * col dato, cosi' la pagina non deve indovinare cosa scrivere.
   */
  conversione: { disponibile: false; motivo: string }
}

const mediana = (valori: number[]): number | null => {
  if (valori.length === 0) return null
  const ordinati = [...valori].sort((a, b) => a - b)
  const meta = Math.floor(ordinati.length / 2)
  return ordinati.length % 2 === 1 ? ordinati[meta] : Math.round((ordinati[meta - 1] + ordinati[meta]) / 2)
}

const eIa = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== "object") return false
  return Object.keys(metadata as Record<string, unknown>).some((k) => k.startsWith("ai_"))
}

export async function computeOperatorPerformance(
  sb: SupabaseClient,
  propertyId: string,
  giorni: number = GIORNI_PREDEFINITI,
): Promise<PerformanceResult> {
  const da = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString()

  // Le performance rispettano la scelta delle sorgenti: se una casella non conta
  // nelle statistiche, non deve contare nemmeno nei meriti di chi risponde.
  const { filter: sorgenti } = await listAnalyticsSources(sb, propertyId)

  // `sender_type` vero e' "customer": misurato. "contact" non esiste in questa
  // base dati, e usarlo faceva sembrare che ogni messaggio fosse una risposta.
  const risposte = await sb
    .from("messages")
    .select("id,conversation_id,sender_id,created_at,metadata")
    .eq("property_id", propertyId)
    .eq("sender_type", "agent")
    .gte("created_at", da)

  const elenco = risposte.data ?? []

  // Conversazioni ammesse dal filtro sorgenti.
  const convIds = [...new Set(elenco.map((m: any) => m.conversation_id).filter(Boolean))]
  const ammesse = new Set<string>()
  if (convIds.length > 0) {
    const conv = await sb
      .from("conversations")
      .select("id,channel,channel_id")
      .eq("property_id", propertyId)
      .in("id", convIds)
    for (const c of conv.data ?? []) {
      if (!sorgenteAmmessa(sorgenti, c)) continue
      ammesse.add(c.id)
    }
  }

  const valide = elenco.filter((m: any) => ammesse.has(m.conversation_id))

  // Domande del cliente, per misurare l'attesa. Si leggono solo le conversazioni
  // che servono, non tutto l'archivio.
  const perConversazione = new Map<string, number[]>()
  if (ammesse.size > 0) {
    const domande = await sb
      .from("messages")
      .select("conversation_id,created_at")
      .eq("property_id", propertyId)
      .eq("sender_type", "customer")
      .in("conversation_id", [...ammesse])
    for (const d of domande.data ?? []) {
      const t = new Date(d.created_at).getTime()
      const lista = perConversazione.get(d.conversation_id) ?? []
      lista.push(t)
      perConversazione.set(d.conversation_id, lista)
    }
    for (const lista of perConversazione.values()) lista.sort((a, b) => a - b)
  }

  const attesaDi = (m: any): number | null => {
    const t = new Date(m.created_at).getTime()
    const domande = perConversazione.get(m.conversation_id) ?? []
    let ultima: number | null = null
    for (const d of domande) {
      if (d < t) ultima = d
      else break
    }
    if (ultima === null) return null
    // In SECONDI, non in minuti arrotondati: misurato che l'IA risponde in 2
    // secondi, che arrotondato dava "0 min" a schermo, cioe' un dato vero che
    // sembrava mancante. Chi legge trasforma i secondi in unita' leggibili.
    return Math.round((t - ultima) / 1000)
  }

  type Accumulo = { risposte: number; conv: Set<string>; attese: number[] }
  const persone = new Map<string, Accumulo>()
  const ia: Accumulo = { risposte: 0, conv: new Set(), attese: [] }
  const senzaAutore: Accumulo = { risposte: 0, conv: new Set(), attese: [] }

  for (const m of valide as any[]) {
    const dove = eIa(m.metadata) ? ia : m.sender_id ? undefined : senzaAutore
    const acc =
      dove ??
      (() => {
        const k = String(m.sender_id)
        const esistente = persone.get(k) ?? { risposte: 0, conv: new Set<string>(), attese: [] }
        persone.set(k, esistente)
        return esistente
      })()
    acc.risposte += 1
    if (m.conversation_id) acc.conv.add(m.conversation_id)
    const a = attesaDi(m)
    if (a !== null) acc.attese.push(a)
  }

  // Nomi veri delle persone: un id abbreviato non dice niente a chi guarda.
  // La colonna e' `name` (misurato: `full_name` non esiste in admin_users).
  const nomi = new Map<string, string>()
  if (persone.size > 0) {
    const u = await sb.from("admin_users").select("id,email,name").in("id", [...persone.keys()])
    for (const x of u.data ?? []) nomi.set(x.id, x.name || x.email || "Operatore")
  }

  const righe: OperatoreRiga[] = []

  for (const [id, acc] of persone) {
    const nome = nomi.get(id)

    // Autore non piu' in anagrafica: NON diventa una persona senza nome.
    //
    // Misurato su questa struttura: uno dei due soli autori (`c03a5f70`) non esiste
    // ne' fra gli utenti ne' in anagrafica, ed e' proprio quello con l'attesa piu'
    // bassa (1 minuto su 1 risposta). Mostrarlo come "Operatore" avrebbe messo in
    // cima alla classifica della struttura un id che non corrisponde a nessuno.
    if (!nome) {
      senzaAutore.risposte += acc.risposte
      for (const c of acc.conv) senzaAutore.conv.add(c)
      senzaAutore.attese.push(...acc.attese)
      continue
    }

    righe.push({
      id,
      nome,
      genere: "persona",
      risposte: acc.risposte,
      conversazioni: acc.conv.size,
      attesaMedianaSec: mediana(acc.attese),
      attesaSu: acc.attese.length,
      inGraduatoria: acc.risposte >= SOGLIA_GRADUATORIA,
    })
  }

  righe.sort((a, b) => b.risposte - a.risposte)

  if (ia.risposte > 0) {
    righe.push({
      id: null,
      nome: "Risposte automatiche (IA)",
      genere: "ia",
      risposte: ia.risposte,
      conversazioni: ia.conv.size,
      attesaMedianaSec: mediana(ia.attese),
      attesaSu: ia.attese.length,
      inGraduatoria: false,
    })
  }

  if (senzaAutore.risposte > 0) {
    righe.push({
      id: null,
      nome: "Risposte senza autore registrato",
      genere: "non-attribuite",
      risposte: senzaAutore.risposte,
      conversazioni: senzaAutore.conv.size,
      attesaMedianaSec: mediana(senzaAutore.attese),
      attesaSu: senzaAutore.attese.length,
      inGraduatoria: false,
    })
  }

  const umane = righe.filter((r) => r.genere === "persona")

  return {
    righe,
    giorni,
    totaleRisposte: valide.length,
    risposteUmaneAttribuite: umane.reduce((s, r) => s + r.risposte, 0),
    risposteNonAttribuite: senzaAutore.risposte,
    risposteIa: ia.risposte,
    graduatoriaNonDisponibile: !umane.some((r) => r.inGraduatoria),
    soglia: SOGLIA_GRADUATORIA,
    sorgentiEscluse: sorgenti.escluse,
    conversione: {
      disponibile: false,
      motivo:
        "Nessuna fonte registra l'esito di una conversazione: i preventivi con esito sono 0 e le prenotazioni in archivio arrivano da notifiche automatiche del gestionale, non da chi risponde.",
    },
  }
}

/** Una conversazione conta se la sua sorgente e' fra quelle scelte. */
function sorgenteAmmessa(filtro: AnalyticsFilter, c: { channel: string | null; channel_id: string | null }) {
  if (c.channel === "email") {
    // Le email hanno sempre la casella collegata (misurato: 7.684 su 7.684).
    if (filtro.emailChannelIds === null) return true
    return c.channel_id !== null && filtro.emailChannelIds.includes(c.channel_id)
  }
  return canaleIncluso(filtro, c.channel ?? "")
}
