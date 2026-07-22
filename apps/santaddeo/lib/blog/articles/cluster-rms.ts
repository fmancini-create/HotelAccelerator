import type { BlogArticle } from "../types"

export const CLUSTER_RMS: BlogArticle[] = [
  {
    slug: "cose-un-rms-hotel",
    title: "Cos'è un RMS hotel? Guida pratica per albergatori",
    description:
      "Cos'è un RMS (Revenue Management System) per hotel, come funziona, quali decisioni automatizza e perché oggi è uno strumento standard anche per gli hotel indipendenti.",
    keywords: ["rms hotel", "revenue management system", "software revenue hotel", "cos'è un rms"],
    cluster: "rms",
    publishedAt: "2026-04-15",
    readingMinutes: 6,
    relatedSlugs: ["migliori-rms-hotel-2026", "rms-vs-gestione-manuale", "come-scegliere-un-rms"],
    lead:
      "Un RMS è il software che decide ogni giorno a che prezzo vendere ogni camera, in ogni canale, per ogni data futura. Ecco come funziona davvero.",
    body: [
      {
        type: "p",
        text: "Un RMS, acronimo di Revenue Management System, è un software che analizza la domanda, i prezzi della concorrenza, l'occupazione storica e i dati di prenotazione del tuo hotel per suggerire o applicare automaticamente la tariffa ottimale per ogni camera e ogni data. Per molti anni è stato uno strumento riservato agli hotel di catena, perché richiedeva integrazioni complesse con il PMS e licenze costose. Negli ultimi cinque anni il quadro è cambiato: oggi anche un albergo da 8-30 camere può avere un RMS attivo, integrato con il proprio gestionale, con costi compatibili con la dimensione.",
      },
      { type: "h2", text: "Cosa fa concretamente un RMS" },
      {
        type: "p",
        text: "Il compito di un RMS si riassume in tre passi: leggere lo stato dell'hotel (camere disponibili, prenotazioni, pickup recente), confrontarlo con il contesto di mercato (eventi, prezzi competitor, stagionalità) e proporre un prezzo per ciascuna combinazione di tipologia camera, data e canale di vendita. La proposta non è una sparata isolata: tiene conto del tuo pricing minimo, del tuo target di ADR e di vincoli tariffari come il Best Available Rate o le restrizioni Booking.com. Un buon RMS spiega sempre perché sta proponendo quel prezzo: domanda alta, occupazione bassa, evento in città, drop dell'ultimo minuto.",
      },
      { type: "h2", text: "RMS, PMS e Channel Manager: differenze" },
      {
        type: "p",
        text: "Un errore frequente è confondere RMS, PMS e Channel Manager. Il PMS (Property Management System) è il gestionale del tuo hotel: gestisce check-in, check-out, fatturazione e anagrafica camere. Il Channel Manager distribuisce i prezzi e la disponibilità sui portali (Booking.com, Expedia, Airbnb). L'RMS sta sopra: legge dal PMS, decide il prezzo, lo passa al Channel Manager. Senza un RMS, qualcuno deve farlo a mano ogni giorno; con un RMS la decisione è automatica e basata su dati.",
      },
      {
        type: "cta",
        text: "Approfondimento: la differenza tra RMS, PMS e channel manager e come si integrano nello stack di un hotel.",
        href: "/blog/channel-manager-vs-pms-vs-rms",
        label: "Differenza tra RMS, PMS e channel manager",
      },
      { type: "h3", text: "Tre componenti tipici di un RMS moderno" },
      {
        type: "ul",
        items: [
          "Motore di forecasting: stima la domanda futura basandosi su prenotazioni storiche, calendar di eventi, segnali di mercato.",
          "Motore di pricing: trasforma la domanda prevista in un prezzo concreto applicando le tue regole di business.",
          "Sistema di guard-rail: blocca prezzi anomali, evita errori clamorosi (drop estremi, salti su weekend), notifica l'operatore.",
        ],
      },
      { type: "h2", text: "Perché oggi conviene anche al piccolo hotel" },
      {
        type: "p",
        text: "Per anni la giustificazione classica per non adottare un RMS era 'ho 12 camere, faccio il prezzo a mano'. La realtà operativa di un albergo indipendente è diversa: ogni giorno ci sono almeno 90 micro-decisioni di prezzo (3 tipologie × 30 date avanti) e farle bene a mano richiede 30-60 minuti, sempre. In un anno sono 200 ore. Un RMS le fa in pochi secondi e con minor errore. Non è una questione di rimpiazzare il revenue manager: è una questione di smettere di sprecare tempo su attività ripetitive e dedicarsi a strategia, mercati nuovi, ottimizzazione canali.",
      },
      { type: "h2", text: "Quando un RMS NON serve" },
      {
        type: "p",
        text: "Esistono casi in cui un RMS è sproporzionato. Se vendi solo a tariffa fissa stagionale (per esempio agriturismi con menu fisso), se hai meno di 5 camere con un solo canale, se non hai prenotazioni online, allora la complessità di gestione di un sistema automatico supera il guadagno. In tutti gli altri casi - hotel urbani, b&b di città, hotel stagionali costieri o di montagna con almeno 6-8 camere - l'RMS oggi è una commodity, non un lusso.",
      },
      { type: "h2", text: "Come riconoscere un RMS davvero buono" },
      {
        type: "p",
        text: "I tre criteri pratici che usiamo nel nostro lavoro: trasparenza dell'algoritmo (devi poter capire perché propone un prezzo), guard-rail attivi (deve bloccarti se sta per fare una stupidaggine), integrazione bidirezionale con il PMS (non solo legge prenotazioni, ma ti rimanda i prezzi senza intervento umano). Se uno di questi tre manca, stai comprando un foglio Excel più costoso, non un RMS.",
      },
      {
        type: "cta",
        text: "Guida completa: quali software di revenue management per hotel esistono in Italia, come si confrontano e come scegliere quello giusto per la tua struttura.",
        href: "/blog/software-revenue-management-hotel-italia",
        label: "Software revenue management hotel: la guida",
      },
      {
        type: "cta",
        text: "Vuoi vedere come funziona un RMS sul tuo hotel? Prova la dashboard Santaddeo gratis.",
        href: "/landing/dashboard-gratuita",
        label: "Prova la dashboard",
      },
    ],
    faqs: [
      {
        q: "Cos'è un RMS per hotel?",
        a: "RMS è l'acronimo di Revenue Management System: un software che analizza domanda, occupazione, prezzi dei competitor e storico per suggerire (o applicare) automaticamente il prezzo ottimale di ogni camera per ogni data. Serve a massimizzare i ricavi senza dover aggiornare le tariffe a mano.",
      },
      {
        q: "Che differenza c'è tra RMS e channel manager?",
        a: "Sono strumenti complementari: l'RMS decide quale prezzo applicare (la strategia), il channel manager distribuisce quel prezzo e le disponibilità sui vari canali di vendita come Booking ed Expedia (l'esecuzione). L'RMS calcola il prezzo giusto, il channel manager lo pubblica ovunque.",
      },
      {
        q: "Che differenza c'è tra RMS e PMS?",
        a: "Il PMS (Property Management System) gestisce l'operatività dell'hotel: prenotazioni, check-in, fatturazione, disponibilità. L'RMS invece si concentra solo sul prezzo, leggendo i dati dal PMS per suggerire le tariffe ottimali. Il PMS registra ciò che accade, l'RMS ottimizza quanto far pagare.",
      },
      {
        q: "Un RMS serve anche a un piccolo hotel indipendente?",
        a: "Sì. Anche una struttura con poche camere perde ricavi ogni volta che vende sotto il prezzo di mercato nei picchi di domanda o tiene prezzi alti quando la domanda è debole. Un RMS automatizza queste decisioni e libera tempo, con un impatto proporzionalmente anche maggiore per chi non ha un revenue manager dedicato.",
      },
      {
        q: "Come riconosco un RMS davvero valido?",
        a: "Tre criteri: trasparenza dell'algoritmo (devi capire perché propone un prezzo), guard-rail attivi (deve impedirti errori grossolani) e integrazione bidirezionale con il PMS (non solo legge le prenotazioni, ma rimanda i prezzi senza intervento manuale). Se manca uno di questi, non è un vero RMS.",
      },
    ],
  },
  {
    slug: "migliori-rms-hotel-2026",
    title: "Migliori RMS hotel nel 2026: come orientarsi",
    description:
      "Quali sono i migliori RMS per hotel nel 2026, su quali criteri valutarli e come capire quale fa al caso del tuo albergo indipendente. Guida pratica senza marchette.",
    keywords: ["migliori rms hotel", "rms hotel 2026", "software revenue hotel", "confronto rms"],
    cluster: "rms",
    publishedAt: "2026-04-18",
    readingMinutes: 7,
    relatedSlugs: ["cose-un-rms-hotel", "come-scegliere-un-rms", "rms-per-piccoli-hotel"],
    lead:
      "Una guida onesta su come orientarsi tra gli RMS hotel nel 2026, senza classifiche fasulle e senza affiliate.",
    body: [
      {
        type: "p",
        text: "Cercando 'migliori RMS hotel 2026' il rischio è cadere su classifiche generate automaticamente, basate su affiliate marketing più che su valutazioni reali. Questo articolo non fa nomi di concorrenti per scelta editoriale: invece descrive i criteri concreti che dovresti applicare nel tuo processo di selezione, indipendentemente dal vendor. Se i criteri sono chiari, il vendor giusto si trova in una settimana di valutazione, non in tre mesi.",
      },
      { type: "h2", text: "I sette criteri che contano davvero" },
      {
        type: "ol",
        items: [
          "Trasparenza dell'algoritmo: ogni prezzo proposto deve essere spiegabile, non una scatola nera.",
          "Integrazione PMS bidirezionale e in tempo reale, non export quotidiani via FTP.",
          "Gestione delle eccezioni: blackout date, eventi, gruppi, allotment vanno trattati nativamente.",
          "Guard-rail di sicurezza: il sistema deve bloccare prezzi anomali prima di pubblicarli.",
          "Reportistica decisionale, non solo grafici: ti deve dire cosa fare, non solo cosa è successo.",
          "Onboarding strutturato: tre settimane massime, non sei mesi di setup.",
          "Pricing trasparente: zero costi nascosti, contratti annuali ma con clausola di uscita chiara.",
        ],
      },
      { type: "h2", text: "Le quattro famiglie di RMS sul mercato" },
      {
        type: "p",
        text: "Semplificando, gli RMS si possono raggruppare in quattro famiglie. Le suite enterprise nate per le catene internazionali, potenti ma rigide e costose. Gli RMS verticali per hotel indipendenti, più snelli e con pricing accessibile. Gli RMS estensione del Channel Manager, comodi ma spesso superficiali sul forecasting. I tool dashboard-only, che mostrano dati ma non fanno automazione: questi non sono RMS veri, sono BI camuffate.",
      },
      { type: "h3", text: "Quale famiglia fa per te" },
      {
        type: "p",
        text: "Hotel da 50+ camere con team revenue strutturato: suite enterprise se il budget c'è. Hotel indipendenti 8-50 camere: RMS verticali (è la fascia più sana del mercato 2026). Hotel piccoli con channel manager già consolidato: estensione, ma valuta bene la qualità del forecasting. Mai accontentarti di una BI dashboard pensando di aver comprato un RMS, perché poi i prezzi continui a farli a mano e hai solo aggiunto un costo.",
      },
      { type: "h2", text: "Il test pratico in 30 giorni" },
      {
        type: "p",
        text: "Quasi ogni RMS serio offre una trial. Approfittane con questo protocollo: settimana 1 setup e collegamento PMS; settimana 2 osservi le proposte senza accettarle e confronti con quello che faresti tu; settimana 3 attivi le proposte solo per una tipologia di camera; settimana 4 attivi su tutte le tipologie e confronti il pickup vs stesso periodo anno prima. Se dopo 30 giorni l'occupancy è stabile o migliore e il tuo tempo di lavoro sui prezzi è dimezzato, sei nel sistema giusto. Se l'algoritmo ti sta facendo perdere ADR senza compensare con occupancy, non è il tuo.",
      },
      { type: "h2", text: "Domande da fare al vendor prima di firmare" },
      {
        type: "ul",
        items: [
          "Posso vedere il razionale di una proposta di prezzo arbitraria, sui miei dati?",
          "Cosa succede se il sync con il PMS si rompe?",
          "Avete un sistema di guard-rail e mi notificate prezzi anomali?",
          "Posso disattivare l'autopilot in 1 click se necessario?",
          "Quanto costa l'onboarding e quanto dura?",
          "Esiste un report giornaliero/settimanale che posso girare al direttore?",
        ],
      },
      { type: "h2", text: "Errori di selezione frequenti" },
      {
        type: "p",
        text: "Tre trappole tipiche. Prima: lasciarsi sedurre da una demo bellissima ma costruita su dati finti perfetti. Seconda: comprare l'enterprise 'perché farò la catena un giorno' quando hai un singolo hotel. Terza: scegliere il vendor più economico solo per il prezzo, ritrovandosi con un sistema che fa danni e nessuno per rimediare. Il prezzo giusto di un RMS per un hotel indipendente nel 2026 è tra l'1% e il 2% del fatturato camere annuo, sotto è sospetto, sopra è da rinegoziare.",
      },
      {
        type: "cta",
        text: "Stai valutando un RMS? Vediamo insieme se Santaddeo fa al caso tuo, in 15 minuti.",
        href: "/request-info",
        label: "Richiedi informazioni",
      },
    ],
  },
  {
    slug: "rms-per-piccoli-hotel",
    title: "RMS per piccoli hotel: serve davvero sotto le 20 camere?",
    description:
      "Un RMS ha senso per un hotel da 8-20 camere? Quando conviene, quando no, e quanto è realistico recuperare l'investimento. Numeri concreti.",
    keywords: ["rms piccoli hotel", "rms hotel 10 camere", "revenue management piccolo albergo"],
    cluster: "rms",
    publishedAt: "2026-04-21",
    readingMinutes: 6,
    relatedSlugs: ["cose-un-rms-hotel", "rms-vs-gestione-manuale", "rms-hotel-economico"],
    lead:
      "Per un hotel da 8-20 camere il vero ostacolo non è l'algoritmo, è il tempo. E il tempo lo paghi sempre, anche quando non lo conti.",
    body: [
      {
        type: "p",
        text: "La domanda 'mi serve un RMS sotto le 20 camere?' è una delle più frequenti che riceviamo. La risposta corta è: dipende dalla complessità del tuo mix tariffario, non dal numero di camere in sé. Un hotel di 10 camere con tre tipologie, due rate plan e tre canali ha 180 micro-decisioni di prezzo al giorno proiettando avanti 30 giorni. Un albergo di 30 camere con una sola tariffa flat ne ha trenta. Il volume di lavoro non è proporzionale alle camere, ma alla profondità del prezzo.",
      },
      { type: "h2", text: "Quando l'RMS conviene davvero al piccolo hotel" },
      {
        type: "p",
        text: "Conviene quando ricorrono almeno tre di queste condizioni: hai più di una tipologia di camera, hai stagionalità marcata (alta-bassa con almeno 30% di differenza), vendi su almeno due canali OTA, hai pickup volatile (a volte ti riempi a 3 mesi, a volte all'ultimo), hai un competitor diretto che cambia prezzo. In tutti questi casi le tue scelte di prezzo a mano sono mediamente subottimali, e un RMS fa la differenza anche su 8 camere.",
      },
      { type: "h2", text: "Quando NON conviene" },
      {
        type: "p",
        text: "Non conviene se vendi a tariffa fissa annuale (rifugi alpini con menu fisso, agriturismi con pacchetti pre-confezionati), se hai meno di 5 camere con un solo canale, se l'hotel è stagionale puro con un solo prodotto. In questi casi il margine di ottimizzazione è ridotto e il costo licenza non si ripaga.",
      },
      { type: "h2", text: "Il vero costo della gestione manuale" },
      {
        type: "p",
        text: "Tendiamo a non contare il tempo del titolare perché 'tanto è il mio'. Mettiamolo in numeri: in un hotel da 12 camere con tariffa attiva, gestire i prezzi a mano richiede in media 40 minuti al giorno (controllo competitor, aggiornamento date critiche, eventi, weekend). In un anno sono 240 ore. Anche valutando il tempo del titolare a 15 euro l'ora, sono 3.600 euro all'anno persi in attività ripetitive. La maggior parte degli RMS verticali per piccoli hotel costa meno della metà.",
      },
      { type: "h3", text: "Un esempio reale" },
      {
        type: "p",
        text: "Hotel di 14 camere, costiera ligure, tre tipologie. Prima dell'RMS: revenue management manuale del titolare, 1 ora al giorno in alta stagione, prezzi statici in bassa per stanchezza. Dopo l'RMS: 5 minuti al giorno di review, prezzi adattivi anche in bassa, ADR +6.4% sul primo anno e occupancy stabile. Il payback dell'investimento è arrivato al sesto mese.",
      },
      { type: "h2", text: "Le obiezioni comuni e come affrontarle" },
      {
        type: "ul",
        items: [
          "'I miei ospiti tornano sempre uguali': l'RMS non rovina la fedelizzazione, gestisce solo le tariffe pubbliche. I prezzi diretti per i fedelizzati restano sotto il tuo controllo.",
          "'Il mio gestionale non è collegato': molti PMS verticali italiani hanno integrazioni RMS native, anche piccoli. Va verificato caso per caso.",
          "'Ho paura che alzi troppo i prezzi': i guard-rail moderni impediscono prezzi anomali e tu mantieni cap massimo e minimo.",
          "'Costa troppo per la mia dimensione': è l'obiezione più datata. Il pricing 2026 per piccoli hotel parte da poche centinaia di euro al mese.",
        ],
      },
      { type: "h2", text: "Il piano d'ingresso ragionevole" },
      {
        type: "p",
        text: "Per un hotel piccolo che parte da zero, il percorso sano è: prima un mese di osservazione con dashboard (capisci dove perdi tariffe), poi tre mesi di RMS in modalità 'notify' (suggerimenti via email, decidi tu), poi attivazione autopilot graduale. Saltare l'osservazione iniziale è il modo migliore per spaventarsi e disattivare tutto al primo prezzo strano.",
      },
      {
        type: "cta",
        text: "Hai un hotel piccolo e vuoi capire se Santaddeo fa per te? Inizia dalla dashboard gratuita.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard gratuita",
      },
    ],
  },
  {
    slug: "rms-vs-gestione-manuale",
    title: "RMS vs gestione manuale dei prezzi: confronto onesto",
    description:
      "Differenze reali tra RMS automatico e gestione manuale dei prezzi: tempo, risultati, errori tipici. Quando ha senso ancora fare a mano.",
    keywords: ["rms vs manuale", "gestione prezzi hotel", "automazione pricing hotel"],
    cluster: "rms",
    publishedAt: "2026-04-24",
    readingMinutes: 6,
    relatedSlugs: ["cose-un-rms-hotel", "errori-pricing-hotel", "alternative-a-excel-hotel-pricing"],
    lead:
      "La gestione manuale dei prezzi ha ancora un senso in alcuni casi specifici. In altri costa molto più di quanto sembra.",
    body: [
      {
        type: "p",
        text: "Il dibattito 'RMS automatico vs gestione manuale' è meno bianco/nero di come viene presentato. Il revenue management non è solo formula matematica: c'è una componente di sensibilità di mercato che l'umano percepisce e che l'algoritmo a volte ignora. Il punto è capire quale livello di mix manuale-automatico fa al tuo hotel.",
      },
      { type: "h2", text: "Cosa fa meglio l'RMS" },
      {
        type: "p",
        text: "L'RMS è imbattibile su tre fronti: la velocità di risposta (cambia il prezzo entro un'ora dalla variazione di domanda), la coerenza (non si dimentica mai di una data critica, non ha giornate stanche), la profondità (può ottimizzare 365 giorni × 5 tipologie × 3 canali contemporaneamente, cosa che un umano non fa). Se hai più di una tariffa attiva e più di un canale, la matematica è dalla sua parte.",
      },
      { type: "h2", text: "Cosa fa meglio l'umano" },
      {
        type: "p",
        text: "L'umano vince su segnali deboli che l'algoritmo non ha modo di vedere: un evento locale appena annunciato, un competitor che ha appena chiuso, una richiesta di gruppo telefonica che cambia il quadro. Vince anche sulla negoziazione caso per caso (corporate, viaggi nozze, gruppi sportivi), dove serve sensibilità. Vince sui prodotti complessi: pacchetti benessere, esperienze, eventi privati. Tutto questo l'RMS non lo gestisce e non deve gestirlo.",
      },
      { type: "h2", text: "Il modello ibrido che funziona" },
      {
        type: "p",
        text: "Il setup più maturo nel 2026 è ibrido. L'RMS gestisce in autonomia i prezzi standard delle tipologie pubbliche su tutte le date e canali. L'umano interviene su tre cose: override manuali per eventi, gestione gruppi e corporate, validazione di prezzi anomali segnalati dai guard-rail. Questo modello fa risparmiare il 70-80% del tempo rispetto al puro manuale e mantiene il controllo dove serve davvero.",
      },
      { type: "h3", text: "Tre errori tipici della gestione 100% manuale" },
      {
        type: "ul",
        items: [
          "Prezzo statico in bassa stagione perché 'tanto non vendo niente': stai lasciando soldi sul tavolo nelle finestre di pickup last-minute.",
          "Mancato rilievo di un evento locale: prezzo standard durante un concerto sold-out cittadino e camere vendute a metà del valore.",
          "Lentezza di reazione su drop di domanda: ti accorgi che hai mezza casa vuota a 15 giorni e cali brutalmente, perdendo ADR senza recuperare occupancy.",
        ],
      },
      { type: "h2", text: "Tre errori tipici della gestione 100% automatica" },
      {
        type: "ul",
        items: [
          "Prezzi assurdi durante eventi non in calendario standard: l'algoritmo non li conosce e tiene i prezzi medi.",
          "Push aggressivi al rialzo che fanno perdere prenotazioni dirette di clienti fedeli, abituati a una soglia tariffaria coerente.",
          "Disallineamenti tra OTA e diretto se il sync fallisce e nessuno se ne accorge.",
        ],
      },
      { type: "h2", text: "Il test del weekend critico" },
      {
        type: "p",
        text: "Un test pragmatico per capire se sei pronto a passare a un modello più automatico. Prendi tre weekend critici dei prossimi sei mesi (festività, eventi noti, ponti). Per ognuno scrivi su carta il prezzo che faresti, motivandolo. Confronta poi con quello che proporrebbe il tuo RMS o, se non ce l'hai, simula con un foglio Excel pickup historic. Se il sistema azzecca due su tre dei tuoi weekend con motivazioni coerenti, sei pronto a delegargli i prezzi standard. Se ne sbaglia tre su tre, prima fai un'ottimizzazione del setup.",
      },
      { type: "h2", text: "La conclusione operativa" },
      {
        type: "p",
        text: "Non esiste 'meglio RMS o meglio manuale' in astratto. Esiste 'qual è il giusto livello di automazione per il mio hotel oggi'. Per la stragrande maggioranza degli hotel indipendenti italiani, oggi è: RMS in autopilot sui prezzi standard, umano in controllo su eventi e gruppi, dashboard sempre aperta per controllo diario. Se non hai ancora un RMS, parti dalla dashboard di osservazione: ti farà capire dove la gestione manuale ti sta costando più di quanto pensavi.",
      },
      {
        type: "cta",
        text: "Vuoi capire dove perdi soldi con la gestione manuale? Apri la dashboard Santaddeo gratis.",
        href: "/landing/dashboard-gratuita",
        label: "Prova la dashboard",
      },
    ],
  },
  {
    slug: "come-scegliere-un-rms",
    title: "Come scegliere un RMS hotel: checklist pratica",
    description:
      "La checklist concreta per scegliere un RMS hotel senza farsi sedurre dalle demo. 15 punti da verificare prima di firmare il contratto.",
    keywords: ["come scegliere rms", "valutare rms hotel", "checklist rms"],
    cluster: "rms",
    publishedAt: "2026-04-27",
    readingMinutes: 7,
    relatedSlugs: ["migliori-rms-hotel-2026", "rms-vs-gestione-manuale", "rms-integrato-pms"],
    lead:
      "Scegliere un RMS è una decisione che vivrai per 2-3 anni. Vale la pena spendere mezza giornata sulla checklist giusta.",
    body: [
      {
        type: "p",
        text: "L'errore più costoso nella scelta di un RMS non è scegliere il vendor sbagliato: è scegliere senza un metodo. Le demo commerciali sono tutte bellissime perché sono fatte su dati finti. Sui tuoi dati reali, le differenze emergono solo applicando una checklist precisa. Questo articolo è la checklist che useresti se chiedessi a un consulente esperto di accompagnarti nella scelta.",
      },
      { type: "h2", text: "Fase 1: capire il tuo punto di partenza" },
      {
        type: "ol",
        items: [
          "Quante camere hai e quante tipologie diverse?",
          "Quanti rate plan attivi (BAR, non rimborsabile, mezza pensione, ecc.)?",
          "Quali canali usi e in che proporzioni? (diretto, Booking, Expedia, altro)",
          "Hai stagionalità marcata o pickup costante?",
          "Quanto tempo dedichi al pricing oggi?",
          "Qual è il tuo ADR medio annuale e l'occupancy?",
        ],
      },
      {
        type: "p",
        text: "Senza queste sei risposte non puoi valutare nulla, perché non sai cosa stai cercando. Ognuna influenza il vendor giusto: hotel con poche camere e una tariffa ha bisogno di RMS verticali snelli; hotel con molti rate plan ha bisogno di motori complessi che li gestiscano nativamente.",
      },
      { type: "h2", text: "Fase 2: i 15 punti della checklist tecnica" },
      {
        type: "ol",
        items: [
          "Integrazione con il tuo PMS: nativa o via middleware? Real-time o batch?",
          "Storia di pricing: il sistema impara dai tuoi dati storici o parte zero?",
          "Forecasting: orizzonte massimo (30, 90, 365 giorni)?",
          "Mapping competitor: chi configura, come si mantiene aggiornato?",
          "Eventi e festività: gestiti nativamente o vanno inseriti a mano?",
          "Override manuali: facili da fare, tracciati, reversibili?",
          "Guard-rail: prezzi anomali bloccati o solo notificati?",
          "Modalità notify-only vs autopilot: passabili in 1 click?",
          "Reportistica: KPI core (ADR, RevPAR, RevPOR, occupancy) presenti?",
          "Mobile: si può controllare da telefono?",
          "Multi-utente: ruoli diversi (titolare, direttore, revenue, front desk)?",
          "Audit log: chi ha cambiato cosa e quando?",
          "Backup tariffe pre-RMS: si possono ripristinare se serve?",
          "API: esistono per esportare i dati altrove?",
          "Contratto: durata minima, clausola di uscita, penali?",
        ],
      },
      { type: "h2", text: "Fase 3: il test sui dati reali" },
      {
        type: "p",
        text: "Prima di firmare, chiedi al vendor un proof of value su almeno 14 giorni dei tuoi dati storici. Vuol dire: gli dai un export del tuo storico, lui ti mostra quali prezzi avrebbe proposto in ognuno di quei giorni e tu confronti con i prezzi reali e con il pickup ottenuto. Se il vendor rifiuta, è un segnale: o non ha la maturità tecnica per farlo, o sa che il suo motore non regge il confronto coi tuoi dati. Un vendor serio nel 2026 questo test lo fa volentieri.",
      },
      { type: "h2", text: "Fase 4: le persone, non solo il software" },
      {
        type: "p",
        text: "Un RMS è anche il team che ti supporta. Chiedi sempre: chi sarà il mio onboarding manager, posso parlare con due clienti vostri della mia dimensione, qual è il tempo medio di risposta del support. Se le risposte sono vaghe, il software può essere il migliore del mondo ma alla prima crisi sarai solo. La regola: in tre anni avrai più valore dal supporto che dall'algoritmo.",
      },
      { type: "h2", text: "Fase 5: la decisione finale" },
      {
        type: "p",
        text: "Dopo la fase 1-4 dovresti avere 2-3 vendor finalisti. La scelta finale si fa su tre criteri di sintesi: chi ha azzeccato meglio il proof of value, chi ha l'ecosistema di integrazione più solido col tuo PMS, chi ti dà la sensazione di volere il tuo successo e non solo la tua firma. Se due vendor sono pari sui primi due, il terzo criterio vince. Se sono pari su tutti e tre, vai con quello che ha il contratto più flessibile in uscita: ti dà più potere se le cose vanno male.",
      },
      {
        type: "cta",
        text: "Vuoi confrontare Santaddeo con altri vendor? Ti accompagniamo noi nella valutazione, senza pressione.",
        href: "/request-info",
        label: "Richiedi informazioni",
      },
    ],
  },
]
