import { streamText, convertToModelMessages, consumeStream } from "ai"
import { createClient, getAuthUser } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { measureRoute } from "@/lib/performance/with-perf"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import {
  getOperationalProductionMetrics,
  getFiscalProductionMetrics,
} from "@/lib/services/production-metrics.service"

// Allow longer streaming responses on Vercel serverless
export const maxDuration = 60

// Demo user for v0 preview (same as DashboardContent and get-settings-data)
const V0_DEMO_USER = {
  id: "5de43b7b-e661-4e4e-8177-7943df06470c",
  email: "f.mancini@4bid.it",
}

// Build system prompt based on tier and knowledge
async function buildSystemPrompt(
  tier: string,
  hotelId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userName: string | null = null
): Promise<string> {
  // 1. Get platform knowledge
  const { data: knowledge } = await supabase
    .from("platform_knowledge")
    .select("category, title, content")
    .eq("is_active", true)
    .order("category")

  const knowledgeText = (knowledge || [])
    .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
    .join("\n")

  // Build personalization section
  const userNameSection = userName 
    ? `\nL'UTENTE SI CHIAMA: ${userName}
- Usa il nome "${userName}" nelle risposte per rendere la conversazione piu personale
- Esempio: "Ciao ${userName}!", "${userName}, secondo i dati...", "Ti consiglio, ${userName}, di..."
- Non usare il nome in OGNI frase, ma usalo naturalmente all'inizio della conversazione e occasionalmente durante\n`
    : ""

  let systemPrompt = `Sei "Taddeo", l'assistente IA di SANTADDEO, la piattaforma di Revenue Management per strutture ricettive.
${userNameSection}
REGOLE FONDAMENTALI:
- Rispondi SEMPRE in italiano
- Sii professionale ma amichevole
- Se conosci il nome dell'utente, usalo per personalizzare le risposte
- IMPORTANTISSIMO: NON INVENTARE MAI dati numerici, date, percentuali o informazioni che non ti sono state fornite esplicitamente nei DATI sotto
- Se ti viene chiesto un dato che NON hai nei DATI forniti, rispondi: "Non ho questo dato disponibile al momento. Per un'analisi approfondita, ti consiglio di consultare la sezione specifica della dashboard o di richiedere supporto a un esperto di Revenue Management."
- Quando rispondi con dati numerici, cita SEMPRE la fonte (es: "Secondo i dati del mese corrente...")
- Nel dubbio, suggerisci SEMPRE di inoltrare la richiesta a un esperto di Revenue Management
- Fornisci consigli pratici e actionable basati SOLO sui dati reali disponibili

MODALITÀ STRETTA SUI NUMERI (FONDAMENTALE):
Quando l'utente chiede uno specifico KPI (ADR, RevPAR, RevPOR, occupazione, ecc.):
1. Cerca la riga ESATTA corrispondente nella sezione "KPI AGGREGATI" più sotto.
2. Cita il valore LETTERALMENTE come è scritto in quella riga, senza riscriverlo a memoria.
3. NON usare lo stesso valore per due metriche diverse: ADR, RevPAR e RevPOR sono SEMPRE numeri diversi tranne casi rarissimi.
4. Se la riga riporta "N/D" o "non disponibile", rispondi onestamente che il dato non è presente nel periodo e indica all'utente la pagina /dati o /dashboard per consultarlo.
5. Se l'utente ti contesta un numero che hai appena dato, NON confermarlo per inerzia: rileggi la riga e ammetti l'eventuale errore.
6. INCOERENZA DATI: se nella sezione "KPI AGGREGATI" trovi un blocco "[ATTENZIONE INCOERENZA DATI - REGOLA OBBLIGATORIA PER LA TUA RISPOSTA]", devi rispettarlo ALLA LETTERA: segnala l'incoerenza all'utente con i numeri esatti, NON formulare giudizi operativi ("stiamo andando bene", "occupazione solida", "RevPOR elevato") sui conteggi camere, suggerisci verifica della pagina /dati e del supporto tecnico per controllo ETL. Le metriche PMS medie restano utilizzabili come indicazione generale ma devi chiarirlo. Questa regola ha priorita' sulle altre risposte di default.
7. COERENZA INTERNA DEI NUMERI: prima di dare risposte tipo "Camere disponibili 241 e vendute 47" ricordati che 47/241 = 19,5%, mentre l'occupazione PMS potrebbe dire qualcos'altro. Se vedi due numeri che non possono stare insieme, segnala l'incoerenza invece di citarli entrambi come fatti.

DEFINIZIONI ESATTE DELLE METRICHE (rispetta queste differenze):
- ADR (Average Daily Rate) = ricavi camere / camere VENDUTE. Indica il prezzo medio per camera venduta.
- RevPAR (Revenue per Available Room) = ricavi camere / camere DISPONIBILI. Sempre <= ADR quando occupazione < 100%.
- RevPOR (Revenue per Occupied Room) = ricavi TOTALI (camere + servizi extra) / camere VENDUTE. Sempre >= ADR perché include extra.
- Occupazione = (camere vendute / camere disponibili) * 100.

REGOLA UNICA RevPOR: nel prompt riceverai UN solo valore RevPOR ufficiale, etichettato con la sua formula esatta. NON ricalcolarlo dividendo a mente altri numeri (es. "Revenue camere" / "Camere vendute"): il helper applica filtri source-safety che la divisione manuale non replica e produce un valore diverso. Cita SOLO il valore RevPOR mostrato nella riga "RevPOR operativo" della sezione "METRICHE OPERATIVE PMS".

REGOLA COPERTURA DATI: prima di qualsiasi giudizio operativo, leggi la sezione "[COPERTURA DATI]" del prompt. Se lo stato e' "BASSA" o "PARZIALE", segui le REGOLE STRINGENTI del blocco "[COPERTURA DATI <SEVERITY>]" e NON dare giudizi mensili, NON suggerire aumenti tariffari, NON confrontare con l'obiettivo mensile come se il periodo fosse completo.

REGOLA LINGUAGGIO PROFESSIONALE (NON DEROGABILE - pubblicita' del prodotto):
Santaddeo si presenta all'utente come prodotto affidabile. Quando la copertura dati e' parziale o sono presenti incoerenze tecniche interne, NON esporli MAI all'utente. In particolare e' VIETATO usare le seguenti parole/espressioni nelle tue risposte:
- "ETL", "pipeline", "source", "sorgente", "tabella", "scidoo_raw", "scidoo_fiscal", "gsheets"
- "dati sporchi", "dati non affidabili", "dati incoerenti", "dati non attendibili", "dati corrotti"
- "problema tecnico", "verifica tecnica della pipeline", "controllo ETL", "supporto tecnico"
- "i dati non sono affidabili", "non posso darti un giudizio affidabile", "il sistema ha un problema"
- "incoerenza ETL", "errore di sincronizzazione", "errore di import"
Quando devi comunicare una copertura parziale, usa SEMPRE linguaggio neutro e professionale:
- "Sto considerando i dati consolidati disponibili al momento"
- "Il quadro mensile e' ancora in aggiornamento"
- "Per una valutazione completa posso attivare una verifica con il supporto incluso nel tuo piano"
- "Aggiorno il quadro mano a mano che i dati si consolidano"
Se l'utente ha un piano con supporto umano incluso (vedi sezione PIANO UTENTE), proponi il supporto come servizio gia' incluso, NON come upsell. Non suggerire MAI di "attivare il Piano Accelerator" se l'utente ha gia' un piano superiore.

QUANDO NON HAI IL DATO RICHIESTO:
Se l'utente chiede informazioni che non hai nei dati forniti (es: tariffe future, previsioni, dati di mesi non inclusi, confronti con competitor), rispondi onestamente che non hai quel dato specifico e suggerisci:
1. Di consultare la sezione appropriata della dashboard (es: /dati, /dati/objectives, /accelerator/pricing)
2. Di richiedere supporto a un esperto Revenue (per piani Advanced)

KNOWLEDGE BASE DELLA PIATTAFORMA:
${knowledgeText}
`

  // 2. For Standard and Advanced: add hotel-specific data
  if (tier === "standard" || tier === "advanced") {
    // Calculate date range for queries
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0]

    // Get hotel info (no "category" column in hotels table)
    const { data: hotel } = await supabase
      .from("hotels")
      .select("name, total_rooms, city, star_rating")
      .eq("id", hotelId)
      .single()

    if (hotel) {
      systemPrompt += `\nDATI DELLA STRUTTURA:
- Nome: ${hotel.name}
- Camere totali: ${hotel.total_rooms || "N/D"}
- Citta: ${hotel.city || "N/D"}
- Stelle: ${hotel.star_rating || "N/D"}
`
    }

    // PIANO UTENTE: serve al modello per scegliere il giusto linguaggio di supporto
    // (proporre supporto come INCLUSO se gia' attivo, MAI come upsell aggressivo).
    // Gerarchia piani Santaddeo:
    // - free:     NON e' collegato ai dati della struttura, quindi non puo' ricevere
    //             feedback/consigli sui KPI. Va invitato ad attivare il piano Standard.
    // - standard: collega l'IA ai dati della propria struttura -> feedback e consigli
    //             sui KPI. Puo' richiedere il modulo Advanced per il supporto umano dei
    //             Revenue Manager Santaddeo.
    // - advanced: include supporto umano dedicato dei Revenue Manager Santaddeo
    //             (incluso di default nei piani di consulenza a commissione, oppure
    //             attivabile come modulo aggiuntivo da chi e' su Standard).
    const planSupport =
      tier === "advanced"
        ? "Il piano dell'utente include il supporto umano dedicato dei Revenue Manager Santaddeo. Quando proponi una verifica o un approfondimento, presentalo come servizio GIA' INCLUSO nel piano (es: \"Posso inoltrare la domanda al team di Revenue Manager Santaddeo, e' incluso nel tuo piano\"). NON suggerire MAI upgrade ad altri piani: l'utente ha gia' il livello massimo."
        : tier === "standard"
          ? "L'IA dell'utente e' collegata ai dati della struttura, quindi puoi dare feedback e consigli sui KPI. Il piano include analisi avanzate. Se l'utente chiede un confronto/verifica umana, puoi indicare in modo neutro che il modulo Advanced consente di inoltrare i quesiti al team di Revenue Manager Santaddeo per una risposta dedicata. NON essere pressante: menzionalo solo se rilevante alla domanda."
          : "L'utente e' sul piano free: l'IA NON e' collegata ai dati della struttura, quindi non puoi dare feedback/consigli specifici sui suoi KPI. Quando la domanda richiede dati interni, spiega in modo trasparente che per ricevere consigli legati alla propria struttura serve attivare il piano Standard (che collega l'IA ai dati della struttura e permette feedback personalizzati). Menzionalo come informazione utile, non come spinta commerciale aggressiva."
    systemPrompt += `\nPIANO UTENTE: ${planSupport}\n`

    // Use current month for KPI data (same as dashboard)
    const today = new Date()
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const startDateStr = currentMonthStart.toISOString().split("T")[0]
    const endDateStr = today.toISOString().split("T")[0] // Up to today, not future
    const monthName = currentMonthStart.toLocaleDateString("it-IT", { month: "long", year: "numeric" })

    // ---- KPI aggregati mese corrente (allineato con dashboard) ----
    //
    // FIX 13/05/2026 (bonifica architetturale PMS-agnostic):
    // sostituito il blocco inline che leggeva direttamente `daily_production`
    // con due chiamate al nuovo helper centralizzato
    // `lib/services/production-metrics.service.ts`. L'helper:
    //   1. Filtra per source in modo ufficiale (OPERATIONAL_SOURCES vs
    //      FISCAL_SOURCES vs RELIABLE_OPERATIONAL_SOURCES_FOR_ROOM_COUNTS).
    //   2. Restituisce metriche operative e fiscali SEPARATE, mai mescolate.
    //   3. Applica un validation guard centralizzato (data_quality) che
    //      segnala incoerenze (es. occupazione PMS vs derivata > 2pp).
    //
    // Per i precedenti incident vedi memoria utente:
    //   - "Taddeo inventa ADR=94.54 a Barronci" (12/05/2026)
    //   - "RevMentor numeri incoerenti - source mista daily_production" (12/05/2026 notte)
    try {
      const [operational, fiscal] = await Promise.all([
        getOperationalProductionMetrics(supabase, {
          hotelId,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
        getFiscalProductionMetrics(supabase, {
          hotelId,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
      ])

      console.log("[ai-chat-kpi]", {
        hotel_id: hotelId,
        period: `${startDateStr}..${endDateStr}`,
        period_days: operational.period_days,
        days_operational: operational.days_with_operational_data,
        days_reliable_counts: operational.days_with_reliable_room_counts,
        operational_coverage_percent: operational.operational_coverage_percent,
        reliable_coverage_percent: operational.reliable_room_count_coverage_percent,
        days_fiscal: fiscal.days_with_fiscal_data,
        occupancy_pms: operational.occupancy_pms,
        occupancy_derived: operational.occupancy_derived,
        revpor: operational.revpor,
        revpor_definition: operational.revpor_definition,
        data_quality: operational.data_quality.status,
        data_quality_reason: operational.data_quality.reason,
      })

      const fmt = (v: number | null) =>
        v === null ? "N/D (non disponibile per questo periodo)" : v.toFixed(2)
      const fmtPct = (v: number | null) =>
        v === null ? "N/D (non disponibile per questo periodo)" : `${v.toFixed(2)}%`
      const fmtInt = (v: number | null) =>
        v === null ? "N/D" : String(Math.round(v))
      const coverageBadge =
        operational.reliable_room_count_coverage_percent >= 70
          ? "OK"
          : operational.reliable_room_count_coverage_percent >= 30
            ? "PARZIALE"
            : "BASSA"

      systemPrompt += `\nKPI AGGREGATI (${monthName}, fonte: tabelle normalizzate Santaddeo via helper centralizzato).

[COPERTURA DATI - SEZIONE INTERNA, NON RIPETERE QUESTI DETTAGLI ALL'UTENTE]
Questa sezione e' un'indicazione tecnica per te (il modello). NON citare percentuali di copertura, ne' i nomi delle metriche di copertura, ne' le soglie all'utente: usa il linguaggio professionale descritto in REGOLA LINGUAGGIO PROFESSIONALE.
- Periodo richiesto: ${startDateStr} → ${endDateStr} (${operational.period_days} giorni totali nel periodo)
- Giorni con dati operativi consolidati: ${operational.days_with_operational_data}/${operational.period_days}
- Giorni con conteggi camera consolidati: ${operational.days_with_reliable_room_counts}/${operational.period_days}
- Stato (uso interno): ${coverageBadge} (soglie interne: <30%=ERROR, 30-70%=WARNING, >=70%=OK)

[METRICHE OPERATIVE PMS - su ${operational.days_with_operational_data} giorni]
- Occupazione media PMS: ${fmtPct(operational.occupancy_pms)}
- ADR (Average Daily Rate = ricavi camera / camere VENDUTE): ${fmt(operational.adr)} EUR
- RevPAR (Revenue per Available Room = ricavi camera / camere DISPONIBILI): ${fmt(operational.revpar)} EUR
- RevPOR operativo (UNICO valore ufficiale, formula: ${operational.revpor_definition}): ${fmt(operational.revpor)} EUR
- Revenue camere operativo (somma su righe operative): ${fmt(operational.room_revenue)} EUR

[CONTEGGI CAMERA - solo giorni affidabili (${operational.days_with_reliable_room_counts}/${operational.period_days})]
- Capacita totale (camere x giorni affidabili): ${fmtInt(operational.total_rooms_capacity)}
- Camere vendute totali: ${fmtInt(operational.rooms_sold)}
- Camere libere residue (somma giornaliera): ${fmtInt(operational.rooms_available)}
- Occupazione derivata (rooms_sold / capacity * 100): ${fmtPct(operational.occupancy_derived)}

[PRODUZIONE FISCALE - SEPARATA, mai sommare con il revenue camere operativo]
- Revenue fiscale: ${fmt(fiscal.fiscal_revenue)} EUR (${fiscal.days_with_fiscal_data} giorni)
- Stato: ${fiscal.data_quality.status}
`

      // Validation guard centralizzato: il helper ha gia' applicato la priorita'
      // low_data_coverage > occupancy_mismatch > ok. Qui traduciamo lo stato in
      // un blocco di istruzioni STRINGENTI per il modello.
      const dq = operational.data_quality
      // Frase di supporto tier-aware: proposta SEMPRE in chiave di servizio
      // gia' incluso (advanced), modulo attivabile (standard), o invito ad
      // attivare standard (free). MAI upsell aggressivo.
      const supportPhrase =
        tier === "advanced"
          ? "Posso inoltrare la domanda al team di Revenue Manager Santaddeo, e' incluso nel tuo piano: ti faranno avere una risposta dedicata nel minor tempo possibile."
          : tier === "standard"
            ? "Se vuoi una conferma da un Revenue Manager Santaddeo, con il modulo Advanced posso inoltrare il quesito al team e ricevere una risposta dedicata."
            : "Per ricevere consigli legati ai dati della tua struttura serve attivare il piano Standard, che collega l'IA ai tuoi numeri reali e permette feedback personalizzati."

      if (dq.reason === "low_data_coverage") {
        const details = (dq.details ?? {}) as Record<string, number>
        const daysReliable = Number(details.days_with_reliable_room_counts ?? 0)
        const periodDays = Number(details.period_days ?? 0)
        const severity = dq.status === "error" ? "ERROR" : "WARNING"
        systemPrompt += `
[COPERTURA DATI ${severity} - LINEE GUIDA OBBLIGATORIE PER LA TUA RISPOSTA]
Il quadro mensile non e' ancora completo. Devi rispondere in modo professionale usando SOLO i dati gia' consolidati.

VIETATO ASSOLUTAMENTE (PUBBLICITA' NEGATIVA AL PRODOTTO):
1. Non dire "dati non affidabili", "dati non attendibili", "non posso darti un giudizio affidabile", "i dati sono sporchi/incoerenti".
2. Non nominare termini tecnici interni: "ETL", "pipeline", "source", "tabella", "sincronizzazione", "import", "controllo tecnico".
3. Non scaricare sull'utente problemi interni. Non dire "verifica la pipeline", "controlla l'ETL", "i dati vanno allineati".
4. Non citare percentuali di copertura, soglie tecniche, conteggi giornalieri di "giorni affidabili".

VIETATO sui giudizi operativi (perche' il quadro non e' completo):
5. Non dire "stiamo andando bene", "performance solida", "KPI verdi", "capacita residua limitata", o frasi simili che implicano una valutazione del MESE INTERO.
6. Non suggerire aumenti tariffari, restrizioni MLOS, chiusure canali, non-refundable, spinta canale diretto, basandoti sui giorni consolidati come se fossero il mese intero.
7. Non confrontare direttamente il revenue parziale con l'obiettivo mensile come se il periodo fosse completo.
8. Non parlare di "capacita residua del mese" o estrapolare i conteggi al mese intero.

COSA DEVI FARE (LINGUAGGIO PROFESSIONALE):
- Apri con il nome dell'utente se lo conosci.
- Cita i numeri del periodo consolidato (camere vendute, occupazione, ADR, RevPAR, revenue camere) in modo descrittivo come fotografia dei giorni gia' confermati, NON come performance dell'intero mese.
- Usa frasi del tipo: "sui dati consolidati disponibili al momento", "nei giorni gia' aggiornati", "il quadro completo del mese e' ancora in aggiornamento".
- Proponi il supporto come servizio incluso (vedi PIANO UTENTE): "${supportPhrase}".
- Concludi senza dare consigli tariffari aggressivi.

ESEMPIO DI RISPOSTA CORRETTA (adatta il tono ma rispetta la sostanza e i numeri):
"Filippo, sui dati consolidati disponibili al momento vedo una performance molto forte: ${operational.rooms_sold ?? 'N/D'} camere vendute su ${operational.total_rooms_capacity ?? 'N/D'} disponibili nei giorni gia' aggiornati, con occupazione ${fmtPct(operational.occupancy_pms)}, ADR ${fmt(operational.adr)} EUR, RevPAR ${fmt(operational.revpar)} EUR e revenue camere ${fmt(operational.room_revenue)} EUR. Per darti una valutazione completa dell'intero mese preferisco aspettare che il quadro si consolidi. ${supportPhrase}"
`
      } else if (dq.status === "warning" && dq.reason === "occupancy_mismatch") {
        systemPrompt += `
[QUADRO IN AGGIORNAMENTO - LINEE GUIDA OBBLIGATORIE PER LA TUA RISPOSTA]
Le metriche del periodo non sono ancora del tutto allineate fra loro. Devi rispondere in modo professionale e neutro.

VIETATO ASSOLUTAMENTE:
- Non nominare termini tecnici interni: "ETL", "pipeline", "source", "controllo tecnico", "incoerenza dati", "errore di sincronizzazione".
- Non dire "dati non affidabili", "dati incoerenti", "rilevo un'incoerenza".
- Non scaricare sull'utente problemi interni.

COSA DEVI FARE:
- Cita le metriche PMS (ADR, RevPAR, RevPOR, Occupazione media) come indicazione generale del periodo.
- Evita di dare giudizi netti sulla performance del mese.
- Usa frasi tipo: "sui dati consolidati disponibili al momento", "il quadro mensile e' ancora in aggiornamento".
- Proponi il supporto come servizio incluso: "${supportPhrase}".
`
      } else if (dq.status === "warning" && dq.reason === "no_reliable_room_counts") {
        systemPrompt += `
[QUADRO IN AGGIORNAMENTO - conteggi camera non ancora consolidati]
Per questo periodo i conteggi camera non sono ancora consolidati. Usa SOLO le metriche PMS aggregate (ADR, RevPAR, RevPOR, Occupazione media PMS) come fotografia generale. Non parlare di "capacita", "camere vendute totali", "camere libere". Non nominare termini tecnici interni (ETL, pipeline, source). Se l'utente chiede un dettaglio sui conteggi, rispondi che il quadro e' ancora in aggiornamento e proponi: "${supportPhrase}".
`
      } else if (dq.status === "ok") {
        const details = (dq.details ?? {}) as Record<string, number>
        const mismatchPp = Number(details.mismatch_pp ?? 0)
        systemPrompt += `
[Dati camere coerenti] Differenza occupazione PMS vs derivata: ${mismatchPp.toFixed(2)}pp (entro la tolleranza di 2pp). Puoi usare entrambi i blocchi nei tuoi ragionamenti operativi.
`
      } else if (dq.status === "not_available") {
        systemPrompt += `
[QUADRO IN AGGIORNAMENTO - dati non ancora disponibili per il periodo]
Per il periodo richiesto non ho ancora dati consolidati. Rispondi in modo professionale: "Sto ancora consolidando i dati del periodo richiesto, dammi un attimo o riprova tra poco. ${supportPhrase}". NON nominare ETL, pipeline, source, errori tecnici.
`
      }

      systemPrompt += `
PROMEMORIA - REGOLE NON DEROGABILI:
1. I tre indicatori (ADR, RevPAR, RevPOR) sono SEMPRE numeri diversi tra loro. Quando l'utente ti chiede uno specifico KPI, cita ESATTAMENTE il valore della riga corrispondente.
2. RevPOR HA UN SOLO VALORE UFFICIALE: quello mostrato nella sezione "METRICHE OPERATIVE PMS" sopra, calcolato come ${operational.revpor_definition} dal helper centralizzato. NON ricalcolare RevPOR autonomamente dividendo revenue/camere prese da altre sezioni del prompt (es. "Revenue camere" / "Camere vendute"): il helper applica filtri source-safety che la divisione manuale non replica. Se citi RevPOR, cita SOLO il valore ${operational.revpor === null ? "N/D" : operational.revpor.toFixed(2) + " EUR"}.
3. Se un valore e' "N/D", rispondi che non e' disponibile e indica /dati. NON inventare numeri sostituti.
4. NON sommare mai "Revenue camere operativo" con "Revenue fiscale": sono dati separati e mescolarli e' un errore.
5. Se la sezione "[COPERTURA DATI ...]" segnala uno stato non-OK, applica le linee guida del blocco corrispondente e NON dare giudizi mensili netti.
6. LINGUAGGIO: usa SEMPRE tono professionale. Vietate parole/espressioni: "ETL", "pipeline", "source", "tabella", "sincronizzazione", "import", "dati sporchi", "dati non affidabili", "dati incoerenti", "dati non attendibili", "verifica tecnica", "controllo ETL", "supporto tecnico", "incoerenza dati", "errore di sincronizzazione", "non posso darti un giudizio affidabile", "problema tecnico". Sostituisci con: "sto considerando i dati consolidati disponibili al momento", "il quadro mensile e' ancora in aggiornamento", "posso aprire una verifica" (e simili).
7. SUPPORTO: proponi il supporto umano SOLO come servizio gia' incluso nel piano dell'utente (vedi sezione PIANO UTENTE). MAI come upsell. MAI suggerire l'attivazione di un piano che l'utente ha gia' (Accelerator/Advanced).
`
    } catch (kpiError) {
      console.error("[AI Chat] KPI fetch error:", kpiError)
    }

    // ---- Prenotazioni e cancellazioni (query generica, non PMS-specifica) ----
    // Identifica la tabella raw bookings corretta per l'hotel
    const { data: connector } = await supabase
      .from("pms_integrations")
      .select("pms_type")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    // Determina tabella raw bookings in base al connettore
    const rawBookingsTable = connector?.pms_type === "scidoo"
      ? "scidoo_raw_bookings"
      : "scidoo_raw_bookings" // fallback per ora, nuovi connettori avranno le loro tabelle

    const { data: recentBookings } = await supabase
      .from(rawBookingsTable)
      .select("status, checkin_date, checkout_date, total_amount, channel, booking_date")
      .eq("hotel_id", hotelId)
      .gte("booking_date", thirtyDaysAgoStr)

    if (recentBookings && recentBookings.length > 0) {
      const totalBookings = recentBookings.length
      const activeBookings = recentBookings.filter((b) => b.status !== "annullata").length
      const cancelledBookings = totalBookings - activeBookings
      const cancellationRate = totalBookings > 0 ? ((cancelledBookings / totalBookings) * 100).toFixed(1) : "0"
      const totalRevenue = recentBookings
        .filter((b) => b.status !== "annullata")
        .reduce((sum, b) => sum + Number(b.total_amount || 0), 0)

      // Analisi canali di vendita
      const channelBreakdown: Record<string, number> = {}
      recentBookings.filter((b) => b.status !== "annullata").forEach((b) => {
        const ch = b.channel || "Diretto"
        channelBreakdown[ch] = (channelBreakdown[ch] || 0) + 1
      })
      const channelText = Object.entries(channelBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([ch, count]) => `  ${ch}: ${count} (${((count / activeBookings) * 100).toFixed(0)}%)`)
        .join("\n")

      systemPrompt += `\nPRENOTAZIONI (ultimi 30 giorni):
- Totale prenotazioni: ${totalBookings}
- Attive: ${activeBookings}
- Cancellate: ${cancelledBookings}
- Tasso cancellazione: ${cancellationRate}%
- Revenue totale prenotazioni attive: ${totalRevenue.toFixed(2)} EUR
- Canali di vendita:
${channelText}
`
    }

    // ---- Soglie KPI configurate ----
    const { data: kpis } = await supabase
      .from("kpi_thresholds")
      .select("metric_key, display_name, green_min, green_max, orange_min, red_min, is_inverted")
      .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
      .order("metric_key")

    if (kpis && kpis.length > 0) {
      const kpiText = kpis
        .map((k) => `- ${k.display_name || k.metric_key}: Verde >= ${k.green_min}, Arancione >= ${k.orange_min}, Rosso < ${k.orange_min}`)
        .join("\n")
      systemPrompt += `\nSOGLIE KPI CONFIGURATE:\n${kpiText}\n`
    }

    // ---- Storico metriche per trend ----
    const { data: metricsHistory } = await supabase
      .from("rms_metrics_history")
      .select("metric_key, metric_value, recorded_date")
      .eq("hotel_id", hotelId)
      .gte("recorded_date", thirtyDaysAgoStr)
      .order("recorded_date", { ascending: false })
      .limit(100)

    if (metricsHistory && metricsHistory.length > 0) {
      // Raggruppa per metrica
      const metricGroups: Record<string, { values: number[]; latest: number }> = {}
      metricsHistory.forEach((m) => {
        if (!metricGroups[m.metric_key]) {
          metricGroups[m.metric_key] = { values: [], latest: m.metric_value }
        }
        metricGroups[m.metric_key].values.push(m.metric_value)
      })

      const trendsText = Object.entries(metricGroups)
        .map(([key, data]) => {
          const avg = data.values.reduce((s, v) => s + v, 0) / data.values.length
          return `- ${key}: ultimo valore ${data.latest.toFixed(2)}, media periodo ${avg.toFixed(2)}`
        })
        .join("\n")

      systemPrompt += `\nTREND METRICHE (ultimi 30 giorni):\n${trendsText}\n`
    }

    // ---- Obiettivi mensili (dalla pagina /dati/objectives) ----
    //
    // FIX 12/05/2026 (incident "Taddeo dice 'non ho accesso alla pagina
    // obiettivi'"): la query precedente puntava a `hotel_objectives` ma la
    // tabella reale è `revenue_objectives`. Il select ritornava errore
    // silenziato → `objectives` era null → l'intero blocco non veniva mai
    // aggiunto al prompt → il bot rispondeva onestamente "non ho accesso".
    //
    // Inoltre la tabella reale ha SOLO due campi: `obiettivo_produzione`
    // (target ricavi in EUR) e `percentuale_invenduto_previsionale`. Non
    // esistono obiettivo_occupazione e obiettivo_adr, ma li deriviamo:
    //   - obiettivo_occupazione = 100 - percentuale_invenduto_previsionale
    //
    // Includiamo SEMPRE la sezione, anche quando vuota, così il modello sa
    // che l'utente ha la pagina /dati/objectives e non inventa risposte tipo
    // "non ho accesso".
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1
    const { data: objectives, error: objError } = await supabase
      .from("revenue_objectives")
      .select("month, obiettivo_produzione, percentuale_invenduto_previsionale")
      .eq("hotel_id", hotelId)
      .eq("year", currentYear)
      .order("month", { ascending: true })

    if (objError) {
      console.error("[AI Chat] revenue_objectives fetch error:", objError)
    }

    systemPrompt += `\nOBIETTIVI MENSILI ANNO ${currentYear} (pagina applicativa: /dati/objectives):\n`
    if (objectives && objectives.length > 0) {
      const currentObj = objectives.find((o) => o.month === currentMonth)
      const upcoming = objectives.filter(
        (o) => o.month >= currentMonth && o.month <= currentMonth + 2,
      )
      if (currentObj) {
        const occupTarget = currentObj.percentuale_invenduto_previsionale != null
          ? (100 - Number(currentObj.percentuale_invenduto_previsionale)).toFixed(2)
          : "N/D"
        systemPrompt += `OBIETTIVO MESE CORRENTE (${monthName}):
- Produzione target (ricavi): ${Number(currentObj.obiettivo_produzione || 0).toFixed(0)} EUR
- Occupazione target derivata: ${occupTarget}% (= 100% - invenduto previsionale ${Number(currentObj.percentuale_invenduto_previsionale || 0).toFixed(2)}%)
`
      } else {
        systemPrompt += `- Per il mese corrente (${monthName}) non risulta configurato un obiettivo specifico.\n`
      }
      if (upcoming.length > 0) {
        systemPrompt += `\nProssimi mesi disponibili:\n`
        for (const o of upcoming) {
          const mn = new Date(currentYear, o.month - 1).toLocaleDateString("it-IT", { month: "long" })
          const occ = o.percentuale_invenduto_previsionale != null
            ? (100 - Number(o.percentuale_invenduto_previsionale)).toFixed(2)
            : "N/D"
          systemPrompt += `- ${mn}: Produzione target ${Number(o.obiettivo_produzione || 0).toFixed(0)} EUR, Occupazione target ${occ}%\n`
        }
      }
    } else {
      systemPrompt += `- Nessun obiettivo configurato per ${currentYear}. L'utente può impostarli dalla pagina /dati/objectives della piattaforma.\n`
    }

    // ---- Tariffe attuali (dalla pagina Prezzi) ----
    const todayStr = new Date().toISOString().split("T")[0]
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = nextWeek.toISOString().split("T")[0]

    const { data: currentRates } = await supabase
      .from("rms_availability_daily")
      .select("date, room_type_id, selling_price, rooms_available")
      .eq("hotel_id", hotelId)
      .gte("date", todayStr)
      .lte("date", nextWeekStr)
      .order("date", { ascending: true })

    if (currentRates && currentRates.length > 0) {
      // Raggruppa per data
      const ratesByDate = new Map<string, { minPrice: number; maxPrice: number; avgPrice: number; count: number }>()
      for (const rate of currentRates) {
        const price = Number(rate.selling_price) || 0
        if (price <= 0) continue
        
        const existing = ratesByDate.get(rate.date)
        if (existing) {
          existing.minPrice = Math.min(existing.minPrice, price)
          existing.maxPrice = Math.max(existing.maxPrice, price)
          existing.avgPrice = (existing.avgPrice * existing.count + price) / (existing.count + 1)
          existing.count++
        } else {
          ratesByDate.set(rate.date, { minPrice: price, maxPrice: price, avgPrice: price, count: 1 })
        }
      }

      const ratesText = Array.from(ratesByDate.entries())
        .slice(0, 7)
        .map(([date, data]) => {
          const dayName = new Date(date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })
          return `- ${dayName}: ${data.minPrice.toFixed(0)}-${data.maxPrice.toFixed(0)} EUR (media ${data.avgPrice.toFixed(0)} EUR)`
        })
        .join("\n")

      systemPrompt += `\nTARIFFE PROSSIMI GIORNI:\n${ratesText}\n`
    }

    const pmsTypeLabel = connector?.pms_type || "non specificato"
    systemPrompt += `\nIMPORTANTE: I dati sopra sono gli UNICI dati reali disponibili, provenienti dal PMS collegato (${pmsTypeLabel}). 
NON inventare altri dati. Se l'utente chiede informazioni non presenti nei dati sopra, rispondi che non hai quel dato specifico.
Puoi analizzare i dati forniti, suggerire strategie di pricing basate su di essi, e dare consigli personalizzati, ma SOLO basandoti sui dati reali qui sopra.`
  }

  // 3. For Advanced: add forwarding instructions
  if (tier === "advanced") {
    systemPrompt += `\n\nSei al livello ADVANCED. IMPORTANTE: In questi casi, suggerisci SEMPRE di inoltrare la conversazione a un esperto di Revenue Management:
- L'utente chiede consulenze strategiche complesse (pricing multi-canale, yield management avanzato, etc.)
- L'utente chiede previsioni a lungo termine o analisi di mercato
- Non sei sicuro della risposta o i dati non sono sufficienti
- L'utente sembra insoddisfatto delle risposte automatiche
- L'utente chiede esplicitamente di parlare con un esperto

Quando suggerisci l'inoltro, spiega brevemente perche e termina il messaggio con la riga: [FORWARD_TO_EXPERT]

Esempio: "Per una strategia di pricing cosi complessa, ti consiglio di parlare con uno dei nostri esperti di Revenue Management che potra analizzare nel dettaglio la tua situazione. [FORWARD_TO_EXPERT]"`
  }

  // For Standard tier: suggest Advanced for expert features
  if (tier === "standard") {
    systemPrompt += `\n\nSei al livello STANDARD. Se l'utente chiede funzionalita avanzate come l'inoltro a un esperto di Revenue Management o consulenze personalizzate approfondite, spiega che queste funzionalita sono disponibili nel piano Premium Expert e includi SEMPRE il link per l'upgrade: [Attiva Premium Expert](/upgrade/premium-expert)`
  }

  // For Free tier: limit scope and suggest upgrade
  if (tier === "free") {
    systemPrompt += `\nSei al livello FREE. Puoi dare consigli generali sulla piattaforma e sul revenue management, ma NON hai accesso ai dati specifici della struttura. 

IMPORTANTE: Se l'utente chiede:
- Analisi dei propri dati (occupazione, revenue, ADR, RevPAR, etc.)
- Previsioni o trend specifici della struttura
- Consigli personalizzati basati sui dati
- Qualsiasi informazione che richieda accesso ai dati dell'hotel

Rispondi spiegando che queste funzionalita richiedono il piano Accelerator e includi SEMPRE il link per l'upgrade in formato Markdown: [Attiva Accelerator](/upgrade/hotel-accelerator)

Esempio di risposta: "Per accedere ai dati della tua struttura e ricevere analisi personalizzate, e necessario attivare il piano Accelerator. [Scopri Accelerator](/upgrade/hotel-accelerator)"`
  }

  return systemPrompt
}

 async function _POST(request: NextRequest) {
  try {
    // DEV MODE bypass: Use demo user in v0 preview/development
    const isV0Preview = await isDevAuthAsync()
    let user: { id: string; email: string } | null = null

    if (isV0Preview) {
      user = V0_DEMO_USER
    } else {
      const authClient = await createClient()
      const authUser = await getAuthUser(authClient)
      user = authUser ? { id: authUser.id, email: authUser.email || "" } : null
    }

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    const supabase = await createClient()
    
    let body: any
    try {
      body = await request.json()
    } catch (parseErr) {
      console.error("[ai-chat] Body parse error:", parseErr)
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 })
    }
    
    const { messages, hotelId, sessionId, tier: clientTier = "free" } = body

    if (!hotelId) {
      return new Response(JSON.stringify({ error: "hotelId required" }), { status: 400 })
    }

    // Verify user has access to this hotel via organization_id and get user name
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organization_id, first_name, last_name")
      .eq("id", user.id)
      .single()

    // Get user's first name for personalized responses
    const userName = profile?.first_name || null

    const isSuperAdmin = profile?.role === "super_admin"

    // In DEV MODE (v0 preview), skip hotel access check for impersonation
    if (!isSuperAdmin && !isV0Preview) {
      const { data: hotel } = await supabase
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .single()

      if (!hotel || hotel.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "No access to this hotel" }), { status: 403 })
      }
    }

    // Determine tier SERVER-SIDE from DB - never trust client
    // 1. Check manual override by superadmin
    const { data: tierConfig } = await supabase
      .from("chat_tier_config")
      .select("tier")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    let tier = tierConfig?.tier || "free"

    // 2. If no manual config, check if hotel has active Accelerator subscription -> standard
    if (!tierConfig) {
      const { data: subscription } = await supabase
        .from("accelerator_subscriptions")
        .select("id")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .maybeSingle()

      if (subscription) {
        tier = "standard"
      }
    }

    // 3. Check if hotel has active premium_expert addon -> advanced
    const { data: addon } = await supabase
      .from("addon_subscriptions")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("addon_type", "premium_expert")
      .eq("status", "active")
      .maybeSingle()

    if (addon) {
      tier = "advanced"
    }

    // Build system prompt with user name for personalization
    const systemPrompt = await buildSystemPrompt(tier, hotelId, supabase, userName)

    // Save or update session
    let currentSessionId = sessionId
    if (!currentSessionId) {
      // Extract first user message for title
      const firstUserMsg = messages?.find((m: { role: string }) => m.role === "user")
      const title = firstUserMsg
        ? (typeof firstUserMsg.content === "string"
            ? firstUserMsg.content
            : firstUserMsg.parts?.find((p: { type: string }) => p.type === "text")?.text || "Nuova conversazione"
          ).slice(0, 100)
        : "Nuova conversazione"

      const { data: session } = await supabase
        .from("chat_sessions")
        .insert({
          hotel_id: hotelId,
          user_id: user.id,
          title,
          tier,
        })
        .select("id")
        .single()

      currentSessionId = session?.id
    }

    // Save user message
    const lastMessage = messages?.[messages.length - 1]
    if (lastMessage && currentSessionId) {
      const userContent =
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : lastMessage.parts?.find((p: { type: string }) => p.type === "text")?.text || ""

      if (userContent && lastMessage.role === "user") {
        await supabase.from("chat_messages").insert({
          session_id: currentSessionId,
          role: "user",
          content: userContent,
        })
      }
    }

    // Convert messages for the model
    const modelMessages = messages?.length
      ? await convertToModelMessages(messages)
      : []

    // Stream response with proper Vercel serverless handling
    // FIX 12/05/2026: bumpato da gpt-4o-mini → gpt-5-mini per ridurre le
    // hallucination su metriche (incident "Taddeo confonde ADR/RevPOR a
    // Barronci"). gpt-5-mini è zero-config sul Vercel AI Gateway con i
    // crediti OpenAI default — nessun nuovo API key richiesto.
    const result = streamText({
      model: "openai/gpt-5-mini",
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: request.signal,
      onFinish: async ({ text }) => {
        if (currentSessionId && text) {
          await supabase.from("chat_messages").insert({
            session_id: currentSessionId,
            role: "assistant",
            content: text,
          })
          await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", currentSessionId)
        }
      },
    })

    // consumeSseStream ensures the serverless function stays alive
    // until the entire stream is sent to the client
    const response = result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
    })

    // Add session ID to response headers
    response.headers.set("X-Session-Id", currentSessionId || "")

    return response
  } catch (error) {
    console.error("[ai-chat] Error:", error)
    return new Response(
      JSON.stringify({ error: "Errore nel servizio chat IA" }),
      { status: 500 }
    )
  }
}

export const POST = measureRoute("/api/ai-chat", _POST as any)
