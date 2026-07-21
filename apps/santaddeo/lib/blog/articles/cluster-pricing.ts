import type { BlogArticle } from "../types"

export const CLUSTER_PRICING: BlogArticle[] = [
  {
    slug: "pricing-dinamico-hotel",
    title: "Pricing dinamico hotel: come funziona davvero",
    description:
      "Cos'è il pricing dinamico per hotel, come si applica nella pratica e perché non è 'aumentare i prezzi' ma 'sincronizzarli con la domanda'.",
    keywords: ["pricing dinamico hotel", "dynamic pricing", "tariffe dinamiche hotel"],
    cluster: "pricing",
    publishedAt: "2026-04-29",
    readingMinutes: 6,
    relatedSlugs: ["come-aumentare-adr-hotel", "errori-pricing-hotel", "cose-un-rms-hotel"],
    lead:
      "Il pricing dinamico non è la stessa cosa di 'alzare i prezzi quando c'è domanda'. È sincronizzare il prezzo con la disponibilità a pagare reale dei clienti.",
    body: [
      {
        type: "p",
        text: "Il pricing dinamico è la disciplina di adattare il prezzo di vendita di una camera al variare di domanda, occupazione, tempo all'arrivo, eventi e contesto di mercato. È la norma da decenni in aviazione e da circa quindici anni nell'hôtellerie internazionale. Per molti albergatori italiani indipendenti è ancora un argomento controverso, spesso confuso con 'speculazione' o 'aumento dei prezzi'. La realtà è diversa: il pricing dinamico abbassa i prezzi tanto quanto li alza, semplicemente lo fa in base al segnale, non per stagionalità rigida.",
      },
      { type: "h2", text: "Perché il prezzo statico costa caro" },
      {
        type: "p",
        text: "Tenere lo stesso prezzo per 365 giorni con sole due o tre stagioni significa essere troppo cari nei giorni di domanda bassa (e perdere prenotazioni che andrebbero a un competitor più reattivo) e troppo economici nei giorni di domanda alta (e regalare ADR a clienti che avrebbero pagato di più). Studi sul mercato italiano stimano che un hotel con pricing statico lascia mediamente sul tavolo tra il 4% e il 9% del fatturato camere annuo rispetto allo stesso hotel con pricing dinamico.",
      },
      { type: "h2", text: "I quattro segnali che guidano un prezzo" },
      {
        type: "ul",
        items: [
          "Pickup recente: quanti booking sono entrati negli ultimi 7-14 giorni per quella data?",
          "Occupancy attuale: quanto sei pieno oggi per quella data, rispetto allo stesso lead time anno scorso?",
          "Mercato: cosa stanno facendo i tuoi competitor diretti su quella data?",
          "Calendario: ci sono eventi noti, festività, ponti, weekend lunghi?",
        ],
      },
      {
        type: "p",
        text: "Un buon pricing dinamico pesa questi quattro segnali con regole chiare. Non è una scatola nera magica: è un'equazione che puoi capire e modificare.",
      },
      { type: "h2", text: "Le tre strategie di pricing dinamico" },
      { type: "h3", text: "Strategia adattiva (la più comune)" },
      {
        type: "p",
        text: "Si parte da un prezzo base ragionevole e lo si aggiusta verso l'alto se l'occupazione cresce più veloce dell'anno scorso, verso il basso se è più lenta. È la strategia di default per la maggior parte degli hotel indipendenti, semplice da spiegare e da governare.",
      },
      { type: "h3", text: "Strategia push (per hotel forti del proprio brand)" },
      {
        type: "p",
        text: "Si parte alti e si scende solo se necessario. Funziona se il tuo hotel ha un posizionamento forte e clientela fedele. Massimizza ADR ma rischia su occupancy in periodi deboli.",
      },
      { type: "h3", text: "Strategia fill-first (per hotel di apertura o con pickup volatile)" },
      {
        type: "p",
        text: "Si parte bassi per riempire l'inventario rapidamente e si alzano i prezzi via via che l'occupazione sale. Massimizza occupancy ma rischia ADR. Ha senso in fase di lancio, dopo cambio di proprietà o quando si vuole riguadagnare quota.",
      },
      { type: "h2", text: "Errori frequenti nel pricing dinamico" },
      {
        type: "ul",
        items: [
          "Cambiare i prezzi solo guardando i competitor: ti rende eco, non leader.",
          "Non avere un pavimento minimo: l'algoritmo ti porta sotto i costi nei drop.",
          "Non avere un tetto massimo: prezzi assurdi su weekend di evento che spaventano i clienti diretti.",
          "Cambiare prezzo senza coordinare i canali: disallineamenti su Booking che generano disparity flag.",
          "Non lasciare margine al diretto: prezzo OTA = prezzo diretto azzera l'incentivo a prenotare dal sito.",
        ],
      },
      { type: "h2", text: "Come iniziare se sei a prezzo statico oggi" },
      {
        type: "p",
        text: "Il passaggio non deve essere brusco. Tre mesi di osservazione (dashboard senza automazione), due mesi di pricing notify (proposte via email, decidi tu), poi attivazione progressiva di una sola tipologia in autopilot, infine estensione a tutto il listino. Sei mesi totali per arrivare a regime, ma da subito vedi dove i prezzi statici ti fanno perdere soldi.",
      },
      {
        type: "cta",
        text: "Gestisci una struttura rurale? Scopri come funziona il revenue management per agriturismi, con le leve pensate per la stagionalità delle piccole strutture.",
        href: "/landing/agriturismi",
        label: "Revenue management per agriturismi",
      },
      {
        type: "cta",
        text: "Vuoi vedere se il pricing dinamico ti farebbe guadagnare di più? Inizia dalla dashboard.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "come-aumentare-adr-hotel",
    title: "Come aumentare l'ADR (Average Daily Rate) del tuo hotel",
    seoTitle: "Come aumentare l'ADR in hotel: 7 leve pratiche",
    description:
      "Cos'è l'ADR (Average Daily Rate) e come aumentarlo senza perdere occupancy: 7 leve operative con esempi numerici e quando applicarle.",
    keywords: [
      "aumentare adr hotel",
      "adr hotel",
      "adr significato hotel",
      "incrementare adr",
      "strategie adr",
    ],
    cluster: "pricing",
    publishedAt: "2026-05-02",
    readingMinutes: 7,
    relatedSlugs: ["pricing-dinamico-hotel", "cose-adr", "strategie-prezzo-alta-stagione"],
    lead:
      "L'ADR (Average Daily Rate) è il ricavo medio per camera venduta: aumentarlo senza perdere occupancy è il vero esercizio di revenue management. Ecco le sette leve che funzionano.",
    body: [
      {
        type: "p",
        text: "L'ADR (Average Daily Rate) è il ricavo medio per camera venduta e si calcola dividendo il fatturato camere per il numero di camere vendute: è la prima metrica su cui si guardano i risultati di un hotel, ma è anche la più facile da gonfiare male. Aumentarla a colpi di rincari ottiene un effetto immediato seguito da occupancy in calo, e tre mesi dopo il RevPAR è peggiore di prima. Aumentare l'ADR in modo sostenibile vuol dire muovere sette leve in parallelo, non una sola.",
      },
      {
        type: "cta",
        text: "Ti serve prima la definizione completa? Cos'è l'ADR, come si calcola e come si legge rispetto a RevPAR e occupazione.",
        href: "/blog/cose-adr",
        label: "Leggi: cos'è l'ADR",
      },
      { type: "h2", text: "1. Riduci la dipendenza dai canali a sconto" },
      {
        type: "p",
        text: "Ogni canale ha un'ADR media diversa. OTA come Booking ha un'ADR netta più bassa per via della commissione (15-18%). I siti di sconto come Travelzoo o flash deal hanno un'ADR ancora più bassa. Il diretto e i corporate negoziati con allotment hanno l'ADR più alta. Spostare anche solo 5 punti percentuali di mix da OTA a diretto fa salire l'ADR globale di 3-4 euro per camera, senza alzare nessun prezzo.",
      },
      { type: "h2", text: "2. Lavora sul mix di tipologia camera" },
      {
        type: "p",
        text: "Se vendi solo le camere standard e tieni le superior libere come buffer, hai ADR bassa per design. Spingi attivamente il fill delle tipologie superior con upgrade automatici, pricing aggressivo sulle standard nelle ultime 48 ore (per spingere chi cerca a prendere la superior), pacchetti che includono superior. Cambiare il mix da 70/30 a 60/40 vale 5-7 euro di ADR media.",
      },
      { type: "h2", text: "3. Aumenta il prezzo nei picchi che ignori" },
      {
        type: "p",
        text: "Quasi ogni hotel ha 8-12 weekend l'anno in cui sta fissando un prezzo standard mentre la città ha un evento sold-out. Costruisci un calendario eventi a 12 mesi e prezza quei giorni del 30-50% sopra il base. Un albergo medio recupera 3-5 punti di ADR annuale solo individuando questi picchi.",
      },
      { type: "h2", text: "4. Lavora sul lead time" },
      {
        type: "p",
        text: "Le prenotazioni a lungo termine sono mediamente più ADR-friendly di quelle last minute, perché l'algoritmo dei prezzi è settato più alto a lungo termine. Stimolare il long lead-time con promozioni 'prenota prima' al 10% non riduce l'ADR media, perché lo sconto è inferiore al gap tra prezzo a 90 giorni e prezzo a 7 giorni.",
      },
      { type: "h2", text: "5. Aumenta il valore percepito, non solo il prezzo" },
      {
        type: "ul",
        items: [
          "Includi colazione di qualità nel rate plan principale: aggiunge valore percepito a parità di prezzo nominale.",
          "Cura la presentazione fotografica delle camere superior: il differenziale di prezzo deve essere giustificato visivamente.",
          "Lavora sui review score: passare da 8.4 a 8.8 su Booking permette un +5-8% di ADR sostenibile.",
        ],
      },
      { type: "h2", text: "6. Pacchettizza con margine" },
      {
        type: "p",
        text: "Un pacchetto camera + cena + spa venduto a 280 euro con costo aggiuntivo di 60 euro (cena + spa) ha effettivamente camera a 220 euro, contro un prezzo standard di 180. Se il pacchetto si vende il 20% delle volte, la differenza pesata è di 8 euro di ADR media. Lavora con pacchetti che hanno costo marginale basso (servizi tuoi) e prezzo percepito alto.",
      },
      { type: "h2", text: "7. Migliora la conversione del diretto" },
      {
        type: "p",
        text: "Se il sito web converte male, butti via traffico ad alta marginalità che andrà su OTA a pagare commissione. Ottimizzare conversione del sito (booking engine moderno, banner prezzo migliore vs OTA, garanzia best price) recupera 2-4 punti di mix diretto, equivalenti a 2-3 euro di ADR media. Costo dell'intervento: spesso meno di 2.000 euro una tantum.",
      },
      { type: "h2", text: "Il quadro d'insieme" },
      {
        type: "p",
        text: "Nessuna delle sette leve da sola sposta in modo drammatico l'ADR. Tutte e sette insieme, applicate per 12 mesi, tipicamente portano un +8-15% di ADR senza calo di occupancy. La differenza tra un hotel con ADR mediocre e uno con ADR forte non è il prezzo nominale: è la disciplina nell'applicare queste sette leve ogni settimana, non solo una volta all'anno.",
      },
      {
        type: "cta",
        text: "Molte di queste leve si attivano con un pricing dinamico ben impostato: ecco come funziona davvero.",
        href: "/blog/pricing-dinamico-hotel",
        label: "Come funziona il pricing dinamico",
      },
      {
        type: "cta",
        text: "Vuoi sapere quali leve ADR hanno più potenziale sul tuo hotel? La dashboard te lo mostra in 5 minuti.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
    faqs: [
      {
        q: "Cosa significa ADR in hotel?",
        a: "ADR è l'acronimo di Average Daily Rate, la tariffa media giornaliera: il ricavo medio ottenuto per ogni camera effettivamente venduta in un dato periodo. È l'indicatore che misura quanto, in media, un cliente paga per notte, al netto delle camere rimaste invendute.",
      },
      {
        q: "Come si calcola l'ADR?",
        a: "L'ADR si calcola dividendo il fatturato camere per il numero di camere vendute nello stesso periodo. Esempio: 12.000 € di ricavo camere su 100 camere vendute danno un ADR di 120 €. Nel calcolo si considerano solo le camere vendute, non quelle disponibili (quello è il RevPAR).",
      },
      {
        q: "Qual è la differenza tra ADR e RevPAR?",
        a: "L'ADR misura il ricavo medio per camera venduta; il RevPAR (Revenue Per Available Room) misura il ricavo medio per camera disponibile, venduta o meno. Il RevPAR combina ADR e occupazione (RevPAR = ADR × tasso di occupazione) ed è quindi l'indicatore più completo della performance complessiva.",
      },
      {
        q: "Cos'è l'ADR su Booking?",
        a: "Su Booking.com l'ADR è la tariffa media effettivamente incassata dalle prenotazioni provenienti dal canale, che va letta al netto della commissione (tipicamente 15-18%). Per questo l'ADR netta di Booking è più bassa dell'ADR del canale diretto: aumentare la quota di prenotazioni dirette alza l'ADR netta media senza toccare i prezzi.",
      },
      {
        q: "Come aumentare l'ADR senza perdere occupazione?",
        a: "Non alzando i prezzi in modo indiscriminato, ma agendo su più leve insieme: spostare mix verso il diretto e le tipologie superior, prezzare i picchi di domanda ignorati, stimolare il lead time lungo, aumentare il valore percepito e pacchettizzare con margine. Applicate in parallelo per 12 mesi portano tipicamente un +8-15% di ADR a parità di occupazione.",
      },
    ],
  },
  {
    slug: "errori-pricing-hotel",
    title: "Errori di pricing hotel: i 10 più costosi",
    description:
      "I dieci errori di pricing che vediamo più spesso negli hotel indipendenti italiani e come evitarli senza investimenti complessi.",
    keywords: ["errori pricing hotel", "errori tariffe hotel", "ottimizzazione prezzi hotel"],
    cluster: "pricing",
    publishedAt: "2026-05-04",
    readingMinutes: 6,
    relatedSlugs: ["pricing-dinamico-hotel", "come-aumentare-adr-hotel", "rms-vs-gestione-manuale"],
    lead:
      "Dieci errori di pricing che ti costano più di quanto immagini, ognuno con come riconoscerlo e come correggerlo.",
    body: [
      {
        type: "p",
        text: "Negli hotel indipendenti italiani vediamo gli stessi errori di pricing ripetersi. Non sono errori da incompetenti: sono il risultato di anni di abitudini, di pricing tools datati, di tempo poco. Riconoscerli è il primo passo per recuperare tre, cinque, anche dieci punti di RevPAR.",
      },
      { type: "h2", text: "1. Stagionalità a blocchi rigidi" },
      {
        type: "p",
        text: "Tariffa A da gennaio a marzo, B da aprile a maggio, C da giugno a settembre. Funzionava negli anni ottanta. Oggi la domanda è continuamente irregolare anche dentro lo stesso mese: weekend, eventi, ponti, festività regionali. La stagionalità a blocchi è il primo errore da rimuovere passando a un calendario di prezzi giornaliero.",
      },
      { type: "h2", text: "2. Prezzo identico su tutti i giorni della settimana" },
      {
        type: "p",
        text: "Un city hotel con stessa tariffa lunedì e sabato sta perdendo 20-40 euro di ADR ogni weekend. Un resort con stessa tariffa weekday e weekend sta riempiendo il martedì a tariffa premium e svendendo il sabato. Il giorno della settimana è quasi sempre la prima leva da differenziare.",
      },
      { type: "h2", text: "3. Sconto ultimo minuto generalizzato" },
      {
        type: "p",
        text: "Lo sconto last-minute al 20% applicato in automatico sulle camere invendute è una pratica datata che insegna ai clienti ad aspettare. Meglio: prezzo flessibile fino a 7 giorni, poi consolidamento sulle camere ancora libere senza sconto a-prescindere. Se la domanda c'è, riempi a prezzo pieno; se non c'è, lo sconto chirurgico vale di più di quello automatico.",
      },
      { type: "h2", text: "4. Parity rigida diretto-OTA" },
      {
        type: "p",
        text: "Tenere il prezzo del sito identico a Booking distrugge il diretto. Booking ha forza di traffico maggiore, conviene sempre al cliente. Il diretto deve avere un vantaggio chiaro: prezzo, omaggio, condizioni più morbide. La parity rate non è obbligatoria nei contratti OTA del 2026 italiani, è solo un'abitudine.",
      },
      { type: "h2", text: "5. Non usare i restrizioni soggiorno minimo" },
      {
        type: "p",
        text: "Sui weekend e ponti, il min stay 2 notti riduce drasticamente i no-show e fa entrare prenotazioni più ADR-positive. Tantissimi hotel non usano il min stay per pigrizia o paura di 'perdere prenotazioni'. La verità è che le perdono già, sotto forma di clienti 1-night che non riempiono la domenica.",
      },
      { type: "h2", text: "6. Tariffa rimborsabile e non rimborsabile a prezzo identico" },
      {
        type: "p",
        text: "Se la rimborsabile e la non rimborsabile costano uguale, sei stupidamente generoso. Il differenziale standard di mercato è 8-12% (rimborsabile più cara). Sotto questo gap perdi cassa anticipata; sopra, perdi prenotazioni rimborsabili.",
      },
      { type: "h2", text: "7. Prezzo flat per più tipologie diverse" },
      {
        type: "p",
        text: "Camera doppia standard e doppia superior allo stesso prezzo è un classico hotel da 8-15 camere. La superior dovrebbe costare almeno 15-25 euro in più: senza differenziale, il cliente prende la superior gratis e tu vendi la stessa camera al prezzo della peggiore.",
      },
      { type: "h2", text: "8. Tariffa corporate negoziata e mai rivista" },
      {
        type: "p",
        text: "Tariffa corporate concordata 4 anni fa con un'azienda è quasi certamente sotto mercato oggi. Vanno riviste annualmente con criteri chiari: volume garantito, lead-time medio, accessoriato (colazione, parcheggio).",
      },
      { type: "h2", text: "9. Festività infrasettimanali ignorate" },
      {
        type: "p",
        text: "1 maggio, 2 giugno, 25 aprile cadenti di mercoledì. La maggior parte degli hotel mantiene tariffa weekday. Spesso quei giorni hanno domanda da weekend lungo. Differenziarli in calendario eventi vale 1-2 punti di RevPAR annuo.",
      },
      { type: "h2", text: "10. Mancato tracking del competitor" },
      {
        type: "p",
        text: "Senza un tool che ti dica oggi quanto stanno chiedendo i tuoi 5 competitor diretti, stai prezzando alla cieca. Non vuol dire copiare: vuol dire conoscere il tuo posizionamento relativo. Spesso il problema non è il prezzo assoluto, è l'esserti distaccato troppo dal mercato senza accorgertene.",
      },
      {
        type: "cta",
        text: "Quanti di questi errori hai sul tuo hotel? La dashboard di Santaddeo te lo dice subito.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "strategie-prezzo-alta-stagione",
    title: "Strategie di prezzo per l'alta stagione: come massimizzare l'ADR",
    description:
      "Come prezzare un hotel in alta stagione senza perdere clienti diretti e senza diventare prevedibili. Strategie applicabili anche a stagioni brevi.",
    keywords: ["prezzo alta stagione hotel", "tariffe alta stagione", "strategie estate hotel"],
    cluster: "pricing",
    publishedAt: "2026-05-06",
    readingMinutes: 6,
    relatedSlugs: ["come-aumentare-adr-hotel", "strategie-prezzo-bassa-stagione", "pricing-dinamico-hotel"],
    lead:
      "L'alta stagione non si gioca a giugno: si imposta a febbraio. Ecco come massimizzare l'ADR senza compromettere il pickup.",
    body: [
      {
        type: "p",
        text: "L'alta stagione è il periodo in cui l'hotel fa la maggior parte del fatturato e dove anche pochi punti di ADR si traducono in molti soldi. Eppure è spesso il periodo prezzato peggio: tariffa pubblicata cinque mesi prima e mai più toccata, o all'opposto rincari aggressivi a poche settimane che spaventano i clienti fedeli. Una strategia matura ha tre fasi distinte.",
      },
      { type: "h2", text: "Fase 1: il setup base (5-6 mesi prima)" },
      {
        type: "p",
        text: "A febbraio per l'estate, a settembre per il Natale: si fissano i prezzi base sulle date critiche con margine di crescita. La regola: parti da base anno precedente +5-7%, applicalo solo alle date weekend e festività; lascia il resto a margine di aggiustamento. Già in questa fase: differenzia per giorno della settimana, applica restrizioni minimum stay sui ponti, definisci il pavimento minimo per evitare drop indiscriminati.",
      },
      { type: "h2", text: "Fase 2: il monitoraggio di pickup (3-1 mesi prima)" },
      {
        type: "p",
        text: "Settimanalmente, confronti pickup di ogni data critica con stesso lead time anno precedente. Se sei avanti, alzi 3-5%; se sei indietro, NON abbassi subito ma controlli mercato e canali. Lo sbaglio classico è correre al ribasso al primo pickup lento: spesso è una settimana di rumore che si recupera. Solo dopo 14-21 giorni di pickup costantemente lento si valuta intervento sul prezzo.",
      },
      { type: "h2", text: "Fase 3: la chiusura tattica (4 settimane prima)" },
      {
        type: "p",
        text: "A 4 settimane sai quasi sicuramente come finirà la data. Hai tre opzioni: fly-up se sei sopra l'80% di occupancy con buon ADR, fill-tactical se sei tra 60-80%, recovery se sei sotto 60%. Ognuna ha leve diverse. Fly-up: alza ulteriormente, considera close-to-arrival sui rate plan rimborsabili. Fill-tactical: pacchettizza, attiva flash deal mirati. Recovery: sconto last-minute mirato sui canali ad alta visibilità (mai diretto), considera cooperazione con OTA su flash sale.",
      },
      { type: "h2", text: "Errori specifici dell'alta stagione" },
      {
        type: "ul",
        items: [
          "Cap di prezzo troppo basso: ti impedisce di sfruttare picchi di domanda inattesa.",
          "Tariffa identica per 4 weekend di luglio: ogni weekend ha pickup e domanda diversi.",
          "Apertura tariffe estive solo a marzo: i clienti tedeschi e svizzeri prenotano a settembre dell'anno prima.",
          "Bloccare tutto il rimborsabile in alta: massimizza cassa ma fa scappare segmenti che pagano premium per flessibilità.",
          "Allotment generosi a operatori di pacchetto: vedi camere occupate ma a tariffe nette molto basse.",
        ],
      },
      { type: "h2", text: "Il caso degli eventi locali" },
      {
        type: "p",
        text: "Gli eventi locali (concerti, fiere, sportivi) sono micro-alta stagione che pochi hotel sfruttano bene. Tre regole: monitora il calendario eventi della tua destinazione 9-12 mesi prima, prezza quelle date 30-60% sopra il weekend standard, applica min stay 2-3 notti per non avere camere mezze vuote la notte adiacente. Un solo evento ben prezzato può valere quanto un weekend extra di alta stagione.",
      },
      {
        type: "cta",
        text: "L'alta stagione è il momento in cui l'ADR pesa di più sul fatturato: ecco le sette leve per aumentarlo senza perdere occupancy.",
        href: "/blog/come-aumentare-adr-hotel",
        label: "Come aumentare l'ADR",
      },
      { type: "h2", text: "L'alta stagione del prossimo anno" },
      {
        type: "p",
        text: "Il momento migliore per impostare l'alta stagione del prossimo anno è il mese successivo a quello attuale. A settembre fai il debriefing dell'estate appena chiusa: quali date sono andate meglio del budget, quali peggio, dove c'era domanda inattesa, dove hai sprecato. Da quel debriefing nascono i prezzi base per l'estate prossima. Aspettare febbraio per riguardare l'estate è sempre tardi.",
      },
      {
        type: "cta",
        text: "Vuoi vedere come Santaddeo prezza l'alta stagione? Inizia con la dashboard gratuita.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "strategie-prezzo-bassa-stagione",
    title: "Strategie di prezzo per la bassa stagione: come non svendere",
    description:
      "La bassa stagione si vince difendendo l'ADR e attraendo segmenti diversi, non azzerando i prezzi. Cinque strategie che funzionano.",
    keywords: ["prezzo bassa stagione hotel", "strategie inverno hotel", "shoulder season"],
    cluster: "pricing",
    publishedAt: "2026-05-08",
    readingMinutes: 6,
    relatedSlugs: ["strategie-prezzo-alta-stagione", "pricing-dinamico-hotel", "strategie-disintermediazione"],
    lead:
      "La bassa stagione è il momento in cui si separa un hotel ben gestito da uno stanco. Non si vince azzerando i prezzi, si vince con segmenti.",
    body: [
      {
        type: "p",
        text: "La tentazione classica della bassa stagione è 'abbasso il prezzo finché qualcuno mi prenota'. È la strategia che produce occupancy modesta, ADR distrutta, RevPAR pessimo, fedeltà annientata. Esistono cinque strategie alternative, applicabili anche a hotel piccoli, che funzionano molto meglio.",
      },
      { type: "h2", text: "1. Cambia segmento, non solo prezzo" },
      {
        type: "p",
        text: "In bassa il leisure cala ma altri segmenti restano. Corporate infrasettimanale, MICE (eventi aziendali piccoli), gruppi sportivi, ritiri yoga e benessere, scuole di lingua, professionisti in trasferta. Ognuno di questi richiede un'offerta diversa. L'errore è cercare il leisure (l'unico cliente che conosci) a prezzi sempre più bassi.",
      },
      { type: "h2", text: "2. Pacchetti tematici con ADR difensiva" },
      {
        type: "p",
        text: "Un weekend gourmet a 250 euro tutto compreso ha ADR percepita più alta di una doppia BB a 110 euro, anche se tu nei conti vedi simile. Pacchetti tematici (gastronomico, benessere, culturale) attirano un cliente con disponibilità a pagare diversa e ti permettono di mantenere ADR sui giorni che altrimenti svenderesti. Costo marginale basso, valore percepito alto.",
      },
      { type: "h2", text: "3. Restrizioni di soggiorno strategiche" },
      {
        type: "p",
        text: "Min stay 2 notti sui weekend di bassa stagione filtra fuori il pendolare 1-night a basso ADR e attira la coppia in fuga di 2 notti che paga di più. Apparentemente perdi prenotazioni; in realtà sostituisci prenotazioni di pessima ADR con prenotazioni di buona ADR.",
      },
      { type: "h2", text: "4. Lavora il diretto in modo aggressivo (ma intelligente)" },
      {
        type: "p",
        text: "In bassa, il margine OTA pesa ancora di più (commissione fissa su ADR già bassa). Spostare 10% del mix da OTA a diretto in bassa stagione vale più di 5 euro di ADR netta media. Strumenti: newsletter mirate ai clienti del database, codici sconto solo per il sito, banner persistente sul sito con confronto prezzo OTA, garanzia 'se trovi più basso ti rimborsiamo'.",
      },
      { type: "h2", text: "5. Chiusure tattiche" },
      {
        type: "p",
        text: "Per hotel stagionali, valutare chiusure tecniche di 7-14 giorni in bassa pura per fare manutenzione, formazione del team, ferie. La chiusura tattica produce zero RevPAR ma anche zero costi variabili e ti dà un asset hotel più forte all'apertura successiva. È spesso più economico di tre settimane di occupancy 25% con perdita operativa.",
      },
      { type: "h2", text: "I numeri di un caso reale" },
      {
        type: "p",
        text: "Hotel 22 camere collinare. Bassa stagione 1 novembre - 15 dicembre. Anno A (strategia sconto): occupancy 38%, ADR 78 euro, RevPAR 30 euro. Anno B (strategia segmenti + pacchetti): occupancy 42%, ADR 96 euro, RevPAR 40 euro. La differenza è +33% di RevPAR senza investimenti aggiuntivi: solo cambio di approccio commerciale e disciplina sui prezzi minimi.",
      },
      { type: "h2", text: "Cosa NON fare mai in bassa" },
      {
        type: "ul",
        items: [
          "Aprire la non-rimborsabile a sconto del 30%: erodi la fidelizzazione e fai cassa di breve.",
          "Vendere su flash sale a prezzi che non potresti mai sostenere come standard: quei clienti tornano solo se rivedi quel prezzo.",
          "Mettere camere in promozione su tutti i canali contemporaneamente: OTA-diretto-flash insieme creano caos di percezione.",
          "Disattivare tutti i guard-rail di prezzo minimo: l'algoritmo o il channel manager possono portare la tariffa sotto i costi.",
        ],
      },
      { type: "h2", text: "L'attitudine giusta" },
      {
        type: "p",
        text: "La bassa stagione si gestisce meglio quando l'obiettivo non è 'massimizzare occupancy a tutti i costi' ma 'massimizzare RevPAR netto considerando che alcuni giorni sarà semplicemente vuoto'. Una camera vuota a 0 euro è meglio di una camera venduta a 35 euro che attiva costi variabili (pulizie, biancheria, breakfast) per 25 euro: marginale 10 euro vs 0 euro pari, ma con costo strategico (cliente low-spend di cattiva qualità) che peggiora la statistica.",
      },
      {
        type: "cta",
        text: "Vuoi una strategia bassa stagione fatta sul tuo hotel? Parliamone in 15 minuti.",
        href: "/request-info",
        label: "Richiedi informazioni",
      },
    ],
  },
]
