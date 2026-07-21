/**
 * Page guide definitions - accurate context for the AI guide assistant.
 * Each entry maps a route to title + description + features based on
 * the ACTUAL page functionality (not generic descriptions).
 *
 * To regenerate: node scripts/generate-page-guides.mjs
 */

export interface PageGuide {
  title: string
  description: string
  features: string[]
}

const PAGE_GUIDES: Record<string, PageGuide> = {
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
  "/dati/log-prezzi": {
    title: "Log Variazioni Prezzi",
    description: "Visualizza lo storico completo di tutte le variazioni di prezzo (manuali e automatiche). Ogni variazione mostra: data/ora, tipologia camera, tariffa, prezzo precedente, nuovo prezzo, causa della variazione (manuale, occupazione, meteo, evento), e stato invio al PMS. Utile per verificare che il sistema di pricing automatico funzioni correttamente.",
    features: [
      "Lista cronologica di tutte le variazioni prezzo",
      "Per ogni variazione: data/ora, camera, tariffa, prezzo da -> a, delta %, causa",
      "Filtro per periodo (oggi, ultima settimana, ultimo mese)",
      "Filtro per tipologia camera",
      "Filtro per causa: manuale, occupazione, meteo, evento, last minute",
      "Stato invio PMS: in attesa, inviato, errore",
      "Dettaglio variazione: clicca per vedere i parametri che hanno causato la variazione",
      "Esportazione CSV dello storico variazioni",
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
  "/accelerator/pricing": {
    title: "Gestione Prezzi",
    description: "Gestisci i prezzi delle tue camere con lo strumento di pricing dinamico. La pagina mostra un calendario mensile con una griglia di prezzi per ogni tipologia di camera, tariffa e occupazione. I prezzi vengono ricalcolati AUTOMATICAMENTE quando cambiano le variabili esterne (occupazione, meteo, eventi) anche a pagina chiusa. Le variazioni vengono inviate al PMS entro 1 minuto se autopilot attivo, oppure via email se notifiche attive, oppure solo salvate se disattivo.",
    features: [
      "Griglia calendario prezzi: ogni cella mostra il prezzo per giorno/tipologia/tariffa/occupazione",
      "COPIARE DATI SU PIU' GIORNI - Metodo 1 (Drag-fill): trascina il bordo destro di una cella (il quadratino blu) verso destra per copiare il valore sulle celle adiacenti, come in Google Sheets",
      "COPIARE DATI SU PIU' GIORNI - Metodo 2 (Compilazione multipla): fai clic sull'icona a destra dell'etichetta di riga per aprire il dialog 'Compila periodo'. Scegli data inizio, data fine, il valore da applicare, e opzionalmente seleziona solo certi giorni della settimana (es. solo lun-ven). Poi clicca Applica.",
      "Parametri algoritmo: tariffa base, occupazione, domanda, last minute, fasce occupazionali -- ciascun parametro puo' essere impostato giorno per giorno",
      "INTENSIFICATORE K (solo K-Driven): regola QUANTO il coefficiente K muove i prezzi. Ha due canali -- (1) intensita' sull'incremento di banda/domanda (storicamente fissa a 0,3) e (2) intensita' diretta sul prezzo BASE (es. 0,15 = fino a ±15% sul base a K=±1, la leva piu' incisiva). Il pulsante 'Intensificatore K' accanto al toggle BASE/K-Driven apre il dialog per impostare un valore di default, per PERIODO (es. alta stagione) o per singolo GIORNO. Precedenza: giorno > periodo > default > comportamento storico.",
      "INTENSIFICATORE K giorno per giorno (riga in griglia): in modalita' K-Driven trovi nella griglia la riga 'Intensificatore K (prezzo base)', una cella editabile per ogni giorno (con drag-fill e Compila periodo come gli altri parametri). Una cella vuota EREDITA dal periodo/default impostati nel dialog; un valore inserito e' un override puntuale di quel giorno. I valori si salvano insieme al resto e alimentano lo stesso motore.",
      "Prezzi suggeriti: l'algoritmo calcola un prezzo consigliato per ogni cella in base a tutti i parametri impostati",
      "RICALCOLO AUTOMATICO: quando cambia una variabile esterna (es. nuova prenotazione che cambia occupazione), i prezzi vengono ricalcolati automaticamente anche se la pagina e' chiusa",
      "AUTOPILOT: 3 modalita' - 'auto' invia i prezzi al PMS automaticamente entro 1 minuto, 'notify' invia email di notifica, 'off' salva solo senza azioni",
      "Overlay Produzione Media: attiva il toggle per vedere il prezzo medio di vendita effettivo sovrapposto ai prezzi impostati",
      "Confronto anno precedente: sotto la riga occupazione viene mostrato il dato dell'anno precedente per confronto",
      "Selezione tariffa: usa il menu a tendina in alto per scegliere quale tariffa visualizzare (o 'Tutte')",
      "Le sezioni parametri sono espandibili/comprimibili cliccando sull'intestazione",
      "Autosave: le modifiche manuali vengono salvate automaticamente dopo 2 secondi di inattivita'",
      "Log prezzi: tutte le variazioni di prezzo (manuali e automatiche) vengono registrate e visibili in /dati/log-prezzi",
    ],
  },
  "/accelerator/pricing/settings": {
    title: "Impostazioni Algoritmo Prezzi",
    description: "Configura i parametri dell'algoritmo di pricing dinamico. Qui puoi impostare i pesi delle variabili K (occupazione, meteo, eventi), l'arrotondamento, i margini minimi, e la modalita' autopilot. Il sistema ricalcola automaticamente i prezzi quando cambiano le variabili esterne e li invia al PMS se autopilot attivo.",
    features: [
      "Tipo algoritmo: Basic (fasce occupazionali + last minute) o Advanced (variabili K con pesi personalizzati)",
      "Variabili K (solo Advanced): configura peso di occupazione, meteo, eventi, domanda storica, competizione",
      "Peso occupazione: quanto l'occupazione influenza il prezzo suggerito",
      "Peso meteo: quanto le condizioni meteo influenzano il prezzo (es. pioggia = ribasso, sole = rialzo)",
      "Peso eventi: quanto gli eventi locali influenzano il prezzo",
      "Arrotondamento: regole per arrotondare i prezzi (es. a EUR interi, ai 5 EUR, ai 10 EUR)",
      "Margine minimo: soglia sotto cui il prezzo non puo' scendere",
      "AUTOPILOT: 3 modalita' - 'auto' (invia prezzi al PMS automaticamente), 'notify' (invia email), 'off' (solo salvataggio)",
      "Dati Meteo: le previsioni meteo vengono aggiornate automaticamente ogni 3 ore per questa struttura",
      "Le frequenze di sync delle altre variabili (occupazione, prenotazioni) si configurano in Impostazioni > PMS",
      "Salvataggio parametri con bottone Salva",
    ],
  },
  "/accelerator/price": {
    title: "Produzione per Canali",
    description: "Visualizza la produzione (ricavi) giornaliera suddivisa per canale di vendita (Booking.com, Expedia, Sito Diretto, ecc.). La pagina mostra un calendario mensile con una riga per ogni tipologia camera, e sotto ogni tipologia le righe dei canali di vendita con i relativi ricavi giornalieri. Include anche i dati di occupazione per ogni tipologia.",
    features: [
      "Calendario mensile produzione: ogni colonna è un giorno del mese",
      "Raggruppamento per tipologia camera: ogni tipologia mostra il totale e il dettaglio per canale",
      "Dettaglio per canale di vendita: Booking.com, Expedia, HRS, Sito Web, OTA varie",
      "Riga occupazione per ogni tipologia: camere occupate / totale disponibili con percentuale",
      "Filtro canali: seleziona un singolo canale per vedere solo quella produzione",
      "Navigazione mese: frecce avanti/indietro per cambiare periodo",
      "Badge colorati per ogni canale per facile identificazione",
      "Totale produzione per tipologia (somma di tutti i canali)",
      "Quando selezioni un canale: sotto il 'Totale mese' compare anche il 'Totale {canale}' (ricavo del solo canale selezionato nel mese), e in fondo alla tabella una riga evidenziata 'TOTALE {canale}' con il dettaglio giorno per giorno",
      "Quota canale: accanto al totale del canale viene mostrata la percentuale sul totale del mese (es. 'Totale Booking.com: 70.589 € (44.2% del totale)'), considerando il totale mese come 100%",
    ],
  },
  "/accelerator/trend": {
    title: "Trend Tariffe & Occupazione",
    description: "La pagina Trend Tariffe & Occupazione mostra, in modo ordinato, lo storico evolutivo della tariffa e l'occupazione per ogni data, tipologia camera e tariffa. E' la versione estesa e leggibile dei dati che in Gestione Prezzi compaiono nel tooltip di evoluzione del prezzo. Si scelgono tipologia camera (o 'Intera struttura'), tariffa e numero occupanti, e si visualizza un grafico combinato (linea tariffa + barre occupazione %) piu' una tabella di dettaglio giornaliero. IMPORTANTE: l'occupazione e' valorizzata anche per i giorni passati perche' calcolata dalla disponibilita' (daily_availability), non dalla produzione fiscale. E' una funzionalita' del modulo Accelerator (a pagamento).",
    features: [
      "Selettori in alto: Tipologia camera, Tariffa, Occupanti (n. persone) e mese di riferimento",
      "Opzione 'Intera struttura' nel filtro tipologia: mostra la tariffa MEDIA tra tutte le camere e l'occupazione di struttura (utile per una vista d'insieme)",
      "KPI riepilogativi: tariffa media del periodo, tariffa minima e massima, occupazione media",
      "Grafico combinato: linea della tariffa nel tempo + barre dell'occupazione % giorno per giorno, sullo stesso asse temporale",
      "Tabella 'Dettaglio giornaliero': per ogni data mostra prezzo di partenza, prezzo attuale, variazione %, numero di modifiche, occupazione % e una mini-sparkline dell'evoluzione",
      "CLIC SU UNA RIGA del dettaglio giornaliero: apre un dialog che mostra l'evoluzione nel tempo di quel singolo giorno -- sia la curva della tariffa (dallo storico delle variazioni) sia la curva di PICKUP dell'occupazione (come si e' riempita quella data nel tempo, ricostruita dalle prenotazioni)",
      "L'occupazione storica e' corretta anche per i giorni passati (deriva da total_rooms - rooms_out_of_service - rooms_available), non e' azzerata",
      "I dati di evoluzione tariffa provengono dallo storico delle variazioni (price_change_log), gli stessi del tooltip in Gestione Prezzi",
      "Funzionalita' del modulo Accelerator: richiede abbonamento attivo",
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
  "/settings/rate-limits": {
    title: "Limiti Tariffari",
    description: "Imposta i limiti minimi e massimi per le tariffe delle tue camere. Questi limiti impediscono all'algoritmo di pricing di suggerire prezzi troppo bassi o troppo alti.",
    features: [
      "Tariffa minima per tipologia camera",
      "Tariffa massima per tipologia camera",
      "I limiti vengono rispettati dall'algoritmo di pricing dinamico",
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
  "/admin/dashboard": {
    title: "Dashboard Admin",
    description: "La dashboard Admin mostra una panoramica operativa delle strutture sotto la tua gestione con metriche aggregate, stato sincronizzazione PMS e strumenti di monitoraggio.",
    features: [
      "Panoramica strutture gestite con stato attivo/inattivo",
      "Metriche aggregate: occupazione media, revenue totale, prenotazioni",
      "Stato sincronizzazione PMS per ogni struttura",
      "Monitoraggio errori e alert",
    ],
  },
  "/admin/performance": {
    title: "Performance Admin",
    description: "Analisi delle performance delle strutture sotto gestione con KPI aggregati, classifiche e confronti tra strutture.",
    features: [
      "KPI aggregati multi-struttura: occupazione, ADR, RevPAR",
      "Classifica strutture per performance",
      "Confronti tra strutture dello stesso portfolio",
      "Report performance esportabile",
    ],
  },
  "/accelerator/pace": {
    title: "Booking Pace",
    description: "La pagina Booking Pace mostra il ritmo di prenotazione (on-the-books) per le notti future, confrontato con lo STESSO momento dell'anno scorso (STLY, Same Time Last Year). Permette di capire se stai vendendo piu' velocemente o piu' lentamente dell'anno precedente a parita' di anticipo. Si seleziona l'orizzonte (prossimi 30/90/180/365 giorni) e si analizzano camere, ricavo e ADR gia' a libro, il pickup recente e la curva di prenotazione. E' una funzionalita' del modulo Accelerator (a pagamento).",
    features: [
      "Selettore orizzonte: prossimi 30, 90, 180 o 365 giorni",
      "Lettura automatica (insight): una frase chiara che interpreta i numeri, distinguendo i casi 'meno camere ma piu' ricavo' (positivo) da 'piu' camere ma ricavo sotto' (attenzione tariffa)",
      "KPI on-the-books: Camere a libro, Ricavo a libro, ADR a libro, ciascuno confrontato con lo stesso anticipo dell'anno scorso (STLY) con variazione %",
      "Pickup: camere acquisite negli ultimi 7 / 14 / 30 giorni",
      "Curva di prenotazione: grafico dell'accumulo di camere o ricavo avvicinandosi al periodo, con linea tratteggiata dell'anno scorso allo STESSO anticipo (non il totale finale)",
      "Toggle metrica Camere / Ricavo sui grafici",
      "Tabella On-the-books per mese: camere, ricavo, ADR del mese vs anno scorso, con variazioni e delta ADR",
      "Richiede il modulo Booking Pace attivo (addon Accelerator)",
    ],
  },
  "/accelerator/rate-shopper": {
    title: "Rate Shopper",
    description: "Il Rate Shopper confronta i tuoi prezzi con quelli del comp set (i competitor che scegli), giorno per giorno, per i prossimi 30/60/90 giorni. Per ogni notte mostra il tuo prezzo, i prezzi dei competitor, il mercato (minimo, mediana, massimo), il tuo scostamento dalla mediana e il posizionamento. I prezzi competitor si inseriscono manualmente, via import CSV o con feed automatico. E' una funzionalita' del modulo Accelerator (a pagamento).",
    features: [
      "Gestione comp set: aggiungi/rimuovi i competitor da monitorare (bottone 'Competitor')",
      "Due viste: 'Per notte' (confronto sulla tariffa piu' bassa disponibile / lead-in) e 'Per tipologia' (la tua camera vs la camera equivalente mappata di ogni competitor)",
      "Selettori: numero ospiti (1-4) e orizzonte (prossimi 30/60/90 giorni)",
      "Tabella giornaliera: il tuo prezzo (cella colorata verde se sotto la mediana = competitivo, rossa crescente se sopra), prezzi competitor, mediana di mercato e scostamento %",
      "Riepilogo: giorni confrontati, scostamento medio vs mediana, giorni in cui sei piu' economico / piu' caro del mercato",
      "Associa tipologie: collega fino a 3 tue camere alle camere equivalenti dei competitor rilevate (per il confronto per tipologia)",
      "Aggiornamento prezzi: refresh automatico al primo accesso giornaliero se la fonte e' obsoleta, piu' un cron settimanale come baseline; supporta inserimento manuale, import CSV e feed automatico",
      "Richiede il modulo Rate Shopper attivo (addon Accelerator)",
    ],
  },
  "/dati/analytics": {
    title: "Analytics",
    description: "La pagina Analytics offre analisi avanzate sulle performance della struttura: distribuzione del revenue e della produzione per giorno della settimana, per canale, lead time di prenotazione, lunghezza del soggiorno e altri tagli. Il revenue 'per prenotazione' usa la data di prenotazione (booking_date), mentre la 'produzione' usa la data-notte: sono due viste diverse degli stessi ricavi.",
    features: [
      "Revenue per giorno della settimana (in base alla data di PRENOTAZIONE)",
      "Produzione per giorno della settimana (in base alla data-NOTTE / soggiorno)",
      "Analisi per canale di vendita e mix dei canali",
      "Distribuzione lead time (anticipo di prenotazione) e lunghezza media del soggiorno",
      "Confronti su periodo selezionabile",
      "I dati provengono dalle prenotazioni reali e dalla produzione giornaliera normalizzate dal PMS",
    ],
  },
  "/dati/performance-ota": {
    title: "Performance OTA",
    description: "La pagina Performance OTA analizza le performance sui canali OTA (Booking.com, Expedia, ecc.) combinando KPI inseriti manualmente (es. dati dall'extranet Booking.com) con il mix canale calcolato dal database interno delle prenotazioni.",
    features: [
      "KPI OTA manuali: inserisci i dati di performance dall'extranet (es. Booking.com)",
      "Mix canale calcolato dal database interno delle prenotazioni",
      "Confronto contributo dei vari canali OTA vs diretto",
      "Analisi su periodo selezionabile",
    ],
  },
  "/dati/guard": {
    title: "Guard - Controlli Prenotazioni",
    description: "Guard esegue controlli di qualita' sulle prenotazioni sincronizzate per individuare anomalie: prenotazioni con dati mancanti, importi incoerenti, mappature camera/tariffa non risolte, o disallineamenti rispetto al PMS. Aiuta a tenere puliti i dati su cui si basano dashboard e pricing.",
    features: [
      "Lista dei controlli sulle prenotazioni con esito",
      "Segnalazione anomalie: dati mancanti, importi incoerenti, mappature non risolte",
      "Verifica allineamento tra i dati Santaddeo e il PMS",
      "Utile per diagnosticare incoerenze nei KPI prima di prendere decisioni",
    ],
  },
  "/dati/reviews": {
    title: "Recensioni",
    description: "La pagina Recensioni raccoglie e monitora le recensioni della struttura provenienti dai portali, con punteggi, andamento nel tempo e dettaglio per fonte. Permette di tenere sotto controllo la reputazione online, che incide su domanda e potere di pricing.",
    features: [
      "Elenco recensioni con punteggio e fonte",
      "Andamento del punteggio medio nel tempo",
      "Dettaglio per portale / canale di provenienza",
      "Monitoraggio reputazione online della struttura",
    ],
  },
  "/dati/commissioni-fatture": {
    title: "Commissioni e Fatture",
    description: "La pagina mostra l'archivio delle fatture per anno e il calcolo delle commissioni collegate. Utile per la riconciliazione tra produzione, fatturazione e commissioni (es. canali OTA o consulenza a commissione).",
    features: [
      "Archivio fatture per anno con navigazione",
      "Dettaglio importi e collegamento alle commissioni",
      "Riconciliazione tra produzione, fatture e commissioni",
    ],
  },
  "/accelerator/events": {
    title: "Eventi",
    description: "La pagina Eventi raccoglie gli eventi locali rilevanti per la domanda (fiere, concerti, festivita', manifestazioni) che possono influenzare il pricing dinamico. Gli eventi sono una delle variabili che l'algoritmo Advanced puo' usare per suggerire tariffe piu' alte nei periodi di alta domanda.",
    features: [
      "Calendario / elenco degli eventi locali per data",
      "Gli eventi alimentano la variabile 'eventi' del pricing dinamico",
      "Aiuta a impostare tariffe coerenti con i picchi di domanda",
    ],
  },
  "/sales/playbook": {
    title: "Disco Vendita (Playbook)",
    description: "Il Disco Vendita e' lo strumento per la rete commerciale Santaddeo: contiene lo script di vendita, gli argomenti chiave, la gestione delle obiezioni e i passaggi per presentare la piattaforma ai potenziali clienti. E' una sezione riservata ai venditori, non agli hotel clienti.",
    features: [
      "Script di vendita passo-passo",
      "Argomenti chiave e value proposition della piattaforma",
      "Gestione delle obiezioni piu' comuni",
      "Materiale di supporto per la presentazione ai prospect",
    ],
  },
  "/superadmin/payments": {
    title: "Gestione Pagamenti",
    description: "Pagina riservata al SuperAdmin per gestire i pagamenti dei clienti. Ha due schede: 'Registro Pagamenti' per registrare i pagamenti riga per riga o importarli da estratto conto bancario (con riconoscimento AI), e 'Pagamenti su Fatture' che mantiene i pagamenti collegati alle fatture in archivio.",
    features: [
      "Scheda Registro Pagamenti: inserimento manuale riga per riga (data, struttura, importo, metodo, causale)",
      "Import da estratto conto bancario con riconoscimento automatico AI delle righe",
      "Modifica in-line di una riga del registro (dialog precompilato) ed eliminazione",
      "Esporta CSV del registro filtrato",
      "Scheda Pagamenti su Fatture: pagamenti collegati alle fatture in archivio",
      "Sezione riservata al SuperAdmin",
    ],
  },
  "/accelerator/commercial-balance": {
    title: "Bilancio Commerciale",
    description: "La pagina Bilancio Commerciale mostra, giorno per giorno, il ritmo dell'attivita' di vendita sull'asse della DATA DI PRENOTAZIONE (non della data di soggiorno): le prenotazioni RICEVUTE (per booking_date), quelle CANCELLATE (per cancellation_date) e il SALDO netto. Ogni voce e' espressa in 3 metriche: numero prenotazioni, produzione netta in EUR e room-nights. Include il RevPOR medio delle prenotazioni entrate e una valutazione che dice se il ritmo attuale permette di raggiungere gli obiettivi, mettendo in relazione obiettivo, soggiorno medio (LOS) e lead time. E' una funzionalita' del modulo Accelerator (addon Booking Pace).",
    features: [
      "Selettore intervallo date (default ultimi ~60 giorni di attivita') per l'hotel selezionato",
      "3 card riepilogative: Ricevute, Cancellate, Saldo netto del periodo (numero prenotazioni, produzione netta EUR, room-nights)",
      "RevPOR medio delle prenotazioni entrate (produzione netta ricevuta / room-nights ricevute): come headline nella card Ricevute e come colonna giornaliera 'RevPOR ric.'",
      "Tabella ANDAMENTO GIORNALIERO: per ogni giorno mostra Ricevute EUR, RevPOR ricevute, Cancellate EUR, Saldo netto e una colonna VALUTAZIONE (semaforo)",
      "Colonna Valutazione per riga: media mobile 7 giorni del saldo netto confrontata con il ritmo richiesto -> In linea / A rischio / Fuori linea",
      "Pannello SINTESI per mese di soggiorno: per ogni mese ancora 'in raccolta' calcola Gap EUR (Obiettivo - OTB) -> notti mancanti (via ADR) -> prenotazioni mancanti (via LOS), e confronta il ritmo richiesto (gap / giorni rimanenti fino a fine mese) con il ritmo netto attuale",
      "Soggiorno medio (LOS) e lead time medio calcolati dai dati reali delle prenotazioni della struttura",
      "Produzione NETTA (ricavo camera, al netto di extra/F&B/spa) coerente con la pagina Obiettivi",
      "Avviso esplicito quando il PMS non data le cancellazioni (es. bridge BRiG): in quel caso la colonna Cancellate per giorno non e' attendibile",
      "Richiede il modulo Booking Pace attivo (addon Accelerator)",
    ],
  },
  "/accelerator/revman": {
    title: "Area Revenue Manager",
    description: "L'Area Revenue Manager e' lo spazio di collaborazione tra la struttura e il consulente revenue di SANTADDEO (Taddeo). Qui trovi le conversazioni con il consulente, le attivita' in corso, i file condivisi e lo storico delle chat. E' il punto di contatto per ricevere supporto strategico sul revenue management della tua struttura.",
    features: [
      "Conversazioni con il consulente revenue (chat Taddeo) con storico completo",
      "Elenco delle attivita' in corso concordate con il consulente",
      "File condivisi tra struttura e consulente (report, analisi, documenti)",
      "Richiede di selezionare un hotel per visualizzare l'area dedicata",
      "Punto di accesso al supporto strategico di revenue management",
    ],
  },
  "/calendar": {
    title: "Calendario Disponibilita'",
    description: "Il Calendario Disponibilita' mostra, mese per mese, lo stato di occupazione della struttura: camere vendute, camere disponibili e percentuale di occupazione per ogni giorno. I dati provengono dalla disponibilita' sincronizzata dal PMS (daily_availability). In alto e' indicato lo stato dell'ultima sincronizzazione.",
    features: [
      "Vista calendario mensile con occupazione giornaliera",
      "Per ogni giorno: camere vendute, camere disponibili e percentuale di occupazione",
      "Colori che evidenziano i giorni a bassa/alta occupazione",
      "Indicatore di stato dell'ultima sincronizzazione PMS",
      "Navigazione tra i mesi avanti/indietro",
      "L'occupazione e' calcolata dalla disponibilita' (daily_availability) ed e' coerente con le altre pagine dati",
    ],
  },
  "/settings/notifications": {
    title: "Notifiche",
    description: "La pagina Notifiche permette di configurare come e quando ricevere gli avvisi della piattaforma: notifiche sulle variazioni di prezzo, sugli alert KPI, sulle sincronizzazioni PMS e sugli eventi rilevanti. Puoi scegliere i canali (es. email) e personalizzare le preferenze per tipologia di camera.",
    features: [
      "Attivazione/disattivazione delle notifiche per categoria (prezzi, alert KPI, sincronizzazioni)",
      "Scelta dei canali di recapito (es. email)",
      "Preferenze per tipologia di camera quando applicabile",
      "Legata alla modalita' autopilot del pricing: in modalita' 'notify' qui arrivano le email con le variazioni di prezzo proposte",
      "Salvataggio delle preferenze con bottone dedicato",
    ],
  },
}

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
 * Load auto-generated features from build-time JSON.
 * Generated by scripts/generate-page-guides-auto.js during prebuild.
 */
let _autoGuides: Record<string, { features: string[] }> | null = null

function getAutoGuides(): Record<string, { features: string[] }> {
  if (_autoGuides !== null) return _autoGuides
  try {
    // This JSON is generated at build-time by scripts/generate-page-guides-auto.js
    // It scans all page.tsx files + their imported components for UI elements
    _autoGuides = require("./page-guides-auto.json")
  } catch {
    _autoGuides = {}
  }
  return _autoGuides!
}

/**
 * Get full context string for AI about the current page.
 * 
 * Merges 3 sources (in priority order):
 * 1. Static PAGE_GUIDES (hand-written, highest quality descriptions)
 * 2. Auto-generated JSON from build-time scan (buttons, tabs, dialogs extracted from source code)
 * 3. Falls back to generic context if neither exists
 * 
 * The auto-generated JSON is refreshed on every deploy (prebuild step),
 * so new features added to pages are automatically reflected in the guide.
 */
export function getPageContext(pathname: string): string {
  const guide = getPageGuide(pathname)
  const autoGuides = getAutoGuides()

  // Find auto-generated features (try exact match, then without route groups)
  const autoEntry = autoGuides[pathname] || autoGuides[pathname.replace(/^\//, "")]

  if (!guide && !autoEntry) {
    return `L'utente si trova sulla pagina ${pathname} della piattaforma SANTADDEO per il revenue management alberghiero.`
  }

  const title = guide?.title || pathname.split("/").filter(Boolean).pop() || pathname
  const description = guide?.description || `Pagina ${pathname} della piattaforma SANTADDEO.`

  // Merge static features with auto-generated features
  const staticFeatures = guide?.features || []
  const allFeatures = [...staticFeatures]

  if (autoEntry?.features) {
    for (const af of autoEntry.features) {
      // Only add auto-features not already covered by static ones
      const afLower = af.toLowerCase()
      const alreadyCovered = staticFeatures.some((sf) => {
        const sfLower = sf.toLowerCase()
        return sfLower.includes(afLower.slice(0, 20)) || afLower.includes(sfLower.slice(0, 20))
      })
      if (!alreadyCovered) allFeatures.push(`[auto] ${af}`)
    }
  }

  return `L'utente si trova sulla pagina "${title}" (${pathname}) della piattaforma SANTADDEO.

Descrizione pagina: ${description}

Funzionalita' disponibili in questa pagina:
${allFeatures.map((f) => `- ${f}`).join("\n")}

SANTADDEO e' una piattaforma di revenue management per strutture ricettive che si integra con i PMS (Property Management System) per fornire analisi, previsioni e strumenti di pricing dinamico.

REGOLE PER LE RISPOSTE:
- Rispondi SOLO basandoti sulle funzionalita' elencate sopra. NON inventare funzionalita' che non esistono.
- Se non sei sicuro che una funzionalita' esista, dillo chiaramente e aggiungi [UNCERTAIN].
- Guida l'utente passo per passo basandoti su come la pagina funziona realmente.
- Le voci marcate [auto] sono state estratte automaticamente dal codice sorgente e descrivono elementi UI reali della pagina.`
}
