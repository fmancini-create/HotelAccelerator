/**
 * Glossario terminologie alberghiere e della piattaforma SANTADDEO.
 *
 * Le voci sono organizzate per categoria. La pagina /sales/glossary
 * mostra ricerca full-text e filtri per categoria.
 *
 * Quando si aggiunge una nuova feature alla piattaforma con
 * terminologia non ovvia, ricordarsi di aggiornare questo file.
 */

export type GlossaryCategory =
  | "revenue"
  | "ota"
  | "operations"
  | "pms"
  | "platform"
  | "commerciale"

export type GlossaryEntry = {
  term: string
  /** Acronimo o forma estesa, es. "Average Daily Rate" per ADR */
  acronym?: string
  category: GlossaryCategory
  short: string
  /** Descrizione lunga, opzionale, mostrata in espansione */
  long?: string
  /** Esempio pratico per facilitare la comprensione */
  example?: string
  /** Termini correlati (referenza per term match) */
  related?: string[]
  /**
   * Sinonimi o nomi alternativi con cui si trova lo stesso concetto
   * (es. ADR e' spesso chiamato ARR o RevPOR). Mostrati come badge
   * e indicizzati nella ricerca.
   */
  synonyms?: string[]
  /**
   * Etimologia / scomposizione del termine: da dove deriva l'acronimo
   * o la parola, tradotto pezzo per pezzo.
   * Es. "RevPOR = Revenue Per Occupied Room (ricavo per camera occupata)".
   */
  etymology?: string
}

export const CATEGORIES: { value: GlossaryCategory; label: string; description: string }[] = [
  {
    value: "revenue",
    label: "Revenue Management",
    description: "Indicatori, KPI e concetti di ricavo / pricing",
  },
  {
    value: "ota",
    label: "OTA & Distribuzione",
    description: "Canali online, channel manager, parita' tariffaria",
  },
  {
    value: "operations",
    label: "Operations & Front Office",
    description: "Operativita' giornaliera, housekeeping, check-in / check-out",
  },
  {
    value: "pms",
    label: "PMS & Connettori",
    description: "Property Management System e integrazioni tecniche",
  },
  {
    value: "platform",
    label: "Piattaforma SANTADDEO",
    description: "Termini specifici dei moduli e dei flussi del nostro prodotto",
  },
  {
    value: "commerciale",
    label: "Area Commerciale",
    description: "CRM venditori, prospect, commissioni, pipeline",
  },
]

