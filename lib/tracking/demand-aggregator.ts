// Aggregatore domanda - analizza gli eventi di ricerca date
// per popolare il calendario della domanda
//
// DUE SORGENTI, non una:
//
//  1. `events`: le ricerche fatte sul sito. Misurato: 0 righe, quindi finora
//     questo calendario mostrava una griglia vuota a chiunque lo aprisse.
//  2. `conversation_extractions`: le date che gli ospiti chiedono scrivendo o
//     telefonando, ricavate da email, messaggistica e chiamate. Sono 88 righe
//     su 10 giorni gia' alla prima passata.
//
// La seconda si aggiunge alla prima invece di sostituirla: quando il
// tracciamento del sito comincera' a produrre eventi, i due flussi si sommano
// nello stesso calendario senza altre modifiche.

import { createClient } from "@/lib/supabase/server"

/**
 * Il client con cui leggere. Di norma si usa quello di sessione, con RLS che
 * limita alla struttura dell'utente. Ma un chiamante autenticato a TOKEN (l'API
 * per i sistemi esterni) non ha sessione: con il client di sessione RLS non
 * restituirebbe alcuna riga E NESSUN ERRORE, e la risposta direbbe "0 richieste"
 * invece di "non posso leggere" - misurato: 100 estrazioni presenti, 0
 * riportate. Un RMS che riceve zero lo interpreta come "nessuna domanda" e
 * pianifica su quel nulla. Percio' il client si puo' passare: chi lo passa e'
 * responsabile di aver stabilito l'ambito (qui: la struttura ricavata dal
 * token), e le query filtrano comunque per `property_id`.
 */
type DemandReader = Awaited<ReturnType<typeof createClient>>

export interface DemandData {
  date: string // YYYY-MM-DD
  searchCount: number
  sources: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  intensity: "low" | "medium" | "high" | "very_high"
}

export interface DemandSummary {
  period: {
    start: string
    end: string
  }
  totalSearches: number
  peakDates: DemandData[]
  bySource: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  dailyData: DemandData[]
}

/** Il canale della conversazione, tradotto nelle voci che il calendario mostra. */
function sourceOfChannel(channel: string | null | undefined): keyof DemandData["sources"] {
  const c = String(channel ?? "").toLowerCase()
  if (c === "email") return "email"
  if (c === "whatsapp") return "whatsapp"
  if (c === "telegram" || c === "chat" || c === "webchat") return "chat"
  return "website"
}

/**
 * Le date chieste dagli ospiti scrivendo o telefonando.
 *
 * Si legge `conversation_extractions` e non `demand_calendar_days` perche' le
 * estrazioni portano con se' il canale: il calendario aggregato conserva i
 * totali per giorno, ma non da quale canale arrivavano, e la pagina divide
 * proprio per canale.
 *
 * Non si contano i NOSTRI segnaposto, che non sono domanda di date:
 *
 *   - `nessuna_domanda`: la conversazione non chiedeva date. Serve a non
 *     riesaminarla, non a gonfiare il calendario.
 *   - `chiamata`: la telefonata ha come data di riferimento il giorno in cui
 *     e' arrivata, non un soggiorno chiesto. Misurato: 40 chiamate contro 10
 *     richieste vere, cioe' il 15 agosto avrebbe mostrato 33 persone che
 *     volevano dormire il 15 agosto. Il volume delle chiamate resta, ma come
 *     misura a se' (`chiamate` in demand_calendar_days).
 *   - `formato_non_riconosciuto`: una lettura fallita e' un difetto da vedere,
 *     non una richiesta.
 *
 * L'esclusione elenca i segnaposto nostri e non gli esiti ammessi: gli esiti
 * li nomina il modello seguendo i campi del gruppo, e un elenco chiuso
 * scarterebbe in silenzio ogni esito nuovo.
 */
const NON_DEMAND_KINDS = ["nessuna_domanda", "chiamata", "formato_non_riconosciuto"]
async function demandFromConversations(
  propertyId: string,
  startDate: string,
  endDate: string,
  client?: DemandReader,
): Promise<Map<string, { count: number; sources: DemandData["sources"] }>> {
  const supabase = client ?? (await createClient())
  const result = new Map<string, { count: number; sources: DemandData["sources"] }>()

  const { data, error } = await supabase
    .from("conversation_extractions")
    .select("reference_date, kind, phone_call_id, conversations(channel)")
    .eq("property_id", propertyId)
    // Si escludono gli ESITI, non le chiamate: `chiamata` toglie il volume del
    // centralino, ma una telefonata da cui si ricava una data vera resta
    // domanda e va contata, sotto la voce "telefono".
    .not("kind", "in", `(${NON_DEMAND_KINDS.join(",")})`)
    .not("reference_date", "is", null)
    .gte("reference_date", String(startDate).slice(0, 10))
    .lte("reference_date", String(endDate).slice(0, 10))

  if (error) {
    // Si registra e si restituisce vuoto: un errore qui non deve spegnere
    // anche la parte del calendario che arriva dagli eventi del sito.
    console.error("[v0] domanda dalle conversazioni:", error.message)
    return result
  }

  for (const row of data ?? []) {
    const day = String(row.reference_date).slice(0, 10)
    if (!result.has(day)) {
      result.set(day, {
        count: 0,
        sources: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
      })
    }
    const entry = result.get(day)!
    entry.count++
    const embedded = row.conversations as { channel?: string | null } | null
    const key = row.phone_call_id ? "phone" : sourceOfChannel(embedded?.channel)
    entry.sources[key]++
  }

  return result
}

