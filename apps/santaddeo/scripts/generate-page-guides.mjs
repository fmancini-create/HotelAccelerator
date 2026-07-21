/**
 * Auto-generates page-guides.ts by scanning all app pages.
 * Run: node scripts/generate-page-guides.mjs
 * 
 * Strategy:
 * 1. Scans all app/**/page.tsx files
 * 2. Extracts: component imports, titles, descriptions, UI elements
 * 3. Maps features from component names and UI patterns
 * 4. Generates lib/page-guides.ts with accurate context
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "fs"
import { join, relative } from "path"

const APP_DIR = join(process.cwd(), "app")
const OUTPUT = join(process.cwd(), "lib", "page-guides.ts")

// Recursively find all page.tsx files
function findPages(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      findPages(full, results)
    } else if (entry === "page.tsx") {
      results.push(full)
    }
  }
  return results
}

// Extract route from file path
function fileToRoute(filePath) {
  let route = "/" + relative(APP_DIR, filePath).replace(/\/page\.tsx$/, "")
  // Handle (group) routes
  route = route.replace(/\/\([^)]+\)/g, "")
  if (route === "/") return "/"
  return route.replace(/\/$/, "")
}

// Extract useful info from page source
function analyzePage(source, route) {
  const info = {
    title: "",
    description: "",
    features: [],
    components: [],
    isClientComponent: source.startsWith('"use client"'),
  }

  // Extract imported components
  const importMatches = source.matchAll(/import\s+{([^}]+)}\s+from\s+"([^"]+)"/g)
  for (const m of importMatches) {
    const names = m[1].split(",").map(s => s.trim())
    info.components.push(...names)
  }

  // Extract CardTitle / title texts
  const titleMatches = source.matchAll(/<CardTitle[^>]*>([^<]+)<\/CardTitle>/g)
  for (const m of titleMatches) {
    if (!info.title) info.title = m[1].trim()
  }

  // Extract metadata title
  const metaTitle = source.match(/title:\s*["']([^"']+)["']/)
  if (metaTitle) info.title = metaTitle[1].replace(/\s*\|.*$/, "")

  // Extract CardDescription texts
  const descMatches = source.matchAll(/<CardDescription[^>]*>([\s\S]*?)<\/CardDescription>/g)
  for (const m of descMatches) {
    const clean = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    if (clean.length > 10 && !info.description) info.description = clean

  }

  // Extract metadata description
  const metaDesc = source.match(/description:\s*["']([^"']+)["']/)
  if (metaDesc && !info.description) info.description = metaDesc[1]

  // Extract string literals that look like feature labels
  const stringLiterals = source.matchAll(/"([^"]{10,80})"/g)
  const featureHints = []
  for (const m of stringLiterals) {
    const s = m[1]
    if (s.includes("/") || s.includes("http") || s.includes("import") || s.includes("=")) continue
    if (/^[A-Z]/.test(s) && /[a-z]/.test(s)) featureHints.push(s)
  }

  // Map component names to features
  const componentFeatures = {
    "Table": "Tabella dati con ordinamento colonne",
    "Tabs": "Navigazione a schede per diverse viste",
    "Dialog": "Dialoghi modali per dettagli e azioni",
    "Select": "Filtri a menu a tendina",
    "Input": "Campi di input editabili",
    "Switch": "Toggle attivazione/disattivazione",
    "Badge": "Indicatori di stato colorati",
    "Calendar": "Selezione date con calendario",
    "Chart": "Grafici e visualizzazioni dati",
    "Separator": "Sezioni separate visivamente",
    "RefreshCw": "Bottone di aggiornamento dati",
    "Save": "Salvataggio modifiche",
    "Filter": "Filtri avanzati",
    "ArrowUpDown": "Ordinamento colonne tabella",
    "Eye": "Visualizzazione dettagli",
    "Pencil": "Modifica inline",
    "Trash2": "Eliminazione elementi",
    "Plus": "Aggiunta nuovi elementi",
    "Download": "Esportazione/download dati",
    "Copy": "Copia dati",
    "Lock": "Funzionalita' riservata al piano Accelerator",
  }

  for (const [comp, feature] of Object.entries(componentFeatures)) {
    if (info.components.includes(comp)) {
      info.features.push(feature)
    }
  }

  return info
}

