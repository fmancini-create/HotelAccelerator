/**
 * Seed/refresh delle voci di `platform_knowledge` che descrivono le PAGINE e i
 * MODULI della piattaforma, cosi' il RevMentor ("Taddeo") conosce la struttura
 * reale di SANTADDEO e le funzionalita' aggiunte di recente (Booking Pace,
 * Rate Shopper, Trend Tariffe, Analytics, ecc.).
 *
 * Idempotente: per ogni voce, se esiste gia' una riga con lo stesso `title`
 * la AGGIORNA (content/category/is_active), altrimenti la INSERISCE.
 *
 * Run:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-platform-knowledge-pages.mjs
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
}

/** @type {Array<{category:string,title:string,content:string}>} */
const ENTRIES = [
  {
    category: "navigazione",
    title: "Mappa delle pagine della piattaforma",
    content:
      "SANTADDEO e' organizzata in queste aree principali. " +
      "DASHBOARD (/dashboard): panoramica performance con 8 box metriche (Produzione, Occupazione, ADR, RevPAR, ecc.), grafico produzione, prenotazioni di oggi e confronto anno su anno. " +
      "AREA DATI (/dati): Prenotazioni (/dati/bookings), Produzione (/dati/production), Camere Vendute (/dati/rooms-sold), Calendario prenotazioni (/dati/calendario), Obiettivi (/dati/objectives), Analytics (/dati/analytics), Recensioni (/dati/reviews), Performance OTA (/dati/performance-ota), Guard controlli prenotazioni (/dati/guard), Log variazioni prezzi (/dati/log-prezzi), Commissioni e Fatture (/dati/commissioni-fatture). " +
      "AREA ACCELERATOR (moduli a pagamento): Gestione Prezzi / pricing dinamico (/accelerator/pricing) e relative Impostazioni algoritmo (/accelerator/pricing/settings), Produzione per Canali (/accelerator/price), Trend Tariffe & Occupazione (/accelerator/trend), Booking Pace (/accelerator/pace), Rate Shopper (/accelerator/rate-shopper), Eventi (/accelerator/events). " +
      "IMPOSTAZIONI (/settings): Struttura (/settings/hotel), PMS (/settings/pms), Team utenti (/settings/users), KPI personalizzati (/settings/kpi), Mappature (/settings/mappings), Fasce occupazionali (/settings/occupancy-bands), Livelli last minute (/settings/last-minute-levels), Integrazioni avanzate (/settings/advanced), API (/settings/api). " +
      "Quando l'utente chiede dove trovare una funzione, indica la pagina corretta tra queste.",
  },
  {
    category: "moduli",
    title: "Booking Pace (ritmo di prenotazione)",
    content:
      "La pagina Booking Pace (/accelerator/pace) mostra l'on-the-books (camere, ricavo e ADR gia' a libro) per le notti future, confrontato con lo STESSO momento dell'anno scorso (STLY, Same Time Last Year), a parita' di anticipo. Serve a capire se stai vendendo piu' o meno velocemente dell'anno precedente. Include: KPI on-the-books con variazione % vs STLY, pickup degli ultimi 7/14/30 giorni, curva di prenotazione (accumulo camere/ricavo avvicinandosi alla data, con linea anno scorso allo stesso anticipo), tabella on-the-books per mese, e una lettura automatica che distingue 'meno camere ma piu' ricavo' (positivo) da 'piu' camere ma ricavo sotto' (attenzione alla tariffa). Orizzonti selezionabili: 30/90/180/365 giorni. E' un modulo Accelerator a pagamento.",
  },
  {
    category: "moduli",
    title: "Rate Shopper (confronto prezzi competitor)",
    content:
      "La pagina Rate Shopper (/accelerator/rate-shopper) confronta i tuoi prezzi con quelli del comp set (i competitor scelti dall'utente), giorno per giorno, per i prossimi 30/60/90 giorni. Per ogni notte mostra: il tuo prezzo, i prezzi dei competitor, il mercato (minimo, mediana, massimo), lo scostamento % rispetto alla mediana e il posizionamento. La cella del tuo prezzo e' verde se sei sotto la mediana (competitivo) e rossa (intensita' crescente) se sei sopra. Due viste: 'Per notte' (tariffa lead-in piu' bassa) e 'Per tipologia' (la tua camera vs la camera equivalente mappata di ogni competitor). I prezzi competitor si inseriscono manualmente, via import CSV o feed automatico. E' un modulo Accelerator a pagamento.",
  },
  {
    category: "moduli",
    title: "Trend Tariffe & Occupazione",
    content:
      "La pagina Trend Tariffe & Occupazione (/accelerator/trend) mostra lo storico evolutivo della tariffa e dell'occupazione per data, tipologia camera e tariffa. Si scelgono tipologia (o 'Intera struttura'), tariffa e numero occupanti e si vede un grafico combinato (linea tariffa + barre occupazione %) e una tabella di dettaglio giornaliero (prezzo di partenza, prezzo attuale, variazione %, n. modifiche, occupazione %). Cliccando una riga si apre l'evoluzione nel tempo di quel singolo giorno (curva della tariffa e curva di pickup dell'occupazione). L'occupazione e' valorizzata anche per i giorni passati perche' derivata dalla disponibilita', non dalla produzione fiscale. E' un modulo Accelerator a pagamento.",
  },
  {
    category: "analisi",
    title: "Analytics avanzate",
    content:
      "La pagina Analytics (/dati/analytics) offre analisi avanzate: distribuzione del revenue e della produzione per giorno della settimana, per canale, lead time (anticipo di prenotazione) e lunghezza del soggiorno. IMPORTANTE: il revenue 'per prenotazione' usa la data di PRENOTAZIONE (booking_date), mentre la 'produzione' usa la data-NOTTE (soggiorno): sono due viste diverse degli stessi ricavi e i due grafici per giorno-settimana NON devono coincidere.",
  },
  {
    category: "analisi",
    title: "Performance OTA",
    content:
      "La pagina Performance OTA (/dati/performance-ota) analizza i canali OTA (Booking.com, Expedia, ecc.) combinando KPI inseriti manualmente (es. dati dall'extranet Booking.com) con il mix canale calcolato dal database interno delle prenotazioni. Serve a confrontare il contributo dei vari canali OTA rispetto al diretto.",
  },
  {
    category: "analisi",
    title: "Recensioni",
    content:
      "La pagina Recensioni (/dati/reviews) raccoglie e monitora le recensioni della struttura dai portali, con punteggi, andamento nel tempo e dettaglio per fonte. La reputazione online incide su domanda e potere di pricing.",
  },
  {
    category: "qualita-dati",
    title: "Guard - controlli prenotazioni",
    content:
      "La pagina Guard (/dati/guard) esegue controlli di qualita' sulle prenotazioni sincronizzate per individuare anomalie: dati mancanti, importi incoerenti, mappature camera/tariffa non risolte o disallineamenti rispetto al PMS. Aiuta a tenere puliti i dati su cui si basano dashboard e pricing. Se l'utente segnala numeri 'strani', Guard e' il punto da cui partire per la diagnosi.",
  },
  {
    category: "obiettivi",
    title: "Obiettivi anno in corso",
    content:
      "La pagina Obiettivi (/dati/objectives) mostra una tabella con 12 mesi: produzione ad oggi, produzione totale, anno precedente, obiettivo di revenue (impostabile dall'utente), percentuale invenduto previsionale, delta vs obiettivo, RevPAR, RevPOR e camere vendute/disponibili. Permette di fissare i target mensili e monitorare l'avanzamento.",
  },
]

async function getExistingByTitle(title) {
  const url = `${SUPABASE_URL}/rest/v1/platform_knowledge?select=id,title&title=eq.${encodeURIComponent(title)}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`select failed ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows[0] || null
}

async function run() {
  let inserted = 0
  let updated = 0
  for (const e of ENTRIES) {
    const existing = await getExistingByTitle(e.title)
    if (existing) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/platform_knowledge?id=eq.${existing.id}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            category: e.category,
            content: e.content,
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        }
      )
      if (!res.ok) throw new Error(`update failed ${res.status}: ${await res.text()}`)
      updated++
      console.log(`updated: [${e.category}] ${e.title}`)
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/platform_knowledge`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          category: e.category,
          title: e.title,
          content: e.content,
          version: 1,
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error(`insert failed ${res.status}: ${await res.text()}`)
      inserted++
      console.log(`inserted: [${e.category}] ${e.title}`)
    }
  }
  console.log(`\nDone. inserted=${inserted} updated=${updated} total_entries=${ENTRIES.length}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