// Calcola l'intensità basata sul numero di ricerche
function calculateIntensity(count: number, maxCount: number): DemandData["intensity"] {
  const ratio = count / maxCount
  if (ratio >= 0.75) return "very_high"
  if (ratio >= 0.5) return "high"
  if (ratio >= 0.25) return "medium"
  return "low"
}

// Aggrega i dati di domanda per un periodo
export async function getDemandData(
  propertyId: string,
  startDate: string,
  endDate: string,
  client?: DemandReader,
): Promise<DemandSummary> {
  const supabase = client ?? (await createClient())

  // Query eventi di tipo "date_search" o "availability_check"
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("property_id", propertyId)
    .in("event_type", ["date_search", "availability_check", "booking_intent", "quote_request"])
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching demand events:", error)
    return {
      period: { start: startDate, end: endDate },
      totalSearches: 0,
      peakDates: [],
      bySource: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
      dailyData: [],
    }
  }

  // Mappa per aggregare per data
  const dateMap = new Map<
    string,
    {
      count: number
      sources: DemandData["sources"]
    }
  >()

  // Totali per sorgente
  const totalBySource = {
    website: 0,
    chat: 0,
    email: 0,
    whatsapp: 0,
    phone: 0,
    script: 0,
  }

  // Processa ogni evento
  for (const event of events || []) {
    const payload = event.payload as any

    // Estrai le date cercate dal payload
    const checkIn = payload?.check_in || payload?.date_start || payload?.arrival
    const checkOut = payload?.check_out || payload?.date_end || payload?.departure

    if (!checkIn) continue

    // Determina la sorgente
    const source = (payload?.source || event.event_category || "website") as keyof typeof totalBySource
    const validSource = source in totalBySource ? source : "website"

    // Incrementa totale per sorgente
    totalBySource[validSource]++

    // Aggrega per ogni data nel range
    const startDateObj = new Date(checkIn)
    const endDateObj = checkOut ? new Date(checkOut) : startDateObj

    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0]

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          count: 0,
          sources: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
        })
      }

      const entry = dateMap.get(dateKey)!
      entry.count++
      entry.sources[validSource]++
    }
  }

  // --- seconda sorgente: le date chieste scrivendo o telefonando ---
  // Si somma a quella del sito sullo stesso giorno: una data cercata sul sito
  // e chiesta anche per email e' domanda due volte, non una.
  // Si passa lo STESSO client: se qui restasse quello di sessione, un chiamante
  // a token leggerebbe zero conversazioni in silenzio.
  const fromConversations = await demandFromConversations(propertyId, startDate, endDate, supabase)
  let conversationCount = 0
  for (const [day, extra] of fromConversations) {
    conversationCount += extra.count
    if (!dateMap.has(day)) {
      dateMap.set(day, {
        count: 0,
        sources: { website: 0, chat: 0, email: 0, whatsapp: 0, phone: 0, script: 0 },
      })
    }
    const entry = dateMap.get(day)!
    entry.count += extra.count
    for (const k of Object.keys(extra.sources) as Array<keyof DemandData["sources"]>) {
      entry.sources[k] += extra.sources[k]
      totalBySource[k] += extra.sources[k]
    }
  }

  // Trova il massimo per calcolare l'intensità
  const maxCount = Math.max(1, ...Array.from(dateMap.values()).map((v) => v.count))

  // Converti in array ordinato
  const dailyData: DemandData[] = Array.from(dateMap.entries())
    .map(([date, data]) => ({
      date,
      searchCount: data.count,
      sources: data.sources,
      intensity: calculateIntensity(data.count, maxCount),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Top 5 date più cercate
  const peakDates = [...dailyData].sort((a, b) => b.searchCount - a.searchCount).slice(0, 5)

  return {
    period: { start: startDate, end: endDate },
    // Il totale comprende entrambe le sorgenti: contare solo gli eventi del
    // sito avrebbe mostrato "0 ricerche" sopra un calendario pieno di giorni.
    totalSearches: (events?.length || 0) + conversationCount,
    peakDates,
    bySource: totalBySource,
    dailyData,
  }
}

// Versione real-time per aggiornamenti
export async function getDemandDataForMonth(
  propertyId: string,
  year: number,
  month: number,
  client?: DemandReader,
): Promise<DemandSummary> {
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  return getDemandData(propertyId, startDate, endDate, client)
}