// Known page descriptions (manually curated for accuracy, auto-generated fill the gaps)
const KNOWN_PAGES = {
  "/dashboard": {
    title: "Dashboard Principale",
    description: "La dashboard mostra una panoramica completa delle performance della struttura ricettiva. Contiene 8 box metriche principali (Produzione Camere, Occupazione, ADR, RevPAR, ecc.), grafico produzione mensile, prenotazioni ricevute oggi, e confronti anno su anno. I dati vengono sincronizzati dal PMS (Scidoo, Ericsoft, ecc.) e aggiornati automaticamente via cron ogni 4 ore. La data puo' essere cambiata con il date picker in alto a destra.",
    features: [
      "8 box metriche: Produzione Camere, Occupazione, ADR, RevPAR, Prenotazioni Nuove, Cancellazioni, Arrivi, Partenze",
      "Grafico a barre della produzione mensile con dettaglio per giorno",
      "Confronto anno corrente vs anno precedente (YoY) con delta % su ogni metrica",
      "Prenotazioni ricevute oggi: lista con ospite, camera, check-in/out, importo",
      "Selezione data per visualizzare dati storici o futuri",
      "Semaforo KPI: indicatori verde/arancione/rosso sulle metriche principali",
      "Pannello Alert con avvisi intelligenti basati sulle soglie KPI",
      "I dati si aggiornano automaticamente ogni 4 ore dal PMS",
    ],
  },
  "/dati/bookings": {
    title: "Prenotazioni",
    description: "La pagina Prenotazioni mostra l'elenco completo di tutte le prenotazioni sincronizzate dal PMS. Puoi filtrare per periodo (mese), stato (confermate/cancellate), e ordinare per qualsiasi colonna. Cliccando su una riga si apre il dettaglio con tutti i dati della prenotazione (ospite, contatti, camera, date, importo, canale, dati grezzi PMS).",
    features: [
      "Tabella prenotazioni con colonne: ID, Ospite, Camera, Check-in, Check-out, Notti, Canale, Importo, Stato",
      "Filtro per mese con navigazione avanti/indietro",
      "Tab Confermate/Cancellate per separare le prenotazioni per stato",
      "Ordinamento cliccando sull'intestazione di qualsiasi colonna (ascendente/discendente)",
      "Clic su una riga apre il Dialog Dettaglio con tutte le info: dati ospite, contatti, dati camera, importi, canale, date, e i dati grezzi dal PMS",
      "Conteggio totale prenotazioni e importo totale nel periodo",
      "Bottone Aggiorna per forzare il refresh dei dati",
    ],
  },
  "/dati/production": {
    title: "Produzione",
    description: "La pagina Produzione mostra un calendario mensile con la produzione (ricavo) giornaliera per ogni tipologia di camera. Ogni colonna e' un giorno, ogni riga una tipologia camera. La riga TOTALE mostra il totale giornaliero. Si naviga tra i mesi con le frecce. I dati provengono dal calcolo daily_price delle prenotazioni sincronizzate dal PMS.",
    features: [
      "Griglia calendario produzione: righe = tipologie camera, colonne = giorni del mese",
      "Riga TOTALE con somma giornaliera di tutte le tipologie",
      "Navigazione mese con frecce avanti/indietro",
      "Colori di sfondo che indicano l'intensita' della produzione (dal bianco al verde scuro)",
      "Scroll orizzontale per vedere tutti i giorni del mese",
      "Nome struttura e data ultima sincronizzazione in alto",
      "Bottone Aggiorna per forzare il refresh dei dati",
    ],
  },
  "/dati/rooms-sold": {
    title: "Camere Vendute",
    description: "La pagina Camere Vendute mostra un calendario mensile con il numero di camere vendute (occupate) per ogni tipologia di camera, giorno per giorno. Include anche i ricavi per tipologia. La riga TOTALE mostra il totale giornaliero, con la percentuale di occupazione. I colori indicano il livello di occupazione (rosso = bassa, verde = alta).",
    features: [
      "Griglia calendario camere vendute: righe = tipologie camera, colonne = giorni del mese",
      "Per ogni cella: numero camere vendute / totale disponibili",
      "Riga TOTALE con somma giornaliera e percentuale occupazione",
      "Colori di sfondo per livello occupazione (rosso basso, arancione medio, verde alto)",
      "Sezione Ricavi con produzione per tipologia e per giorno",
      "Navigazione mese con frecce avanti/indietro",
      "Bottone Aggiorna per forzare il refresh dei dati",
      "Fonte dati mostrata (PMS diretto o rms_daily_room_revenue)",
    ],
  },
  "/dati/calendario": {
    title: "Calendario Prenotazioni",
    description: "Il Calendario Prenotazioni mostra una vista annuale con 12 mesi in griglia. Ogni giorno e' contrassegnato da indicatori colorati: verde per nuove prenotazioni, arancione per modifiche/cancellazioni. Cliccando su un giorno si apre il dettaglio con la lista delle prenotazioni di quel giorno. Solo i giorni da oggi in poi vengono analizzati per le modifiche recenti.",
    features: [
      "Vista annuale con 12 mesi in griglia (3 colonne x 4 righe)",
      "Indicatori colorati: pallino verde = nuove prenotazioni, arancione = modifiche/cancellazioni",
      "Clic sul giorno apre il dettaglio con lista prenotazioni (ospite, camera, check-in/out, stato)",
      "Numero prenotazioni mostrato dentro ogni cella giorno",
      "Navigazione anno con frecce avanti/indietro",
      "Solo i giorni futuri (da oggi) vengono evidenziati per modifiche recenti",
    ],
  },
  "/dati/objectives": {
    title: "Obiettivi Anno in Corso",
    description: "La pagina Obiettivi mostra una tabella con 12 righe (una per mese) con i dati di produzione, occupazione e confronto con l'anno precedente. Per ogni mese puoi impostare l'Obiettivo di revenue e la Percentuale Invenduto Previsionale. Il sistema calcola automaticamente: produzione ad oggi, produzione totale, delta vs obiettivo, RevPAR, RevPOR, coefficiente revenue, camere vendute/invendute/disponibili.",
    features: [
      "Tabella 12 mesi con dati: Produzione ad Oggi, Produzione Totale, Anno Precedente, Obiettivo, Delta, RevPAR, RevPOR",
      "Campi editabili: Obiettivo mensile di revenue (in EUR) e Percentuale Invenduto Previsionale (%)",
      "Calcolo automatico: delta obiettivo, coefficiente revenue, camere vendute vs disponibili",
      "Confronto anno precedente: produzione, occupazione, RevPOR dell'anno prima",
      "Bottone Salva Obiettivi per salvare le modifiche",
      "Filtro 'Solo ad Oggi': mostra solo la produzione acquisita fino ad oggi invece del totale mese",
      "Navigazione anno con frecce avanti/indietro",
      "Colonne calcolate: camere rimanenti invendute, percentuale invenduto previsionale, RevPOR target, camere attese da vendere",
    ],
  },
  "/accelerator/pricing": {
    title: "Gestione Prezzi",
    description: "Gestisci i prezzi delle tue camere con lo strumento di pricing dinamico. La pagina mostra un calendario mensile con una griglia di prezzi per ogni tipologia di camera, tariffa e occupazione. Puoi impostare tariffe base, parametri dell'algoritmo (fasce occupazionali, last minute, domanda) e vedere i prezzi suggeriti calcolati automaticamente. I dati vengono salvati automaticamente dopo 2 secondi dalla modifica (autosave).",
    features: [
      "Griglia calendario prezzi: ogni cella mostra il prezzo per giorno/tipologia/tariffa/occupazione",
      "COPIARE DATI SU PIU' GIORNI - Metodo 1 (Drag-fill): trascina il bordo destro di una cella (il quadratino blu) verso destra per copiare il valore sulle celle adiacenti, come in Google Sheets",
      "COPIARE DATI SU PIU' GIORNI - Metodo 2 (Compilazione multipla): fai clic sull'icona a destra dell'etichetta di riga per aprire il dialog 'Compila periodo'. Scegli data inizio, data fine, il valore da applicare, e opzionalmente seleziona solo certi giorni della settimana (es. solo lun-ven). Poi clicca Applica.",
      "Parametri algoritmo: tariffa base, occupazione, domanda, last minute, fasce occupazionali -- ciascun parametro puo' essere impostato giorno per giorno",
      "Prezzi suggeriti: l'algoritmo calcola un prezzo consigliato per ogni cella in base a tutti i parametri impostati",
      "Overlay Produzione Media: attiva il toggle per vedere il prezzo medio di vendita effettivo sovrapposto ai prezzi impostati",
      "Confronto anno precedente: sotto la riga occupazione viene mostrato il dato dell'anno precedente per confronto",
      "Selezione tariffa: usa il menu a tendina in alto per scegliere quale tariffa visualizzare (o 'Tutte')",
      "Le sezioni parametri sono espandibili/comprimibili cliccando sull'intestazione",
      "Autosave: le modifiche vengono salvate automaticamente dopo 2 secondi di inattivita'",
    ],
  },
  "/accelerator/dashboard": {
    title: "Accelerator Dashboard",
    description: "La dashboard Accelerator mostra lo stato dell'abbonamento Accelerator e permette di accedere alle funzionalita' avanzate di revenue management: pricing dinamico, fasce occupazionali, livelli last minute, e KPI personalizzati.",
    features: [
      "Stato abbonamento Accelerator (Basic/Premium/Trial)",
      "Accesso diretto a Gestione Prezzi (pricing dinamico)",
      "Link a configurazione Fasce Occupazionali",
      "Link a configurazione Livelli Last Minute",
      "Link a personalizzazione KPI e soglie",
      "Upgrade piano se necessario",
    ],
  },
  "/settings/hotel": {
    title: "Impostazioni Struttura",
    description: "Modifica i dati della tua struttura ricettiva: nome, indirizzo, citta', CAP, email, telefono, tipologia di alloggio (camere, appartamenti, case vacanze), numero totale camere. Il superadmin puo' anche modificare l'organization_id.",
    features: [
      "Campo Nome struttura",
      "Indirizzo completo: via, citta', CAP",
      "Contatti: email e telefono",
      "Tipologia di alloggio: camere, appartamenti, case vacanze (influenza le etichette in tutta la piattaforma)",
      "Bottone Salva per salvare le modifiche",
    ],
  },
  "/settings/pms": {
    title: "Configurazione PMS",
    description: "Collega e configura il tuo Property Management System (PMS). Questa pagina mostra: lo stato della connessione PMS, le credenziali API configurate, la lista delle tipologie camera importate dal PMS, le tariffe (rate plans), e i pannelli di sincronizzazione manuale. PMS supportati: Scidoo, Ericsoft Suite 4, Bedzzle, Hotel Cinquestelle, Wubook, Slope, e molti altri.",
    features: [
      "Stato connessione PMS: attivo/inattivo con data ultima sync",
      "Configurazione credenziali: API Key, Endpoint URL, Property ID",
      "Bottone Test Connessione per verificare che le credenziali funzionino",
      "Lista Tipologie Camera importate dal PMS con numero camere per tipo",
      "Lista Tariffe (Rate Plans) importate dal PMS",
      "Pannello Sincronizzazione Scidoo: bottoni per sincronizzare manualmente prenotazioni, disponibilita', tariffe",
      "Pannello Sincronizzazione Google Sheets: per strutture che usano GSheets invece di un PMS API",
      "PMS supportati: Scidoo, Ericsoft Suite 4, Bedzzle, Hotel Cinquestelle, Wubook, Slope, HotelAppz, HotelTime, RoomCloud, e altri",
    ],
  },
  "/settings/users": {
    title: "Gestione Team",
    description: "Gestisci i membri del team della tua struttura. Puoi invitare nuovi utenti via email, visualizzare la lista dei membri con ruolo e ultimo accesso, e rimuovere utenti. Solo gli admin della struttura possono gestire il team. Con il piano Basic il team e' limitato a un certo numero di utenti.",
    features: [
      "Lista membri del team: nome, email, ruolo (admin/utente), data registrazione, ultimo accesso",
      "Invito nuovi utenti via email: inserisci l'email e il sistema invia un invito",
      "Assegnazione ruolo: admin della struttura o utente standard",
      "Rimozione utenti dal team",
      "Indicazione piano abbonamento e eventuali limiti sul numero utenti",
    ],
  },
  "/settings/kpi": {
    title: "KPI Personalizzati",
    description: "Personalizza le soglie dei KPI (Key Performance Indicator) per la tua struttura. Ogni KPI ha 3 livelli: verde (buono), arancione (attenzione), rosso (critico). Puoi personalizzare le soglie per: Occupazione, ADR, RevPAR, Tasso Cancellazione, Ricavo Totale, Prenotazioni, e altri. Le soglie influenzano i semafori nella dashboard. Disponibile solo con piano Accelerator.",
    features: [
      "Lista KPI disponibili: Occupazione, ADR, RevPAR, Tasso Cancellazione, Ricavo Totale, Prenotazioni Nuove, RevPOR",
      "Per ogni KPI: soglia Verde (min), Arancione (min), Rosso (min), con unita' (%, EUR, n.)",
      "Toggle attivazione/disattivazione per ogni KPI",
      "Hover sulle info per vedere la descrizione dettagliata di ogni KPI",
      "Bottone Salva per salvare le soglie personalizzate",
      "Bottone Reset per ripristinare i valori predefiniti",
      "Richiede piano Accelerator -- con piano Basic i KPI usano soglie predefinite non modificabili",
    ],
  },
  "/settings/mappings": {
    title: "Mappatura Camere e Codici",
    description: "Visualizza le mappature tra i codici del tuo PMS e il sistema Santaddeo. Le mappature includono: tipologie camera (room_type), tariffe (rate_plan), canali di vendita (channel), metodi di pagamento (payment_method), trattamenti (meal_plan), e stati prenotazione. Le mappature vengono create automaticamente durante la sincronizzazione PMS ma possono essere verificate qui.",
    features: [
      "Lista mappature per categoria: room_type, rate_plan, channel, payment_method, meal_plan, arrangement",
      "Per ogni mappatura: codice PMS, nome PMS, codice RMS Santaddeo, nome RMS",
      "Indicazione PMS collegato (es. Scidoo, Ericsoft)",
      "Stato ETL (Extract-Transform-Load) per verificare se la sincronizzazione e' attiva",
      "Mappature globali di sistema (booking_status, document_type) visibili separatamente",
    ],
  },
  "/settings/advanced": {
    title: "Integrazioni Avanzate",
    description: "Configura le integrazioni con servizi esterni per ottenere insights avanzati: Google Analytics (per traffico web), API meteo (per correlazione meteo-prenotazioni), Booking.com (per dati competitivi). Queste integrazioni sono opzionali e arricchiscono i dati della piattaforma.",
    features: [
      "Integrazione Google Analytics: inserisci il Measurement ID per tracciare il traffico",
      "Integrazione API Meteo: per correlazione tra condizioni meteo e prenotazioni",
      "Integrazione Booking.com: per benchmark competitivi nella tua zona",
      "Ogni integrazione ha un form dedicato con campi specifici",
    ],
  },
  "/settings/api": {
    title: "API e Integrazioni",
    description: "Gestisci le chiavi API per connettere applicativi esterni (CRM, contabilita', business intelligence) con Santaddeo. Puoi creare chiavi API con scopi (scopes) specifici per limitare l'accesso ai soli dati necessari. Una volta generata, la chiave viene mostrata una sola volta -- copiala subito!",
    features: [
      "Creazione chiave API: scegli un nome e seleziona gli scopes (permessi)",
      "Scopes disponibili: bookings:read (prenotazioni), revenue:read (ricavi), occupancy:read (occupazione), room_types:read (tipologie camera), rates:read (tariffe), fiscal:read (dati fiscali), webhooks:write (webhook)",
      "La chiave API viene mostrata UNA SOLA VOLTA al momento della creazione -- clicca il campo per selezionarla e usa il bottone Copia",
      "Lista chiavi API esistenti con data creazione e scopes assegnati",
      "Eliminazione chiavi API non piu' utilizzate",
      "Documentazione inline con esempio di utilizzo dell'API",
    ],
  },
  "/settings/last-minute-levels": {
    title: "Livelli Last Minute",
    description: "Configura i livelli di last minute per il pricing dinamico. Ogni livello ha un nome, uno sconto percentuale rispetto alla tariffa base, e un set di fasce occupazionali che determinano come lo sconto si riduce e la tariffa cresce man mano che l'occupazione aumenta. Piu' l'occupazione sale, piu' lo sconto si riduce e la tariffa cresce. La velocita' di crescita dipende dal livello: i livelli 'Molto Basso' hanno crescita lenta, quelli 'Aggressivo' hanno crescita rapida.",
    features: [
      "Lista livelli last minute ordinabili (es. Molto Basso, Basso, Moderato, Aggressivo)",
      "Per ogni livello: nome, colore, sconto % base, range occupazione minima/massima",
      "Fasce occupazionali espandibili per ogni livello: clicca sul livello per vedere le fasce",
      "Per ogni fascia: range occupazione (es. 0-20%, 20-40%), sconto iniziale, velocita' crescita tariffa (molto lenta/lenta/media/veloce/molto veloce), crescita % per punto occupazione, percentuale massima di recupero tariffa",
      "Logica: occupazione bassa = sconto pieno e crescita lenta; occupazione alta = sconto ridotto e crescita rapida",
      "Aggiunta/rimozione livelli con bottone + e cestino",
      "Salvataggio con bottone Salva. Richiede piano Accelerator",
    ],
  },
  "/settings/occupancy-bands": {
    title: "Fasce Occupazionali",
    description: "Configura i gruppi di fasce occupazionali per il pricing dinamico. Le fasce determinano come la tariffa varia in base all'occupazione della struttura. Puoi creare gruppi con multiple fasce, ciascuna con un range di occupazione e un incremento (in % o EUR). L'incremento puo' essere in percentuale sulla tariffa base o in EUR fissi.",
    features: [
      "Gruppi di fasce: crea gruppi con nome e colore (es. 'Bassa Stagione', 'Alta Stagione')",
      "Per ogni gruppo: lista fasce con range occupazione (min-max in % o numero camere)",
      "Per ogni fascia: etichetta, range occupazione, tipo incremento (% o EUR), valore incremento",
      "Modalita' occupazione: percentuale (%) o numero camere assoluto",
      "Modalita' incremento: percentuale sulla tariffa base o valore fisso in EUR",
      "Copia un gruppo per crearne uno simile rapidamente",
      "Ordinamento gruppi trascinando le righe",
      "Salvataggio con bottone Salva. Richiede piano Accelerator",
    ],
  },
  "/superadmin": {
    title: "Pannello Super Admin",
    description: "Il pannello Super Admin offre una vista completa di tutte le strutture, utenti, abbonamenti e configurazioni della piattaforma SANTADDEO. Accessibile solo al superadmin. Da qui puoi: gestire gli hotel e i loro PMS, gestire gli utenti e i loro ruoli, configurare i provider PMS supportati, gestire gli abbonamenti Accelerator, visualizzare feedback e richieste, configurare regole alert globali, default livelli LM e fasce occupazionali, e campagne marketing.",
    features: [
      "Tab Strutture: lista di tutti gli hotel con stato PMS, abbonamento, ultima sync",
      "Tab Utenti: lista di tutti gli utenti con ruolo, organizzazione, ultimo accesso. Bottone Impersonalizza per accedere come un utente specifico",
      "Tab Provider PMS: gestione dei provider PMS supportati con logo, documentazione, API endpoint",
      "Tab Abbonamenti: gestione piani Accelerator (Basic/Premium/Trial) per ogni hotel",
      "Tab Feedback: visualizzazione dei feedback e richieste di upgrade degli utenti",
      "Tab Alert Rules: configurazione regole alert globali (KPI, soglie, frequenza)",
      "Tab Default Livelli LM: impostazione livelli last minute predefiniti per nuove strutture",
      "Tab Default Fasce: impostazione fasce occupazionali predefinite per nuove strutture",
      "Tab Marketing: campagne DEM, gestione contatti, template email",
      "Impersonazione struttura: dropdown in alto per accedere come qualsiasi hotel",
    ],
  },
}