export const GLOSSARY: GlossaryEntry[] = [
  // ============== REVENUE MANAGEMENT ==============
  {
    term: "ADR",
    acronym: "Average Daily Rate",
    category: "revenue",
    short: "Tariffa media giornaliera per camera venduta.",
    long: "L'ADR si calcola come ricavo camere diviso il numero di camere vendute. Misura quanto in media stiamo facendo pagare ogni camera occupata, escludendo le camere invendute. Si confronta tipicamente con lo stesso periodo dell'anno precedente.",
    example: "Se in una notte vendiamo 30 camere a un totale di 4.500 EUR, l'ADR e' 150 EUR.",
    etymology: "ADR = Average Daily Rate, letteralmente 'tariffa media giornaliera'.",
    synonyms: ["ARR", "RevPOR"],
    related: ["RevPAR", "Occupancy", "TRevPAR", "ARR", "RevPOR"],
  },
  {
    term: "ARR",
    acronym: "Average Room Rate",
    category: "revenue",
    short: "Tariffa media per camera: sinonimo di ADR.",
    long: "ARR e ADR indicano esattamente lo stesso valore (ricavo camere diviso camere vendute). 'ARR' e' la dicitura piu' usata nel Regno Unito e in parte del settore corporate, 'ADR' quella prevalente a livello internazionale e nei report delle OTA.",
    etymology: "ARR = Average Room Rate, letteralmente 'tariffa media camera'.",
    synonyms: ["ADR"],
    related: ["ADR", "RevPAR"],
  },
  {
    term: "RevPOR",
    acronym: "Revenue Per Occupied Room",
    category: "revenue",
    short: "Ricavo per camera occupata. Spesso usato come sinonimo di ADR.",
    long: "Il RevPOR misura il ricavo medio generato da ogni camera effettivamente occupata. Se si considera il solo ricavo camere coincide con l'ADR; se include anche gli extra per camera (colazione, minibar, servizi) diventa una misura piu' ampia di quanto rende ciascun soggiorno. Per questo nel linguaggio comune ADR e RevPOR vengono spesso scambiati.",
    etymology: "RevPOR = Revenue Per Occupied Room, letteralmente 'ricavo per camera occupata'.",
    synonyms: ["ADR"],
    related: ["ADR", "TRevPAR", "RevPAR"],
  },
  {
    term: "RevPAR",
    acronym: "Revenue Per Available Room",
    category: "revenue",
    short: "Ricavo medio per camera disponibile (occupata o non).",
    long: "Indicatore principe del revenue management. Si calcola come ricavo camere diviso il totale camere disponibili, oppure come ADR moltiplicato per Occupancy. Sale solo se aumenti le tariffe o l'occupazione, quindi e' lo specchio piu' onesto della performance.",
    example: "Hotel con 50 camere, 30 vendute a 150 EUR = 4.500 EUR ricavo / 50 camere = RevPAR 90 EUR.",
    etymology: "RevPAR = Revenue Per Available Room, letteralmente 'ricavo per camera disponibile'. Attenzione alla differenza con RevPOR: qui il divisore sono le camere DISPONIBILI, non quelle occupate.",
    related: ["ADR", "Occupancy", "TRevPAR", "RevPOR"],
  },
  {
    term: "TRevPAR",
    acronym: "Total Revenue Per Available Room",
    category: "revenue",
    short: "Ricavo totale (camere + extra) per camera disponibile.",
    long: "Estende il RevPAR includendo F&B, SPA, parcheggio, servizi extra. Importante per strutture con forte componente non-camera (resort, hotel SPA).",
    etymology: "TRevPAR = Total Revenue Per Available Room, letteralmente 'ricavo totale per camera disponibile'. La 'T' di Total e' cio' che lo distingue dal RevPAR (solo camere).",
    synonyms: ["RevPAR totale"],
    related: ["RevPAR", "ADR", "GOPPAR"],
  },
  {
    term: "GOPPAR",
    acronym: "Gross Operating Profit Per Available Room",
    category: "revenue",
    short: "Profitto operativo lordo per camera disponibile.",
    long: "A differenza di RevPAR e TRevPAR che guardano solo i ricavi, il GOPPAR considera anche i costi operativi: e' quindi la metrica piu' vicina alla redditivita' reale della struttura. Molto usato da catene e fondi di investimento.",
    etymology: "GOPPAR = Gross Operating Profit Per Available Room, letteralmente 'profitto operativo lordo per camera disponibile'.",
    related: ["RevPAR", "TRevPAR"],
  },
  {
    term: "Occupancy",
    acronym: "Occupancy Rate",
    category: "revenue",
    short: "Percentuale di camere vendute sul totale disponibili.",
    example: "30 camere vendute su 50 disponibili = 60% di Occupancy.",
    etymology: "Dall'inglese 'occupancy' (occupazione). In italiano 'tasso di occupazione', spesso abbreviato OCC.",
    synonyms: ["OCC", "Tasso di occupazione", "Saturazione"],
    related: ["ADR", "RevPAR"],
  },
  {
    term: "Pickup",
    category: "revenue",
    short: "Numero di prenotazioni acquisite in un certo intervallo di tempo.",
    long: "Il pickup misura quante nuove prenotazioni sono entrate, ad esempio nelle ultime 24 ore o negli ultimi 7 giorni, per un determinato periodo di soggiorno. Serve a capire se la domanda sta accelerando o rallentando.",
    example: "Pickup 24h per agosto: +12 prenotazioni significa che ieri abbiamo preso 12 nuove camere per agosto.",
    etymology: "Dall'inglese 'to pick up' (raccogliere). E' cio' che si e' 'raccolto' in termini di nuove prenotazioni.",
    synonyms: ["Acquisizione"],
  },
  {
    term: "Pace",
    category: "revenue",
    short: "Velocita' di acquisizione delle prenotazioni rispetto allo stesso periodo dell'anno scorso.",
    long: "Se a 60 giorni dal soggiorno quest'anno abbiamo gia' venduto il 40% delle camere e l'anno scorso solo il 30%, abbiamo un pace positivo del 10%. Indica se siamo in vantaggio o in ritardo.",
    etymology: "Dall'inglese 'pace' (ritmo, andatura): il ritmo con cui si riempie un periodo.",
    synonyms: ["Booking pace", "Ritmo di vendita"],
    related: ["Pickup", "OTB"],
  },
  {
    term: "On the books",
    acronym: "OTB",
    category: "revenue",
    short: "Prenotazioni gia' acquisite a oggi per un periodo futuro.",
    long: "L'OTB e' la fotografia del 'venduto fino a questo momento'. Si usa sempre confrontandolo con il pace e con il forecast di chiusura.",
    etymology: "On The Books, letteralmente 'sui libri (contabili)': cio' che e' gia' registrato come venduto.",
    synonyms: ["Venduto", "OTB"],
    related: ["Pace", "Forecast", "Pickup"],
  },
  {
    term: "Forecast",
    category: "revenue",
    short: "Previsione di occupazione e ricavo a chiusura del periodo.",
    long: "Il forecast e' calcolato dall'algoritmo SANTADDEO unendo OTB, pickup storico, eventi e stagionalita'. E' la base per decidere i prezzi futuri.",
    related: ["Pickup", "Pace", "OTB"],
  },
  {
    term: "Pricing dinamico",
    category: "revenue",
    short: "Sistema che aggiorna i prezzi in tempo reale in base a domanda, eventi e concorrenza.",
    long: "L'algoritmo SANTADDEO ricalcola i prezzi piu' volte al giorno e li spinge a tutti i canali via PMS / channel manager. Tiene conto di occupazione attuale, pickup, eventi locali, prezzi competitor e regole personalizzate dell'hotel.",
  },
  {
    term: "BAR",
    acronym: "Best Available Rate",
    category: "revenue",
    short: "Tariffa migliore disponibile per la data, senza restrizioni o sconti.",
    long: "E' la tariffa pubblica di riferimento. Tutte le altre tariffe (non rimborsabile, weekend, package) si calcolano come scostamento dalla BAR. Da non confondere con la Rack Rate, che e' invece la tariffa massima di listino.",
    etymology: "BAR = Best Available Rate, letteralmente 'migliore tariffa disponibile'.",
    synonyms: ["Tariffa flessibile", "Tariffa di riferimento"],
    related: ["Rack Rate"],
  },
  {
    term: "Rack Rate",
    category: "revenue",
    short: "Tariffa ufficiale massima di listino, senza alcuno sconto.",
    long: "E' il prezzo 'pieno' esposto, da cui partono tutte le scontistiche. Raramente venduta davvero, serve come riferimento alto. Diversa dalla BAR, che e' la migliore tariffa effettivamente disponibile per la data.",
    etymology: "Dall'inglese 'rack' (rastrelliera): un tempo le tariffe erano esposte su una rastrelliera alla reception.",
    synonyms: ["Tariffa di listino", "Tariffa piena"],
    related: ["BAR"],
  },
  {
    term: "LOS",
    acronym: "Length of Stay",
    category: "revenue",
    short: "Durata media del soggiorno in notti.",
    long: "Si possono impostare restrizioni MinLOS (soggiorno minimo) o MaxLOS (massimo) per gestire l'occupazione: ad esempio MinLOS 2 il sabato per evitare il singolo notte.",
  },
  {
    term: "MinLOS",
    acronym: "Minimum Length of Stay",
    category: "revenue",
    short: "Soggiorno minimo richiesto per poter prenotare una data.",
    example: "MinLOS 3 sul ponte del 1 maggio: l'ospite deve prenotare almeno 3 notti per poter includere quella data.",
    related: ["LOS", "CTA", "CTD"],
  },
  {
    term: "CTA",
    acronym: "Closed To Arrival",
    category: "revenue",
    short: "Data chiusa agli arrivi: l'ospite non puo' fare check-in quel giorno.",
    long: "Restrizione utile per evitare arrivi in giornate critiche (es. di passaggio fra eventi).",
    related: ["CTD", "MinLOS"],
  },
  {
    term: "CTD",
    acronym: "Closed To Departure",
    category: "revenue",
    short: "Data chiusa alle partenze: l'ospite non puo' fare check-out quel giorno.",
    related: ["CTA"],
  },
  {
    term: "Yield management",
    category: "revenue",
    short: "Disciplina di massimizzazione del ricavo modulando prezzo e disponibilita'.",
    long: "Concetto storico nato nell'aviazione. Il revenue management alberghiero ne e' l'evoluzione moderna.",
  },
  {
    term: "Lead time",
    category: "revenue",
    short: "Giorni di anticipo fra prenotazione e arrivo.",
    long: "Un lead time corto (es. last minute) richiede strategie di pricing diverse rispetto a un lead time lungo. La piattaforma analizza il lead time medio per segmento.",
    etymology: "Dall'inglese 'lead time' (tempo di attesa/anticipo), termine preso dalla logistica.",
    synonyms: ["Booking window", "Anticipo di prenotazione", "Finestra di prenotazione"],
  },
  {
    term: "Last minute",
    category: "revenue",
    short: "Prenotazione effettuata pochi giorni o ore prima dell'arrivo.",
    long: "Il modello last minute SANTADDEO analizza il pickup degli ultimi 7-14 giorni per decidere se conviene scontare, mantenere o alzare il prezzo a ridosso della data.",
  },

  // ============== OTA & DISTRIBUZIONE ==============
  {
    term: "OTA",
    acronym: "Online Travel Agency",
    category: "ota",
    short: "Agenzia di viaggi online (Booking, Expedia, Airbnb, ecc.).",
    long: "Le OTA distribuiscono camere a fronte di una commissione (tipicamente 15-25%). Sono il canale principale di acquisizione per la maggior parte degli hotel italiani.",
    etymology: "OTA = Online Travel Agency, letteralmente 'agenzia di viaggi online'.",
    synonyms: ["Intermediario online", "Portale"],
    related: ["Channel Manager", "Direct Booking"],
  },
  {
    term: "Channel Manager",
    acronym: "CM",
    category: "ota",
    short: "Software che sincronizza disponibilita' e prezzi su tutte le OTA.",
    long: "Quando vendiamo una camera su Booking, il channel manager la chiude su Expedia e sul sito diretto, e viceversa. SANTADDEO si integra con i principali channel manager italiani via PMS.",
    etymology: "Dall'inglese 'channel' (canale) + 'manager' (gestore): il gestore dei canali di vendita.",
    synonyms: ["CM", "Gestore canali"],
  },
  {
    term: "Rate Parity",
    acronym: "Parita' tariffaria",
    category: "ota",
    short: "Obbligo (contrattuale o di buon senso) di mantenere lo stesso prezzo su tutti i canali pubblici.",
    long: "Vietata in Italia la parita' contrattuale stretta dal 2017, ma le OTA monitorano comunque i siti diretti e penalizzano chi e' troppo aggressivo. SANTADDEO ti aiuta a tenerla sotto controllo.",
  },
  {
    term: "Disparity",
    category: "ota",
    short: "Quando lo stesso hotel mostra prezzi diversi su canali diversi.",
    long: "Puo' essere voluta (incentivo al diretto) o accidentale (errore di sync). La disparity accidentale viene segnalata in dashboard come alert.",
  },
  {
    term: "Direct Booking",
    category: "ota",
    short: "Prenotazione fatta direttamente sul sito o telefono dell'hotel, senza commissioni OTA.",
    long: "E' il canale piu' redditizio. Una strategia di pricing intelligente cerca di spingere il diretto offrendo vantaggi non replicabili sulle OTA (colazione gratis, late check-out, ecc.).",
    etymology: "Dall'inglese 'direct booking' (prenotazione diretta).",
    synonyms: ["Diretto", "Disintermediato", "Vendita diretta"],
    related: ["OTA", "Disintermediazione"],
  },
  {
    term: "Disintermediazione",
    category: "ota",
    short: "Strategia di spostamento delle prenotazioni dalle OTA al canale diretto.",
    long: "Disintermediare significa ridurre la dipendenza dalle agenzie online per abbattere i costi di commissione, convertendo l'ospite acquisito via OTA in cliente diretto ai soggiorni successivi.",
    etymology: "Da 'dis-' (rimozione) + 'intermediazione': togliere l'intermediario (l'OTA) dalla vendita.",
    synonyms: ["Disintermediation"],
    related: ["Direct Booking", "OTA"],
  },
  {
    term: "Commissione OTA",
    category: "ota",
    short: "Percentuale che l'OTA trattiene sul prezzo della camera venduta.",
    example: "Booking.com tipicamente 15-18%, Expedia 15-25%, Airbnb 3-5% lato host.",
  },
  {
    term: "Genius",
    category: "ota",
    short: "Programma di fidelizzazione di Booking.com che applica sconti del 10-20% agli iscritti.",
    long: "Aderire al programma Genius aumenta la visibilita' ma riduce il margine. SANTADDEO mostra la quota di Genius sul totale prenotazioni Booking.",
  },
  {
    term: "GDS",
    acronym: "Global Distribution System",
    category: "ota",
    short: "Reti come Sabre, Amadeus, Travelport usate principalmente dal travel corporate.",
  },
  {
    term: "Metasearch",
    category: "ota",
    short: "Motori che confrontano i prezzi dell'hotel su piu' canali (Trivago, Google Hotel Ads, Kayak).",
    long: "Non vendono direttamente: rimandano all'OTA o al sito ufficiale. Sono fondamentali per la visibilita' del diretto.",
  },

  // ============== OPERATIONS ==============
  {
    term: "Check-in",
    category: "operations",
    short: "Procedura di accoglienza dell'ospite all'arrivo.",
  },
  {
    term: "Check-out",
    category: "operations",
    short: "Procedura di chiusura del soggiorno e fatturazione.",
  },
  {
    term: "Early check-in",
    category: "operations",
    short: "Check-in anticipato rispetto all'orario standard (tipicamente 14:00-15:00).",
  },
  {
    term: "Late check-out",
    category: "operations",
    short: "Check-out posticipato rispetto all'orario standard (tipicamente 11:00-12:00).",
  },
  {
    term: "No-show",
    category: "operations",
    short: "Ospite che non si presenta senza disdire.",
    long: "Tipicamente l'hotel addebita la prima notte come penale. Le no-show vanno tracciate per identificare clienti / canali problematici.",
    etymology: "Dall'inglese 'no show' (nessuna presentazione): chi non si fa vedere.",
    synonyms: ["Mancata presentazione"],
  },
  {
    term: "Walk-in",
    category: "operations",
    short: "Ospite che arriva senza prenotazione e chiede una camera al banco.",
    etymology: "Dall'inglese 'to walk in' (entrare): chi entra in hotel senza preavviso.",
    synonyms: ["Cliente di passaggio"],
  },
  {
    term: "Overbooking",
    category: "operations",
    short: "Vendita di piu' camere di quelle disponibili.",
    long: "Pratica comune e voluta per compensare le no-show. Va gestita con attenzione: se tutti si presentano, qualcuno deve essere spostato in un altro hotel a spese della struttura.",
  },
  {
    term: "Housekeeping",
    category: "operations",
    short: "Reparto pulizie e riassetto camere.",
    long: "Il riassetto delle camere e la loro disponibilita' per il check-in successivo. Lo stato delle camere (sporca / in pulizia / pronta) impatta direttamente sulla vendita e sull'orario di arrivo degli ospiti.",
  },

  // ============== PMS & CONNETTORI ==============
  {
    term: "PMS",
    acronym: "Property Management System",
    category: "pms",
    short: "Software gestionale dell'hotel: prenotazioni, fatturazione, anagrafiche, planning.",
    long: "E' il cuore operativo della struttura. SANTADDEO si integra con i principali PMS italiani via connettori dedicati.",
    related: ["Channel Manager"],
  },
  {
    term: "BRiG",
    category: "pms",
    short: "Uno dei PMS supportati da SANTADDEO, molto diffuso in Veneto e nord-est.",
  },
  {
    term: "Scidoo",
    category: "pms",
    short: "PMS supportato da SANTADDEO, frequente in strutture di medie dimensioni.",
  },
  {
    term: "Connettore",
    category: "pms",
    short: "Modulo software che sincronizza dati fra SANTADDEO e il PMS della struttura.",
    long: "Ogni connettore ha 2 direzioni: PULL (legge prenotazioni e occupazione dal PMS) e PUSH (manda prezzi e disponibilita' al PMS). I push falliti vengono ritentati automaticamente fino al successo.",
  },
  {
    term: "Sync",
    category: "pms",
    short: "Sincronizzazione automatica fra SANTADDEO e PMS, eseguita ogni N minuti dal cron.",
  },
  {
    term: "Mapping",
    category: "pms",
    short: "Associazione fra le tipologie di camera SANTADDEO e i codici interni del PMS.",
    long: "Ogni room type sulla piattaforma deve avere un brig_room_code (o equivalente) per poter inviare prezzi al PMS. Senza mapping il push fallisce.",
  },

  // ============== PIATTAFORMA ==============
  {
    term: "Autopilot",
    category: "platform",
    short: "Modalita' SANTADDEO in cui l'algoritmo aggiorna automaticamente i prezzi sul PMS.",
    long: "Si attiva per range di date e si puo' bloccare manualmente con override. Il sistema notifica all'admin ogni cambio significativo.",
  },
  {
    term: "Dashboard Hotel",
    category: "platform",
    short: "Pannello di controllo principale dell'albergatore: KPI, calendario, prezzi, recensioni.",
  },
  {
    term: "Superadmin",
    category: "platform",
    short: "Pannello tecnico riservato al team SANTADDEO per gestire tutti gli hotel, connettori, abbonamenti, venditori.",
  },
  {
    term: "Abbonamento",
    category: "platform",
    short: "Sottoscrizione mensile alla piattaforma, gestita via Stripe.",
    long: "Il prezzo base dipende dalla dimensione della struttura (numero camere). La fatturazione e il rinnovo sono automatici via Stripe.",
    related: ["Trial"],
  },
  {
    term: "Trial",
    category: "platform",
    short: "Periodo di prova gratuito (tipicamente 14 o 30 giorni) prima dell'addebito.",
  },

  // ============== AREA COMMERCIALE ==============
  {
    term: "Prospect",
    category: "commerciale",
    short: "Hotel potenziale cliente non ancora attivato in piattaforma.",
    long: "I prospect arrivano da liste pubbliche (es. portali turismo regionali) e vengono assegnati ai venditori per area geografica o categoria.",
    etymology: "Dal latino 'prospectus' (vista in avanti): un cliente 'in prospettiva', futuro.",
    synonyms: ["Potenziale cliente", "Nominativo"],
    related: ["Lead", "Pipeline"],
  },
  {
    term: "Lead",
    category: "commerciale",
    short: "Prospect che ha mostrato interesse e con cui e' stato avviato un dialogo commerciale.",
    long: "Un prospect diventa lead quando il venditore registra il primo contatto qualificato. Da li' entra nella pipeline.",
    related: ["Prospect", "Pipeline"],
  },
  {
    term: "Pipeline",
    category: "commerciale",
    short: "Vista a colonne con tutti i lead suddivisi per fase commerciale (Contatto, Demo, Proposta, Chiuso).",
    etymology: "Dall'inglese 'pipeline' (conduttura): il 'tubo' lungo cui scorrono le trattative dall'inizio alla chiusura.",
    synonyms: ["Imbuto di vendita", "Funnel"],
  },
  {
    term: "Capo Area",
    category: "commerciale",
    short: "Venditore senior che coordina un gruppo di agenti e riceve un override sulle loro commissioni.",
    long: "Gerarchia a 2 livelli: un capo area non puo' avere a sua volta un capo area sopra. L'override default e' del 15% sulle commissioni dei suoi agenti.",
    related: ["Override commissione"],
  },
  {
    term: "Override commissione",
    category: "commerciale",
    short: "Percentuale aggiuntiva che il capo area incassa sulle commissioni dei suoi venditori.",
    example: "Se l'agente prende il 30% e l'override e' 15%, il capo area incassa il 4,5% (15% del 30%) sullo stesso contratto.",
  },
  {
    term: "Commissione default",
    category: "commerciale",
    short: "Percentuale standard applicata al venditore sui contratti chiusi, modificabile per singolo hotel.",
  },
  {
    term: "Demo",
    category: "commerciale",
    short: "Presentazione live della piattaforma a un prospect.",
    long: "In SANTADDEO esiste anche la 'Modalita' Demo' (/demo): una vetrina navigabile dell'hotel demo Santaddeo per mostrare la piattaforma senza database reale, con popup descrittivi e voce narrante.",
  },
  {
    term: "Closing",
    category: "commerciale",
    short: "Chiusura positiva del contratto con conseguente attivazione della struttura.",
    etymology: "Dall'inglese 'to close' (chiudere): la chiusura della trattativa.",
    synonyms: ["Chiusura", "Firma"],
  },
  {
    term: "Onboarding",
    category: "commerciale",
    short: "Processo di attivazione di un nuovo hotel: setup PMS, mapping camere, formazione admin.",
  },
]
