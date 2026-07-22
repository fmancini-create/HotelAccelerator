import type { BlogArticle } from "../types"

/**
 * Cluster 5 — Distribuzione e Channel Manager.
 * Mappato a ClusterKey="strategia" perche' il cluster del config originale
 * include articoli su strategia di distribuzione, sincronizzazione OTA e
 * scelta tecnologica del channel manager (no clusterkey "distribuzione"
 * dichiarato in types.ts: usiamo "strategia" come naming canonico esistente).
 */
export const CLUSTER_DISTRIBUZIONE: BlogArticle[] = [
  {
    slug: "channel-manager-hotel-cosa-e",
    title: "Channel manager hotel: cos'e' e come funziona",
    description:
      "Cos'e' un channel manager, come sincronizza disponibilita' e tariffe tra PMS e OTA, perche' un hotel indipendente non puo' farne a meno e cosa cercare in uno moderno.",
    keywords: [
      "channel manager hotel",
      "cos'e channel manager",
      "sincronizzazione OTA",
      "channel manager italiano",
    ],
    cluster: "strategia",
    publishedAt: "2026-04-26",
    readingMinutes: 7,
    relatedSlugs: [
      "channel-manager-vs-pms-vs-rms",
      "overbooking-come-evitarlo",
      "rate-parity-cos-e",
    ],
    lead:
      "Il channel manager sincronizza disponibilita', tariffe e restrizioni tra PMS e canali OTA. Senza, ogni minuto di ritardo e' un overbooking potenziale.",
    body: [
      {
        type: "p",
        text: "Il channel manager e' il software che sincronizza in tempo reale disponibilita', tariffe e restrizioni tra il tuo PMS (sistema gestionale dell'hotel) e tutti i canali di vendita esterni: Booking.com, Expedia, Airbnb, sito proprio, GDS, agenzie online minori. Senza un channel manager, ogni canale e' un silo separato che richiede aggiornamento manuale, e ogni minuto di ritardo e' un overbooking potenziale.",
      },
      { type: "h2", text: "Cosa fa esattamente" },
      {
        type: "p",
        text: "Il channel manager esegue tre operazioni continue, idealmente entro pochi secondi: pusha le variazioni di disponibilita' verso tutti i canali quando una camera viene venduta o liberata, propaga le tariffe quando aggiorni un prezzo (manualmente o tramite RMS), e scarica le prenotazioni quando un cliente prenota su un OTA inserendole nel PMS. Tutte e tre devono funzionare. Un channel manager che pusha tariffe ma non sincronizza disponibilita' e' inutile.",
      },
      { type: "h2", text: "Perche' serve davvero" },
      {
        type: "p",
        text: "Senza channel manager devi aggiornare manualmente l'extranet di ogni OTA quando vendi una camera, cambi un prezzo, modifichi una restrizione o ricevi una cancellazione. Per un hotel da 20 camere venduto su 4 canali sono decine di operazioni al giorno: e' umanamente impossibile farlo senza errori, e ogni errore e' potenzialmente un overbooking, una mancata vendita, o una violazione di parity.",
      },
      { type: "h2", text: "Come funziona tecnicamente" },
      {
        type: "p",
        text: "Il channel manager parla due lingue diverse: verso il PMS usa una API privata o file XML/CSV scambiato a intervalli regolari (bidirezionale, riceve update PMS e invia prenotazioni OTA); verso gli OTA usa l'API standard del singolo canale (Booking ha la sua, Expedia la sua, Airbnb la sua). Le buone integrazioni sono push-based: il PMS notifica il channel manager appena cambia qualcosa. Le integrazioni vecchie usano polling (controllo ogni 5-15 minuti) e sono molto piu' rischiose: nei 15 minuti di gap puoi vendere la stessa camera due volte.",
      },
      { type: "h2", text: "Cosa cercare in uno moderno" },
      {
        type: "ul",
        items: [
          "Latenza: tempo tra vendita di una camera e aggiornamento su tutti i canali. Sotto 30 secondi ottimo, sopra il minuto rischioso.",
          "Connessioni dirette: API verso i canali principali (Booking, Expedia) devono essere 'direct connect' senza intermediari.",
          "Gestione restrizioni granulare: minimum stay, closed to arrival, closed to departure, release period per ogni rate plan.",
          "Mapping tariffe avanzato: stessa tariffa interna mappata a rate plan diversi sui vari OTA, con derivazioni (es. NRF = Standard - 10%).",
          "Failover: se un canale e' down, il channel manager continua sugli altri e mette in coda gli aggiornamenti per quando torna up.",
          "Audit log completo: ogni push e ogni pull tracciati con timestamp, payload, esito. Senza, debuggare un overbooking e' impossibile.",
        ],
      },
      { type: "h2", text: "Standalone vs integrato nel PMS" },
      {
        type: "p",
        text: "Hai due opzioni. Standalone: software dedicato (Cubilis, SiteMinder, RateGain, MyAllocator). Vantaggio la profondita' (gestione restrizioni avanzata, decine di canali, customizzazioni). Svantaggio il costo (€50-300/mese) e il sistema in piu' da mantenere. Integrato nel PMS: Scidoo, Bedzzle, Beddy e altri PMS italiani lo includono. Vantaggio: parli con un'unica azienda, setup piu' veloce, integrazione piu' stretta. Per hotel indipendenti italiani fino a 50 camere, il channel manager integrato e' quasi sempre la scelta giusta.",
      },
      { type: "h2", text: "Errori da evitare" },
      {
        type: "p",
        text: "Il piu' grave e' configurare le tariffe a 'stock per canale' invece che condiviso: vuol dire che la stessa camera puo' essere venduta da piu' canali contemporaneamente. Va sempre usato l'allotment globale unico. Altri errori: dimenticare le derivazioni (configurare NRF come tariffa indipendente invece che derivata, costringe a aggiornarla a mano ogni volta), e non monitorare la rate parity (Booking e Expedia possono mostrare prezzi diversi per promo Genius/Member, va monitorato settimanalmente).",
      },
      {
        type: "cta",
        text: "Vuoi capire come si integra il channel manager con un RMS moderno? Parla con il team Santaddeo.",
        href: "/landing/dashboard-gratuita",
        label: "Prova gratis",
      },
    ],
  },

  {
    slug: "channel-manager-vs-pms-vs-rms",
    title: "Channel Manager vs PMS vs RMS: differenze e come si integrano",
    seoTitle: "RMS, Channel Manager e PMS: differenze e integrazione",
    description:
      "Qual e' la differenza tra RMS, channel manager e PMS e come si integrano nello stack di un hotel. Cosa fa ciascuno, dove si sovrappongono e serve un RMS se hai gia' un channel manager.",
    keywords: [
      "rms channel manager",
      "differenza rms channel manager",
      "channel manager vs PMS",
      "PMS vs RMS",
      "stack tecnologico hotel",
    ],
    cluster: "strategia",
    publishedAt: "2026-04-27",
    readingMinutes: 7,
    relatedSlugs: [
      "channel-manager-hotel-cosa-e",
      "cose-un-rms-hotel",
      "scidoo-channel-manager-integrato",
    ],
    lead:
      "RMS, channel manager e PMS si confondono perche' spesso convivono nello stesso software. Ma sono tre cose distinte: capire le differenze e come si integrano ti aiuta a scegliere meglio.",
    body: [
      {
        type: "p",
        text: "RMS, channel manager e PMS si confondono perche' spesso convivono nello stesso software. Ma sono tre cose distinte, con tre responsabilita' diverse: il PMS gestisce, il channel manager distribuisce, l'RMS decide il prezzo. Capire le differenze e come questi sistemi si integrano tra loro ti aiuta a scegliere meglio e a evitare di pagare due volte la stessa funzionalita'.",
      },
      { type: "h2", text: "PMS — Property Management System" },
      {
        type: "p",
        text: "Il PMS e' il cuore operativo dell'hotel. Gestisce prenotazioni (anagrafica cliente, date, camere assegnate, stato), camere e tariffe (anagrafica fisica, tariffe standard, restrizioni base), front office (arrivi, partenze, room rack), fiscale (ricevute, fatture, registro corrispettivi, scontrino elettronico), tassa di soggiorno (calcolo, esenzioni, riepiloghi), operations (housekeeping, manutenzioni, blocco camere). Senza PMS l'hotel non puo' funzionare. E' il sistema da cui tutto il resto attinge dati.",
      },
      { type: "h2", text: "Channel Manager" },
      {
        type: "p",
        text: "Il channel manager e' uno strato di sincronizzazione. Non genera dati propri, ma propaga quelli del PMS verso i canali esterni e fa il viaggio di ritorno per le prenotazioni. In sintesi: prende cio' che e' nel PMS e lo distribuisce. Non decide nulla.",
      },
      { type: "h2", text: "RMS — Revenue Management System" },
      {
        type: "p",
        text: "L'RMS e' il sistema decisionale. Risponde alla domanda: 'qual e' il prezzo giusto, oggi, per ogni data e ogni tipo di camera?'. Per farlo raccoglie dati dal PMS (storico, prenotazioni in arrivo, occupancy), dati esterni (eventi, meteo, tariffe competitor), elabora un prezzo target con un algoritmo, propone o pusha il nuovo prezzo al PMS che lo propaga via channel manager.",
      },
      {
        type: "p",
        text: "Ed e' qui il punto che genera piu' confusione: RMS e channel manager lavorano insieme, ma non fanno la stessa cosa. L'RMS decide quanto far pagare, il channel manager si limita a distribuire quel prezzo sui portali. Chi cerca 'rms channel manager' spesso pensa siano sinonimi o alternative: in realta' sono due anelli complementari della stessa catena, e un hotel che vuole ottimizzare i ricavi ha bisogno di entrambi.",
      },
      {
        type: "cta",
        text: "Vuoi la definizione completa? Cos'e' un software RMS per hotel, come funziona e cosa lo distingue da una semplice regola tariffaria.",
        href: "/blog/cose-un-rms-hotel",
        label: "Cos'e' un software RMS",
      },
      { type: "h2", text: "Il flusso completo" },
      {
        type: "ol",
        items: [
          "PMS raccoglie prenotazioni e occupancy in tempo reale.",
          "RMS legge dal PMS, calcola il prezzo target, decide se variare la tariffa.",
          "PMS riceve il nuovo prezzo (push diretto o tramite review umana).",
          "Channel Manager propaga il nuovo prezzo a Booking, Expedia, sito proprio.",
          "Cliente prenota su Booking.",
          "Channel Manager scarica la prenotazione e la inserisce nel PMS.",
          "PMS aggiorna l'occupancy. Il ciclo si ripete idealmente ogni 15-60 minuti.",
        ],
      },
      {
        type: "cta",
        text: "Il prezzo giusto che l'RMS calcola e il channel manager distribuisce e' anche una delle leve che pesano sul ranking OTA: ecco come aumentare la visibilita' su Booking.com.",
        href: "/blog/come-aumentare-visibilita-booking",
        label: "Come aumentare la visibilita' su Booking.com",
      },
      { type: "h2", text: "Dove si sovrappongono" },
      {
        type: "p",
        text: "I confini si confondono in tre punti. PMS con channel manager integrato: molti PMS italiani (Scidoo, Bedzzle, Beddy) lo includono — e' un solo software che fa entrambe le cose, OK e anzi preferibile per hotel medi e piccoli. PMS con RMS 'lite': alcuni PMS offrono regole tariffarie semplici ('se occupancy > 80%, alza del 10%'). Funzionano per hotel piccoli ma non sono veri RMS perche' non guardano il futuro ne' integrano segnali esterni. RMS con channel manager incluso: alcuni RMS pushano direttamente il prezzo agli OTA bypassando il PMS — rischioso, perche' il PMS non sa piu' qual e' il prezzo 'vero' e si creano inconsistenze nel reporting fiscale.",
      },
      {
        type: "quote",
        text: "Il PMS deve sempre essere la fonte di verita'. RMS e channel manager girano attorno al PMS, mai al contrario.",
      },
      { type: "h2", text: "Come scegliere per un hotel indipendente" },
      {
        type: "ul",
        items: [
          "PMS: scegli un PMS con channel manager integrato e API pubblica. Senza API non puoi collegare un RMS in futuro.",
          "Channel Manager: usa quello del PMS, salvo casi specifici dove ti serve un canale particolare non supportato.",
          "RMS: collegalo al PMS via API. Deve poter sia leggere (per calcolare) sia scrivere (per pushare i prezzi). Se puo' solo leggere, e' un sistema di 'raccomandazione', non un vero RMS.",
        ],
      },
      {
        type: "cta",
        text: "E' l'RMS a stabilire il prezzo che poi il channel manager distribuisce: ecco come funziona il pricing dinamico nella pratica.",
        href: "/blog/pricing-dinamico-hotel",
        label: "Come funziona il pricing dinamico",
      },
      { type: "h2", text: "Errori da evitare" },
      {
        type: "p",
        text: "Pagare lo stesso strumento due volte: se il tuo PMS include il channel manager, non comprarne un altro. Comprare un RMS scollegato: se l'RMS non si integra con il tuo PMS via API, finirai a copiare prezzi a mano e perderai tutto il vantaggio. Lasciare l'RMS fuori dal flusso fiscale: i prezzi pushati dall'RMS devono essere registrati nel PMS prima di essere distribuiti — solo cosi' la fiscalita' resta coerente.",
      },
      {
        type: "cta",
        text: "Santaddeo si integra al tuo PMS via API e pusha i prezzi nel rispetto del flusso fiscale. Provala.",
        href: "/landing/dashboard-gratuita",
        label: "Prova la dashboard",
      },
    ],
    faqs: [
      {
        q: "Qual e' la differenza tra RMS e channel manager?",
        a: "Il channel manager e' uno strato di distribuzione: propaga prezzi e disponibilita' del PMS verso gli OTA e scarica indietro le prenotazioni, senza decidere nulla. L'RMS e' il sistema decisionale: analizza domanda, occupancy e concorrenza per calcolare il prezzo giusto per ogni data. In sintesi, l'RMS decide quanto far pagare, il channel manager si limita a distribuire quel prezzo.",
      },
      {
        q: "PMS e channel manager si integrano?",
        a: "Si', e devono farlo: il channel manager legge dal PMS prezzi, disponibilita' e restrizioni e vi reinserisce le prenotazioni raccolte dagli OTA. Molti PMS italiani (Scidoo, Bedzzle, Beddy) includono gia' un channel manager integrato: in quel caso l'integrazione e' nativa ed e' la soluzione preferibile per hotel piccoli e medi.",
      },
      {
        q: "Serve un RMS se ho gia' un channel manager?",
        a: "Si', perche' svolgono funzioni diverse. Il channel manager distribuisce i prezzi ma non li calcola: se li decidi a mano, stai distribuendo in modo efficiente delle tariffe potenzialmente sbagliate. L'RMS aggiunge lo strato decisionale che manca, ottimizzando il prezzo giorno per giorno; poi si appoggia proprio al channel manager (via PMS) per distribuirlo.",
      },
      {
        q: "Cosa fa un RMS rispetto a un PMS?",
        a: "Il PMS (Property Management System) e' il gestionale operativo: registra prenotazioni, check-in/out, fatturazione, tassa di soggiorno e occupancy. L'RMS non gestisce nulla di operativo: legge i dati del PMS e li usa per decidere il prezzo ottimale per ogni data e tipologia. In sintesi, il PMS custodisce e gestisce i dati, l'RMS li analizza per prendere decisioni di prezzo. Sono complementari, non alternativi.",
      },
      {
        q: "Qual e' il flusso corretto tra PMS, RMS e channel manager?",
        a: "Il flusso corretto parte dal PMS come fonte di verita': l'RMS legge da esso occupancy e prenotazioni, calcola il prezzo target e lo scrive nel PMS; il channel manager prende quel prezzo dal PMS e lo distribuisce agli OTA, poi scarica indietro nel PMS le prenotazioni ricevute. La regola d'oro: RMS e channel manager girano attorno al PMS, mai il contrario. Per collegare un RMS serve quindi un PMS con API pubblica.",
      },
    ],
  },

  {
    slug: "overbooking-come-evitarlo",
    title: "Overbooking: cos'e' e come prevenirlo",
    description:
      "Cos'e' l'overbooking, perche' succede (latenza, stock condiviso configurato male, mismatch PMS-channel manager), come prevenirlo e cosa fare se ti capita.",
    keywords: [
      "overbooking hotel",
      "evitare overbooking",
      "channel manager overbooking",
      "hotel walking",
    ],
    cluster: "strategia",
    publishedAt: "2026-04-28",
    readingMinutes: 7,
    relatedSlugs: [
      "channel-manager-hotel-cosa-e",
      "channel-manager-vs-pms-vs-rms",
      "rate-parity-cos-e",
    ],
    lead:
      "L'overbooking e' la situazione in cui hai venduto piu' camere di quante ne hai. Costoso, dannoso per la reputazione, e quasi sempre prevenibile.",
    body: [
      {
        type: "p",
        text: "L'overbooking e' il caso in cui il tuo hotel ha confermato piu' prenotazioni di quante camere ha effettivamente disponibili per una certa data. Quando arriva il giorno del check-in, qualcuno deve essere 'walked' — cioe' trasferito in un altro hotel a tue spese, con risarcimento. E' costoso, danneggia la reputazione, e nei casi gravi puo' triggerare penali contrattuali con gli OTA.",
      },
      { type: "h2", text: "Perche' succede" },
      {
        type: "ol",
        items: [
          "Disallineamento PMS-channel manager: il PMS sa che hai 20 camere, il channel manager sta vendendo come se ne avessi 22. Tipicamente perche' qualcuno ha modificato l'inventario in un sistema senza aggiornare l'altro.",
          "Stock condiviso configurato male: in un channel manager moderno la disponibilita' e' globale (un pool unico per tutti i canali). Nei sistemi vecchi o mal configurati, ogni canale ha il suo allotment dedicato — risultato 5+5+5=15 vendite possibili anche se ne hai solo 10.",
          "Latency: due clienti prenotano la stessa camera nello stesso minuto su canali diversi. Se il channel manager impiega 30 secondi a propagare l'aggiornamento, in quei 30 secondi entrambe le prenotazioni vanno a buon fine.",
        ],
      },
      { type: "h2", text: "Come prevenirlo" },
      { type: "h3", text: "1. Stock condiviso, sempre" },
      {
        type: "p",
        text: "Nel channel manager, la disponibilita' deve essere globale. Quando una camera viene venduta da un canale, tutti gli altri canali la perdono immediatamente. Niente allotment per canale.",
      },
      { type: "h3", text: "2. Monitora la latenza" },
      {
        type: "p",
        text: "Un channel manager moderno deve sincronizzare in 10-30 secondi. Sopra il minuto sei in zona rossa. Misura con uno script semplice: vendi una camera test su Booking e cronometra quanto tempo ci mette a sparire da Expedia.",
      },
      { type: "h3", text: "3. Buffer su date critiche" },
      {
        type: "p",
        text: "Per le notti di alta domanda (capodanno, ferragosto, eventi cittadini importanti), riduci manualmente la disponibilita' di 1-2 camere come buffer di sicurezza. E' un piccolo costo opportunita' a fronte di un rischio di walking che potrebbe costarti €300-500 per camera.",
      },
      { type: "h3", text: "4. Alert automatici sui mismatch" },
      {
        type: "p",
        text: "Configura un sistema (anche un semplice script) che ogni ora confronta inventario PMS e inventario channel manager. Se diverge anche di una sola camera, alert immediato. Molti overbooking sono prevedibili 24-48h prima se monitori.",
      },
      { type: "h3", text: "5. Limita il manual override" },
      {
        type: "p",
        text: "Se il tuo team aggiorna disponibilita' manualmente nei singoli extranet (per esempio per riaprire camere su Booking quando ricevi una cancellazione), stai introducendo desync. Tutto deve passare dal PMS.",
      },
      { type: "h2", text: "Cosa fare se ti capita" },
      {
        type: "ol",
        items: [
          "Identifica subito quale prenotazione sposterai (di solito l'ultima entrata, o quella di un canale meno strategico, o un cliente non Genius/Loyalty).",
          "Trova un hotel partner di pari categoria nei dintorni prima di chiamare il cliente. Non chiamarlo senza una soluzione pronta.",
          "Chiama tu il cliente, non aspettare il check-in. Spiega la situazione, offri il transfer gratuito + un voucher o un upgrade. La maggior parte dei clienti accetta se gestisci con trasparenza.",
          "Paga la differenza se l'altro hotel costa di piu'.",
          "Documenta tutto: nei contratti OTA potresti dover giustificare il walking. Avere un audit log del channel manager che dimostra il malfunzionamento ti aiuta.",
        ],
      },
      { type: "h2", text: "Conseguenze contrattuali con gli OTA" },
      {
        type: "p",
        text: "Booking.com e Expedia hanno policy esplicite. Tipicamente: dopo il walking, l'hotel paga la differenza al cliente; walking ripetuti possono ridurre il ranking nella search di Booking, e nei casi gravi sospendere l'account. Expedia ha un sistema di 'reliability score' simile. Un overbooking ogni qualche mese e' tollerato e considerato fisiologico. Sistematico e' penalizzato.",
      },
      {
        type: "cta",
        text: "Vuoi monitorare in tempo reale i mismatch tra PMS e canali? Parla con noi.",
        href: "/landing/guard",
        label: "Scopri Guard",
      },
    ],
  },

  {
    slug: "rate-parity-cos-e",
    title: "Rate parity: cos'e' e come monitorarla",
    description:
      "La rate parity e' l'obbligo (de facto) di mantenere lo stesso prezzo su tutti i canali. Cos'e' davvero, dove e' regolamentata in Italia, e come tenerla sotto controllo.",
    keywords: [
      "rate parity",
      "parity hotel",
      "uguaglianza prezzi OTA",
      "Booking parity",
      "best rate guarantee",
    ],
    cluster: "strategia",
    publishedAt: "2026-04-29",
    readingMinutes: 7,
    relatedSlugs: [
      "channel-manager-hotel-cosa-e",
      "overbooking-come-evitarlo",
      "errori-booking-com-hotel",
    ],
    lead:
      "Da pratica contrattuale negli anni 2000 e' diventata un equilibrio piu' fluido. Ma resta un punto critico operativo per ogni hotel indipendente.",
    body: [
      {
        type: "p",
        text: "La rate parity e' il principio per cui un hotel offre lo stesso prezzo sulla stessa camera, per le stesse date, su tutti i canali di distribuzione. E' una pratica che nasce dalle clausole contrattuali degli OTA negli anni 2000 ed e' oggi parzialmente regolamentata, ma rimane un punto critico operativo per qualsiasi hotel indipendente.",
      },
      { type: "h2", text: "Origine: la 'wide parity'" },
      {
        type: "p",
        text: "Booking.com e Expedia per anni hanno imposto clausole 'wide parity': l'hotel non poteva offrire un prezzo inferiore su nessun altro canale, incluso il proprio sito. Era una clausola anticoncorrenziale. Tra il 2015 e il 2017 le autorita' antitrust di vari paesi europei (Francia, Italia, Germania, Austria) hanno vietato o limitato queste clausole. In Italia oggi un hotel puo' legalmente offrire un prezzo piu' basso sul sito proprio (o tramite contatto diretto). Resta vincolato dalla 'narrow parity': non puo' offrire un prezzo piu' basso a un altro OTA.",
      },
      {
        type: "quote",
        text: "Sito proprio < OTA e' permesso. OTA A < OTA B no.",
      },
      { type: "h2", text: "Perche' continua a esistere de facto" },
      {
        type: "ul",
        items: [
          "Best rate guarantee: Booking ed Expedia rimborsano la differenza al cliente che trova un prezzo piu' basso altrove. Per evitare il rimborso, l'hotel mantiene parity.",
          "Ranking: nei sistemi di ranking degli OTA, un hotel che mostra prezzi piu' bassi su altri canali viene penalizzato (meno visibilita' in search).",
          "Pace e prevedibilita': dover gestire prezzi diversi per canale e' un lavoro complesso. La parity semplifica la distribuzione.",
        ],
      },
      { type: "h2", text: "Le rotture di parity piu' comuni" },
      {
        type: "p",
        text: "Anche se vuoi mantenere parity, in pratica si rompe spesso. Le cause principali: programmi loyalty/member (Booking Genius mostra prezzi -10% a utenti loggati, lo sconto lo paga Booking ma l'utente vede un prezzo piu' basso), promozioni mobile-only finanziate dall'OTA, pacchetti tariffa+voli che mostrano prezzi camera piu' bassi rispetto allo standalone, B2B/wholesale (agenzie come HotelBeds e Bonotel ricevono tariffe nette molto piu' basse e possono rivenderle a OTA minori sotto la parity — la causa piu' frequente in assoluto), errori di configurazione (l'hotel cambia un prezzo solo su Booking dimenticando Expedia).",
      },
      { type: "h2", text: "Come monitorare la parity" },
      {
        type: "p",
        text: "Esistono tool dedicati (RateGain, OTA Insight, Triptease) che scansionano quotidianamente i prezzi del tuo hotel su 5-10 canali e mostrano un parity score. Costo tipico €30-150/mese a hotel.",
      },
      {
        type: "p",
        text: "Approccio low-cost per chi non vuole un tool dedicato: spot check manuali settimanali (ogni lunedi' controlla 3-4 date a caso a +30/+60/+90/+120 giorni su Booking, Expedia, sito proprio, una OTA minore — annota se trovi differenze); alert da Booking Performance Report (il report mensile include una sezione 'Best price availability' che indica quante volte sei risultato in svantaggio); reverse search wholesale (cerca il tuo hotel su Hotwire, OTA opaque, Agoda — spesso i prezzi piu' bassi che girano sotto-banco arrivano da li').",
      },
      { type: "h2", text: "Best practice per un hotel indipendente" },
      {
        type: "ul",
        items: [
          "Mantieni parity stretta su Booking, Expedia, sito proprio. Sono i 3 canali principali.",
          "Sito proprio leggermente piu' basso (2-3%) senza dichiararlo apertamente: e' permesso e ti aiuta a spostare gradualmente prenotazioni dirette.",
          "Wholesale solo se serve davvero: se hai bisogno di volume B2B in bassa stagione ok, altrimenti i wholesaler creano piu' problemi di quanti ne risolvano.",
          "Spot check settimanale, costa 10 minuti.",
        ],
      },
      {
        type: "cta",
        text: "Vuoi vedere se i tuoi prezzi sono allineati su tutti i canali oggi? Guard di Santaddeo lo monitora in continuo.",
        href: "/landing/guard",
        label: "Scopri Guard",
      },
    ],
  },

  {
    slug: "scidoo-channel-manager-integrato",
    title: "Scidoo e channel manager integrato",
    description:
      "Scidoo e' uno dei PMS italiani con channel manager nativo. Come gestisce la sincronizzazione con Booking, Expedia e altri OTA, come si integra con un RMS esterno.",
    keywords: [
      "Scidoo channel manager",
      "Scidoo PMS",
      "Scidoo integrazione",
      "channel manager PMS italiano",
      "Scidoo API",
    ],
    cluster: "strategia",
    publishedAt: "2026-04-30",
    readingMinutes: 7,
    relatedSlugs: [
      "channel-manager-vs-pms-vs-rms",
      "channel-manager-hotel-cosa-e",
      "come-scegliere-un-rms",
    ],
    lead:
      "Scidoo e' uno dei PMS italiani piu' diffusi tra hotel indipendenti. Una delle ragioni e' il channel manager integrato: vediamo come funziona davvero.",
    body: [
      {
        type: "p",
        text: "Scidoo e' uno dei PMS italiani piu' diffusi tra hotel indipendenti, B&B di alto livello e piccole catene 2-10 strutture. Una delle ragioni del successo e' che integra nativamente il channel manager: il singolo abbonamento copre PMS + sincronizzazione OTA, semplificando lo stack tecnologico.",
      },
      { type: "h2", text: "Cosa offre come channel manager" },
      {
        type: "ul",
        items: [
          "Connessioni dirette ai principali OTA: Booking.com, Expedia, Airbnb, Hotelbeds, Volagratis, e numerose OTA italiane minori.",
          "Sincronizzazione bidirezionale: push disponibilita'/tariffe/restrizioni verso gli OTA, pull prenotazioni dagli OTA verso il PMS.",
          "Mapping tariffe avanzato con derivazioni (es. 'Non Rimborsabile = Standard - 15%').",
          "Restrizioni granulari: minimum stay, closed to arrival, closed to departure, release period per ogni rate plan.",
          "Inventario condiviso: la disponibilita' e' globale, non per canale, riducendo il rischio overbooking.",
        ],
      },
      { type: "h2", text: "Latenza tipica" },
      {
        type: "p",
        text: "Sull'esperienza diretta con hotel clienti che usano Scidoo, la latenza di propagazione di un aggiornamento prezzo o disponibilita' tra il momento della modifica nel PMS e la sua visibilita' su Booking o Expedia e' dell'ordine di 30-90 secondi in condizioni normali. E' in linea con i channel manager standalone di fascia media. In alta stagione (agosto, festivita') o durante picchi di traffico OTA, la latenza puo' salire a 2-3 minuti — fisiologico per qualsiasi channel manager, gli OTA stessi rallentano nei picchi.",
      },
      { type: "h2", text: "Integrazione con RMS esterni" },
      {
        type: "p",
        text: "Scidoo espone un'API che permette a sistemi esterni (RMS, business intelligence, channel manager terzi) di leggere lo stato delle prenotazioni in tempo reale, leggere disponibilita' e tariffe correnti, pushare nuovi prezzi nel PMS, ricevere notifiche di nuove prenotazioni o cancellazioni. L'autenticazione avviene via API key con scope per hotel.",
      },
      {
        type: "p",
        text: "Per un hotel che vuole collegare un RMS terzo a Scidoo, il flusso tipico e': l'RMS legge ogni 15-60 minuti l'occupancy dal PMS via API; calcola il prezzo target per ogni room x rate x date; pusha il nuovo prezzo a Scidoo via API; Scidoo registra il prezzo nel PMS (lo storico prezzi e' tracciato); il channel manager interno propaga il prezzo a Booking, Expedia, ecc. Il prezzo passa SEMPRE dal PMS, non viene pushato direttamente agli OTA dall'RMS — questo mantiene il PMS come fonte di verita' e garantisce coerenza fiscale.",
      },
      { type: "h2", text: "Limiti del channel manager nativo" },
      {
        type: "p",
        text: "Onestamente, non e' tutto rose e fiori. Scidoo copre gli OTA italiani molto bene, ma sui canali nicchia internazionali (alcune OTA asiatiche, OTA loyalty B2B) e' meno completo di un competitor standalone come SiteMinder o Cubilis. Le restrizioni base ci sono tutte, ma combinazioni complesse (es. closed to arrival solo per pacchetti di 3+ notti su rate plan X) possono richiedere workaround. Manca un parity tool integrato. Per un hotel indipendente italiano sotto 60 camere questi limiti raramente si fanno sentire; per chi gestisce 100+ camere o opera in mercati internazionali complessi, puo' aver senso valutare un channel manager standalone in aggiunta.",
      },
      { type: "h2", text: "Best practice operativa" },
      {
        type: "ul",
        items: [
          "Usa la mappatura 'rate plan' pulita: configura rate plan derivate (es. NRF derivato da Standard) invece di rate plan indipendenti. Risparmia update manuali.",
          "Disabilita gli stock per canale: usa solo l'inventario globale. E' il default ma vale la pena verificare nelle impostazioni avanzate.",
          "Monitora il log di sync: Scidoo espone un audit log delle operazioni di sync. Controllarlo settimanalmente aiuta a beccare canali muti prima che diventino problemi.",
          "API key dedicata per ogni integrazione: se colleghi un RMS, usa una key dedicata, cosi' se un giorno la revochi o la ruoti non rompi altro.",
        ],
      },
      {
        type: "cta",
        text: "Santaddeo si integra a Scidoo via API. Connessione in pochi minuti, prezzi pushati nel rispetto del flusso fiscale.",
        href: "/landing/dashboard-gratuita",
        label: "Provala gratis",
      },
    ],
  },
]