// Pages to skip (auth, marketing, internal tools)
const SKIP_ROUTES = [
  "/auth/login", "/auth/sign-up", "/auth/forgot-password", "/auth/reset-password", "/auth/verify-email",
  "/home", "/privacy", "/termini", "/about", "/features", "/partner", "/partner-info", "/request-info",
  "/coming-soon", "/onboarding", "/setup/initial", "/upgrade/consultation", "/upgrade/hotel-accelerator",
  "/", "/page",
  // Internal dev tools
  "/dati/check-data", "/dati/cleanup-null", "/dati/database", "/dati/fix-mapping", "/dati/resync", "/dati/room-types-status", "/dati/scidoo",
  "/admin/sql-executor", "/admin/email-templates",
  "/superadmin/api-keys", "/superadmin/business-plan", "/superadmin/connectors-mapping", "/superadmin/pms-roadmap", "/superadmin/pricing", "/superadmin/rms-codes", "/superadmin/tenant-costs",
  "/dashboard-v2", "/dashboard-v3", "/bookings", "/calendar", "/occupancy", "/team",
]

function main() {
  const pages = findPages(APP_DIR)
  const guides = {}

  for (const page of pages) {
    const route = fileToRoute(page)
    if (SKIP_ROUTES.includes(route)) continue

    if (KNOWN_PAGES[route]) {
      guides[route] = KNOWN_PAGES[route]
    } else {
      // Auto-analyze
      const source = readFileSync(page, "utf-8")
      const info = analyzePage(source, route)
      if (info.title || info.description) {
        guides[route] = {
          title: info.title || route.split("/").pop().replace(/-/g, " "),
          description: info.description || `Pagina ${route} della piattaforma SANTADDEO.`,
          features: info.features.length > 0 ? info.features : ["Funzionalita' in fase di documentazione"],
        }
      }
    }
  }

  // Sort by route
  const sortedEntries = Object.entries(guides).sort((a, b) => a[0].localeCompare(b[0]))

  // Generate TypeScript
  let output = `/**
 * AUTO-GENERATED by scripts/generate-page-guides.mjs
 * DO NOT EDIT MANUALLY -- run: node scripts/generate-page-guides.mjs
 *
 * This file provides accurate page context to the AI guide assistant.
 * Each entry maps a route to a title + description + features extracted
 * from the actual page code and manually curated for accuracy.
 */

export interface PageGuide {
  title: string
  description: string
  features: string[]
}

const PAGE_GUIDES: Record<string, PageGuide> = {\n`

  for (const [route, guide] of sortedEntries) {
    output += `  "${route}": {\n`
    output += `    title: ${JSON.stringify(guide.title)},\n`
    output += `    description: ${JSON.stringify(guide.description)},\n`
    output += `    features: [\n`
    for (const f of guide.features) {
      output += `      ${JSON.stringify(f)},\n`
    }
    output += `    ],\n`
    output += `  },\n`
  }

  output += `}

/**
 * Find the best matching guide for a given pathname.
 * Tries exact match first, then progressively shorter prefixes.
 */
export function getPageGuide(pathname: string): PageGuide | null {
  if (PAGE_GUIDES[pathname]) return PAGE_GUIDES[pathname]
  const segments = pathname.split("/").filter(Boolean)
  while (segments.length > 0) {
    const path = "/" + segments.join("/")
    if (PAGE_GUIDES[path]) return PAGE_GUIDES[path]
    segments.pop()
  }
  return null
}

/**
 * Get full context string for AI about the current page.
 */
export function getPageContext(pathname: string): string {
  const guide = getPageGuide(pathname)
  if (!guide) {
    return \`L'utente si trova sulla pagina \${pathname} della piattaforma SANTADDEO per il revenue management alberghiero.\`
  }
  return \`L'utente si trova sulla pagina "\${guide.title}" (\${pathname}) della piattaforma SANTADDEO.

Descrizione pagina: \${guide.description}

Funzionalita' disponibili in questa pagina:
\${guide.features.map((f) => \`- \${f}\`).join("\\n")}

SANTADDEO e' una piattaforma di revenue management per strutture ricettive che si integra con i PMS (Property Management System) per fornire analisi, previsioni e strumenti di pricing dinamico.

REGOLE PER LE RISPOSTE:
- Rispondi SOLO basandoti sulle funzionalita' elencate sopra. NON inventare funzionalita' che non esistono.
- Se non sei sicuro che una funzionalita' esista, dillo chiaramente.
- Guida l'utente passo per passo basandoti su come la pagina funziona realmente.\`
}
`

  writeFileSync(OUTPUT, output)
  console.log(`Generated ${OUTPUT} with ${sortedEntries.length} page guides`)
}

main()
