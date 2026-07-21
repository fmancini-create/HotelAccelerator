import type { BlogArticle } from "../types"

export const CLUSTER_KPI: BlogArticle[] = [
  {
    slug: "cose-adr",
    title: "Cos'è l'ADR (Average Daily Rate) e come si calcola",
    description:
      "Definizione di ADR, come si calcola, perché è la metrica più letta degli hotel e perché da sola non basta a dirti se stai andando bene.",
    keywords: ["adr hotel", "average daily rate", "tariffa media giornaliera"],
    cluster: "kpi",
    publishedAt: "2026-05-10",
    readingMinutes: 5,
    relatedSlugs: ["cose-revpar", "come-aumentare-adr-hotel", "cose-occupancy-rate", "kpi-fondamentali-hotel"],
    lead:
      "L'ADR è la metrica più citata degli hotel, ma anche la più male interpretata. Cosa misura davvero, come si calcola e quali trappole evitare.",
    body: [
      {
        type: "p",
        text: "L'ADR, acronimo di Average Daily Rate (in italiano 'tariffa media giornaliera'), è il prezzo medio per camera venduta in un determinato periodo. È la prima metrica che si guarda nei report di un hotel, perché risponde alla domanda 'a quanto sto vendendo, in media, le mie camere?'. La sua semplicità apparente ne fa anche il KPI più frainteso.",
      },
      { type: "h2", text: "Come si calcola l'ADR" },
      {
        type: "p",
        text: "La formula base è: ADR = ricavo camera totale / numero di camere vendute. Il 'ricavo camera totale' è solo la quota camera, non comprende extra (colazione vendute separatamente, cene, spa, parking). Il 'numero di camere vendute' è il numero di room-night, cioè camera × notte: una doppia venduta per 3 notti conta 3 room-night.",
      },
      {
        type: "p",
        text: "Esempio concreto. Un hotel di 30 camere ha venduto in un mese 600 camere a un ricavo camera totale di 78.000 euro. ADR = 78.000 / 600 = 130 euro. Significa che, mediamente, ogni camera venduta è stata venduta a 130 euro per notte.",
      },
      { type: "h2", text: "ADR lordo, netto, fiscale" },
      {
        type: "p",
        text: "Esistono tre versioni di ADR che spesso si confondono. ADR lordo (commissioni OTA incluse): è quello che vedi nei report PMS. ADR netto (commissioni OTA dedotte): è quello che effettivamente incassi sui canali OTA. ADR fiscale: è quello che entra in fattura, escluse alcune tasse di soggiorno o servizi separati. Quando confronti hotel diversi, devi sapere quale versione ognuno sta usando: differenze di 8-12 euro tra le tre versioni sono normali.",
      },
      { type: "h2", text: "Le tre trappole dell'ADR" },
      { type: "h3", text: "1. ADR alta, RevPAR basso" },
      {
        type: "p",
        text: "Si può avere ADR alta vendendo solo le camere superior a prezzo premium e tenendo vuote le standard. ADR splendida, RevPAR pessimo. Per questo l'ADR va sempre letta insieme a occupancy e RevPAR.",
      },
      { type: "h3", text: "2. ADR di mix" },
      {
        type: "p",
        text: "Un mese in cui hai venduto principalmente le suite ha ADR strutturalmente più alta di un mese in cui hai venduto principalmente le doppie. Il confronto con anno precedente va fatto sempre 'a parità di mix' o aggiustato per tipologia, altrimenti vedi crescita ADR che è solo cambio di mix.",
      },
      { type: "h3", text: "3. ADR senza periodicità" },
      {
        type: "p",
        text: "L'ADR di un weekend non è confrontabile con l'ADR di un infrasettimanale, l'ADR di luglio non è confrontabile con quella di novembre. Confronti significativi sono YoY (stesso periodo anno scorso), MoM con stagionalità simile o vs budget.",
      },
      { type: "h2", text: "Quando l'ADR è una buona metrica e quando no" },
      {
        type: "p",
        text: "L'ADR è ottima quando vuoi capire la tua capacità di spuntare prezzo per camera venduta, confrontare strategie tariffarie nel tempo, benchmarkare con competitor su periodi paragonabili. Non è adatta come singola metrica per giudicare la performance complessiva: per quello serve il RevPAR. Non è adatta come obiettivo isolato: massimizzare l'ADR senza guardare l'occupancy porta a hotel sempre semivuoti.",
      },
      { type: "h2", text: "Cosa fare se l'ADR è bassa" },
      {
        type: "ul",
        items: [
          "Verifica il mix tipologie venduto: stai svendendo le superior?",
          "Verifica il mix canali: hai troppe OTA a sconto?",
          "Verifica le restrizioni di soggiorno: senza min stay sui weekend perdi ADR.",
          "Verifica la presenza di tariffe non rimborsabili a -20%: spesso erodono ADR.",
          "Verifica il pricing dei giorni di evento: prezzo standard durante eventi è ADR sprecata.",
        ],
      },
      {
        type: "cta",
        text: "Ognuna di queste verifiche è una leva: ecco la guida operativa con le 7 leve per aumentare l'ADR senza perdere occupazione, con esempi numerici.",
        href: "/blog/come-aumentare-adr-hotel",
        label: "Come aumentare l'ADR: 7 leve pratiche",
      },
      {
        type: "cta",
        text: "Vuoi monitorare ADR e RevPAR del tuo hotel in tempo reale? Apri la dashboard gratuita.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
    faqs: [
      {
        q: "Cosa significa ADR?",
        a: "ADR è l'acronimo di Average Daily Rate, in italiano 'tariffa media giornaliera'. Indica il prezzo medio per camera venduta in un determinato periodo e risponde alla domanda: a quanto sto vendendo, in media, le mie camere?",
      },
      {
        q: "Cosa vuol dire ADR in albergo?",
        a: "In albergo l'ADR è il ricavo medio incassato per ogni camera effettivamente venduta, calcolato sulla sola quota camera (senza extra come colazione, spa o parcheggio). È diverso dal RevPAR, che considera invece tutte le camere disponibili, vendute o meno.",
      },
      {
        q: "Come si calcola l'ADR di un hotel?",
        a: "L'ADR si calcola dividendo il ricavo camera totale per il numero di camere vendute (room-night) nello stesso periodo. Esempio: 12.000 € di ricavo camere su 100 room-night danno un ADR di 120 €. Si contano solo le camere vendute, non quelle disponibili.",
      },
      {
        q: "Qual è la differenza tra ADR e RevPAR?",
        a: "L'ADR misura il ricavo medio per camera venduta; il RevPAR (Revenue Per Available Room) misura il ricavo medio per camera disponibile. Il RevPAR combina ADR e occupazione (RevPAR = ADR × tasso di occupazione) ed è l'indicatore più completo della performance di un hotel.",
      },
      {
        q: "Un ADR alto è sempre positivo?",
        a: "No. Un ADR alto con occupazione bassa può significare prezzi troppo alti che scoraggiano le prenotazioni. Per questo l'ADR va sempre letto insieme al tasso di occupazione e al RevPAR: da solo non dice se l'hotel sta massimizzando i ricavi.",
      },
    ],
  },
  {
    slug: "cose-revpar",
    title: "Cos'è il RevPAR e perché è il KPI più importante",
    description:
      "Definizione di RevPAR (Revenue Per Available Room), come si calcola, perché è il KPI più sintetico per giudicare un hotel e come si interpreta.",
    keywords: ["revpar", "revenue per available room", "kpi hotel"],
    cluster: "kpi",
    publishedAt: "2026-05-12",
    readingMinutes: 5,
    relatedSlugs: ["cose-adr", "cose-occupancy-rate", "cose-revpor"],
    lead:
      "Se devi guardare un solo numero del tuo hotel, guarda il RevPAR. È il KPI che combina prezzo e occupazione in una metrica sola.",
    body: [
      {
        type: "p",
        text: "Il RevPAR (Revenue Per Available Room, ricavo per camera disponibile) è il KPI più importante dell'hôtellerie moderna. A differenza dell'ADR che parla solo di prezzo e dell'occupancy che parla solo di camere vendute, il RevPAR combina i due in una metrica unica. Per questo è il numero che troverai sempre nei report di catena, nei pitch di analisti, nei benchmark di settore.",
      },
      { type: "h2", text: "Come si calcola il RevPAR" },
      {
        type: "p",
        text: "Esistono due formule equivalenti. La prima: RevPAR = ricavo camera totale / camere disponibili (non vendute). La seconda: RevPAR = ADR × occupancy. Entrambe danno lo stesso risultato.",
      },
      {
        type: "p",
        text: "Esempio. Hotel di 30 camere, 30 giorni di apertura, ricavo camera totale 78.000 euro. Camere disponibili = 30 × 30 = 900. RevPAR = 78.000 / 900 = 86,67 euro. Stessa cosa via ADR × occupancy: ADR 130 euro × occupancy 66,7% = 86,67 euro. Identico.",
      },
      { type: "h2", text: "Perché è più importante di ADR e occupancy presi singolarmente" },
      {
        type: "p",
        text: "Immagina due hotel della stessa dimensione. Hotel A: ADR 180 euro, occupancy 50%. RevPAR = 90 euro. Hotel B: ADR 120 euro, occupancy 80%. RevPAR = 96 euro. Hotel B fa più fatturato per camera disponibile, anche se ha ADR molto più bassa. Senza RevPAR, l'analisi superficiale direbbe che Hotel A sta facendo meglio (ADR alta = prestigio). La realtà è che B sta sfruttando meglio l'asset hotel.",
      },
      { type: "h2", text: "Le tre trappole del RevPAR" },
      { type: "h3", text: "1. Il RevPAR non considera i costi" },
      {
        type: "p",
        text: "Un hotel che spinge l'occupancy con flash sale aggressivi può avere RevPAR alto ma costi variabili (pulizie, breakfast, energy) che divorano il margine. Per questo si è iniziato a parlare di GOPPAR (Gross Operating Profit Per Available Room), che considera anche la marginalità.",
      },
      { type: "h3", text: "2. Il RevPAR non distingue tra canali" },
      {
        type: "p",
        text: "RevPAR di 90 euro lordo con 60% via Booking (commissione 18%) ha RevPAR netto 80 euro. RevPAR di 90 euro con 80% diretto ha RevPAR netto 88 euro. Il RevPAR vero è quello netto, ma quasi nessun report lo calcola spontaneamente.",
      },
      { type: "h3", text: "3. Il RevPAR può essere gonfiato con allotment" },
      {
        type: "p",
        text: "Allotment generosi a tour operator a tariffa netta bassa fanno salire occupancy e quindi RevPAR. Ma il fatturato reale si riduce. Per questo si guarda anche al fatturato totale assoluto, non solo al RevPAR.",
      },
      { type: "h2", text: "Benchmark di RevPAR per fascia" },
      {
        type: "p",
        text: "I numeri tipici cambiano per geografia, dimensione, segmento. Indicativamente per il mercato italiano 2026: hotel 3 stelle urbano medio: 60-90 euro. Hotel 4 stelle urbano centrale grande città: 110-180 euro. Resort 4 stelle costiero alta stagione: 140-220 euro, bassa 50-80. Hotel 5 stelle leisure top: 300+ euro. I numeri vanno presi con cautela, ma servono come riferimento d'ordine di grandezza.",
      },
      { type: "h2", text: "Come migliorare il RevPAR" },
      {
        type: "ul",
        items: [
          "Identifica le date critiche con RevPAR sotto target e investi tempo lì.",
          "Sposta il mix di canale verso il diretto: stesso ADR lordo, RevPAR netto più alto.",
          "Aumenta l'ADR sui giorni di evento e festività, dove l'occupancy è già alta.",
          "Aumenta l'occupancy sui giorni deboli con strategie di segmento, non con sconto generalizzato.",
          "Lavora sul mix tipologie per spingere camere superior che hanno RevPAR strutturalmente più alto.",
        ],
      },
      {
        type: "cta",
        text: "Vuoi vedere il RevPAR del tuo hotel in tempo reale, già confrontato YoY? La dashboard è gratuita.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "cose-occupancy-rate",
    title: "Cos'è l'occupancy rate e come usarlo bene",
    description:
      "Definizione di tasso di occupazione (occupancy rate), come si calcola, perché non basta da solo e come integrarlo con ADR e RevPAR.",
    keywords: ["occupancy rate", "tasso di occupazione hotel", "occupancy"],
    cluster: "kpi",
    publishedAt: "2026-05-13",
    readingMinutes: 5,
    relatedSlugs: ["cose-adr", "cose-revpar", "kpi-fondamentali-hotel"],
    lead:
      "L'occupancy è la metrica più intuitiva degli hotel ma anche la più ingannevole se letta da sola. Vediamo come usarla bene.",
    body: [
      {
        type: "p",
        text: "L'occupancy rate, o tasso di occupazione, misura la percentuale di camere vendute rispetto alle camere disponibili in un determinato periodo. È la metrica più intuitiva: 80% di occupancy significa che 8 camere su 10 sono state vendute. La sua semplicità nasconde però due insidie principali, che vediamo di seguito.",
      },
      { type: "h2", text: "Come si calcola" },
      {
        type: "p",
        text: "Formula: occupancy = camere vendute / camere disponibili. Le 'camere disponibili' sono quelle effettivamente vendibili: vanno escluse camere fuori uso (manutenzione), camere riservate per uso interno, camere in chiusura programmata. Se l'hotel apre per 25 giorni del mese (chiuso 5 per ferie), le camere disponibili di un 30 camere sono 25 × 30 = 750, non 900.",
      },
      { type: "h2", text: "Le due insidie classiche" },
      { type: "h3", text: "1. Occupancy alta non significa hotel sano" },
      {
        type: "p",
        text: "Si può avere 95% di occupancy svendendo a 50 euro: occupancy bellissima, ADR rovinata, RevPAR mediocre. È la trappola del 'devo riempire' che porta a sconti aggressivi. L'occupancy va sempre letta accanto all'ADR.",
      },
      { type: "h3", text: "2. Occupancy media inganna sulla volatilità" },
      {
        type: "p",
        text: "Un hotel che fa 90% nei weekend e 30% infrasettimanale ha occupancy media 60%. Un hotel che fa 60% costante ha la stessa media ma profilo molto diverso. Il primo ha problemi di pricing infrasettimanale; il secondo ha problemi di posizionamento globale. Ognuno richiede strategia diversa, ma la media occupancy non te lo dice.",
      },
      { type: "h2", text: "Le 4 sfaccettature dell'occupancy" },
      {
        type: "ol",
        items: [
          "Occupancy giorno per giorno: la più dettagliata, mostra la volatilità reale.",
          "Occupancy per tipologia: spesso le standard sono al 90% e le superior al 50%, segnale di pricing sbilanciato.",
          "Occupancy per canale: dice quanta della tua occupancy viene da OTA vs diretto.",
          "Occupancy YoY pari periodo: confronto con stesso periodo anno scorso, l'unico significativo per capire se stai crescendo.",
        ],
      },
      { type: "h2", text: "Quando l'occupancy bassa è OK" },
      {
        type: "p",
        text: "Non sempre occupancy bassa è un problema. In bassa stagione pura, occupancy 35-45% può essere il massimo realisticamente raggiungibile in quel mercato in quel periodo. Forzarla con sconti aggressivi rovina ADR senza compensazione. La domanda giusta non è 'come arrivo al 60%' ma 'qual è il RevPAR ottimale per questo periodo?'. Spesso è 35% × 100 euro ADR = 35 euro RevPAR meglio che 50% × 60 euro ADR = 30 euro.",
      },
      { type: "h2", text: "Quando l'occupancy alta è un campanello" },
      {
        type: "p",
        text: "Occupancy 90%+ con ADR statica è un segnale che stai sotto-prezzando. Se il mercato ti riempie a quel prezzo, probabilmente accetterebbe il 5-10% in più senza perdere prenotazioni. La regola operativa: se vai oltre l'85% di occupancy per più di 21 giorni consecutivi, il pricing è troppo basso.",
      },
      { type: "h2", text: "L'occupancy come segnale di pickup" },
      {
        type: "p",
        text: "L'uso più potente dell'occupancy è prospettivo, non retrospettivo. Confrontare occupancy attesa a 30 giorni con stesso lead time anno scorso ti dice se sei avanti, in linea o indietro nel pickup. È la base del revenue management dinamico: se sei avanti del 5% rispetto al pari periodo, alzi i prezzi; se sei indietro del 5%, valuti azioni; se sei indietro del 15%, intervieni con urgenza.",
      },
      {
        type: "cta",
        text: "Vuoi monitorare occupancy storica e prospettica del tuo hotel? La dashboard te le mostra entrambe.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "cose-revpor",
    title: "Cos'è il RevPOR (Revenue Per Occupied Room)",
    description:
      "Definizione di RevPOR, differenza con ADR e RevPAR, perché è la metrica chiave per leggere la marginalità di una camera occupata.",
    keywords: ["revpor", "revenue per occupied room", "marginalità camera"],
    cluster: "kpi",
    publishedAt: "2026-05-15",
    readingMinutes: 5,
    relatedSlugs: ["cose-adr", "cose-revpar", "kpi-fondamentali-hotel"],
    lead:
      "Il RevPOR è il KPI meno discusso ma il più importante per capire quanto fattura una camera quando è occupata. Differisce dall'ADR e dal RevPAR in modo sottile ma cruciale.",
    body: [
      {
        type: "p",
        text: "Il RevPOR (Revenue Per Occupied Room, ricavo per camera occupata) è una metrica meno citata di ADR e RevPAR ma che fornisce un'informazione diversa e complementare. La sua particolarità è che include nel ricavo anche tutto quello che il cliente spende oltre la camera: colazioni, ristorante, spa, bar, parcheggio, servizi. Per questo è la metrica più completa per misurare il valore commerciale di una camera occupata.",
      },
      { type: "h2", text: "Come si calcola" },
      {
        type: "p",
        text: "Formula: RevPOR = ricavo totale (camera + extras) / camere vendute. La differenza con l'ADR è che l'ADR considera solo la quota camera, mentre il RevPOR considera tutto il ricavo generato dal cliente nel suo soggiorno.",
      },
      {
        type: "p",
        text: "Esempio. Hotel di 30 camere, 600 camere vendute nel mese, ricavo camera 78.000 euro, ricavo F&B 22.000 euro, ricavo spa 8.000 euro. ADR = 78.000/600 = 130 euro. RevPOR = (78.000 + 22.000 + 8.000) / 600 = 180 euro.",
      },
      { type: "h2", text: "Perché RevPOR e RevPAR sono entrambi necessari" },
      {
        type: "p",
        text: "Il RevPAR misura quanto frutta l'asset hotel nella sua interezza (camere disponibili). Il RevPOR misura quanto frutta ogni cliente che entra. Sono prospettive diverse. Un hotel può avere RevPAR basso (poca occupancy) e RevPOR altissimo (i clienti spendono molto): è il caso di hotel di lusso a bassa occupancy. Un altro può avere RevPAR alto (sempre pieno) e RevPOR mediocre (ogni cliente spende poco): tipico hotel low-cost ad alta occupancy.",
      },
      { type: "h2", text: "Come si interpreta una variazione di RevPOR" },
      {
        type: "p",
        text: "RevPOR cresce: il valore medio per cliente aumenta. Cause possibili: stai vendendo più tipologie superior (ADR sale), il take rate F&B e ancillary cresce, hai cambiato mix segmenti verso clientela più alto-spendente. RevPOR cala: i clienti spendono mediamente meno. Cause possibili: stai facendo sconti aggressivi sul rate, F&B in calo, mix verso clienti più price-sensitive.",
      },
      { type: "h2", text: "Le quattro leve per aumentare il RevPOR" },
      {
        type: "ol",
        items: [
          "Ancillary mirati: parking, late check-out, early check-in con prezzo. Ogni 5 euro di ancillary medio per camera valgono 5 euro di RevPOR pieno.",
          "F&B incluso vs venduto: la mezza pensione bundle alza RevPOR ma cambia anche la natura del cliente.",
          "Upselling al check-in: 8-12% di tasso di upselling è realistico in un hotel ben formato; vale 5-15 euro di RevPOR.",
          "Pacchetti tematici: come visto prima, alzano valore percepito e ricavo per camera con costo marginale basso.",
        ],
      },
      { type: "h2", text: "RevPOR e tipo di hotel" },
      {
        type: "p",
        text: "Il RevPOR è strutturalmente diverso a seconda del tipo di hotel. B&B puro: RevPOR ≈ ADR, perché non ci sono molti extras. Resort 4 stelle con ristorante: RevPOR può essere 30-50% più alto di ADR. Hotel 5 stelle con ristorante stellato e spa: RevPOR può essere il doppio dell'ADR. Confrontare RevPOR di hotel di tipo diverso non ha molto senso; confrontare lo stesso hotel YoY o vs target è la pratica corretta.",
      },
      { type: "h2", text: "Quando concentrarsi sul RevPOR" },
      {
        type: "p",
        text: "Concentrati sul RevPOR quando vuoi: aumentare la marginalità senza cambiare ADR; capire se il tuo hotel sta sfruttando bene gli asset oltre la camera (ristorante, spa, parking); benchmarkare YoY l'effetto di iniziative di upselling. Non concentrarti sul RevPOR come KPI primario se l'hotel è puro B&B con pochi servizi: in quel caso RevPAR e ADR sono sufficienti.",
      },
      {
        type: "cta",
        text: "Vuoi vedere RevPOR e RevPAR del tuo hotel separati e confrontati YoY? La dashboard te li mostra entrambi.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
  {
    slug: "kpi-fondamentali-hotel",
    title: "I 7 KPI fondamentali di un hotel: cosa monitorare ogni settimana",
    description:
      "I sette KPI che ogni gestore di hotel dovrebbe monitorare settimanalmente: cosa misurano, perché contano, quale soglia è 'normale'.",
    keywords: ["kpi hotel", "metriche hotel", "kpi alberghieri"],
    cluster: "kpi",
    publishedAt: "2026-05-17",
    readingMinutes: 7,
    relatedSlugs: ["cose-adr", "cose-revpar", "cose-revpor"],
    lead:
      "Sette KPI bastano a capire come va un hotel. Più di sette diventa rumore; meno di sette è guidare al buio.",
    body: [
      {
        type: "p",
        text: "Esistono decine di metriche utilizzabili per misurare un hotel. Tre sono fondamentali, sette sono sufficienti, oltre dieci diventa rumore informativo. In questo articolo ti illustro i sette KPI che, se monitorati una volta a settimana, ti dicono il 90% di quello che ti serve sapere sull'andamento del tuo hotel.",
      },
      { type: "h2", text: "1. RevPAR (Revenue Per Available Room)" },
      {
        type: "p",
        text: "Il KPI più sintetico. Combina ADR e occupancy. Se cresce YoY e batte il budget, l'hotel sta andando bene; se scende, scava in ADR e occupancy separati per capire dove sta il problema. Frequenza di monitoraggio: settimanale per il rolling, mensile per il consuntivo.",
      },
      { type: "h2", text: "2. Occupancy rate" },
      {
        type: "p",
        text: "Il riempimento dell'hotel. Va guardato giorno per giorno (per identificare giorni deboli) e in trend pickup (occupancy a 30 giorni vs lead time anno scorso). Questa seconda lettura è quella che ti permette di intervenire prima, non dopo.",
      },
      { type: "h2", text: "3. ADR (Average Daily Rate)" },
      {
        type: "p",
        text: "La capacità di spuntare prezzo. Sempre letto insieme al mix tipologie, perché la sola crescita ADR può essere effetto di mix più che di pricing reale.",
      },
      { type: "h2", text: "4. Mix di canale" },
      {
        type: "p",
        text: "Quanta della tua occupancy viene da diretto, OTA, GDS, allotment, gruppi. Va monitorato perché ogni canale ha ADR netto diverso. Spostare 5 punti dal mix OTA al diretto è una delle leve di marginalità più importanti.",
      },
      { type: "h2", text: "5. Pickup a 30 giorni" },
      {
        type: "p",
        text: "Il numero di prenotazioni entrate negli ultimi 30 giorni per ognuno dei 90 giorni futuri. È il KPI prospettico più utile: ti dice se stai entrando bene o male per il prossimo mese-trimestre. Va sempre confrontato con stesso lead time anno precedente, non con il consuntivo.",
      },
      { type: "h2", text: "6. Cancellation rate" },
      {
        type: "p",
        text: "Quante prenotazioni ricevi che si cancellano prima del check-in. Il valore standard nel mercato italiano è 25-35%; sopra il 40% indica problemi (troppo non rimborsabile, condizioni di cancellazione troppo morbide, prezzo non competitivo che spinge il cliente a cercare alternative). Va monitorato per canale: se il cancellation rate Booking è il doppio del cancellation rate diretto, c'è un'asimmetria da capire.",
      },
      { type: "h2", text: "7. Review score medio" },
      {
        type: "p",
        text: "Booking, Google, TripAdvisor. Il review score non è un KPI commerciale diretto, ma è il moltiplicatore di tutti gli altri: passare da 8.4 a 8.8 vale +5-8% di ADR sostenibile. Monitorarlo settimanalmente, leggere ogni recensione negativa, lavorare sui pattern (sempre wifi? sempre pulizia? sempre check-in lento?).",
      },
      { type: "h2", text: "I KPI che NON sono nei sette e perché" },
      {
        type: "ul",
        items: [
          "GOPPAR: utile a livello di catena, troppo lento per il monitoraggio settimanale di un singolo hotel.",
          "TrevPAR: include tutti i ricavi, ma per hotel piccolo si confonde con il fatturato totale.",
          "Cost per Acquisition: rilevante in marketing, ma non nei sette KPI operativi.",
          "Net Promoter Score: utile, ma il review score pubblico è più diretto e azionabile.",
        ],
      },
      { type: "h2", text: "Come strutturare il review settimanale" },
      {
        type: "p",
        text: "30 minuti il lunedì mattina con i 7 KPI in dashboard. Per ognuno: valore corrente, delta vs settimana scorsa, delta vs stesso periodo anno scorso. Identifica 1-2 anomalie (KPI che si discosta più del 5% senza ragione apparente) e dedica la settimana ad agire su quelle. Più di 2 anomalie alla volta significa fare niente bene; meno di 1 anomalia significa che probabilmente non stai guardando i KPI giusti.",
      },
      {
        type: "cta",
        text: "Vuoi una dashboard con i 7 KPI già configurati per il tuo hotel? Inizia gratis.",
        href: "/landing/dashboard-gratuita",
        label: "Apri la dashboard",
      },
    ],
  },
]
