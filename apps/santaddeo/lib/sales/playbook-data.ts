/**
 * Disco Vendita SANTADDEO — contenuti statici.
 *
 * Strumento operativo per i venditori: domande di scoperta da fare
 * all'albergatore, gestione delle obiezioni piu' comuni, traccia del pitch
 * a fasi e frasi/aperture pronte da usare in chiamata.
 *
 * IMPORTANTE: questi contenuti riguardano ESCLUSIVAMENTE SANTADDEO
 * (revenue management e pricing dinamico automatico per hotel). Non
 * inserire qui funzionalita' di altri prodotti.
 *
 * Convenzione testo: si usano apostrofi ASCII al posto degli accenti
 * (es. "e'", "piu'", "perche'") per coerenza con glossary-data.ts.
 */

export type PlaybookSection = "discovery" | "objections" | "pitch" | "phrases"

export const SECTIONS: {
  value: PlaybookSection
  label: string
  description: string
}[] = [
  {
    value: "discovery",
    label: "Domande di scoperta",
    description:
      "Domande da fare all'albergatore per capire come lavora e dove SANTADDEO porta valore.",
  },
  {
    value: "objections",
    label: "Gestione obiezioni",
    description: "Le obiezioni piu' comuni e come rispondere con sicurezza.",
  },
  {
    value: "pitch",
    label: "Traccia del pitch",
    description: "Lo script della chiamata a fasi: apertura, scoperta, valore, chiusura.",
  },
  {
    value: "phrases",
    label: "Frasi pronte",
    description: "Aperture, ganci di valore e chiusure copiabili al volo.",
  },
]

/* ────────────────────────── DOMANDE DI SCOPERTA ────────────────────────── */

export interface DiscoveryQuestion {
  id: string
  question: string
  /** Perche' poni questa domanda: cosa stai cercando di capire. */
  why: string
  /** Risposta che indica un buon terreno per SANTADDEO. */
  goodAnswer: string
  /** Risposta che e' un campanello d'allarme o che richiede attenzione. */
  redFlag: string
  /** Come agganci il valore di SANTADDEO partendo dalla risposta. */
  bridge: string
}

export const DISCOVERY: DiscoveryQuestion[] = [
  {
    id: "d-pricing-oggi",
    question: "Come gestite oggi i prezzi delle camere? A mano o con un software?",
    why: "E' la domanda di apertura della scoperta: capisci subito il livello di maturita' revenue e se c'e' gia' un concorrente in casa.",
    goodAnswer:
      "\"Li gestiamo a mano / li cambia il titolare ogni tanto\": terreno perfetto, c'e' tanto margine di miglioramento e nessuno strumento radicato.",
    redFlag:
      "\"Abbiamo gia' un RMS\" (es. un competitor): non e' un no, ma serve capire se sono soddisfatti e perche'.",
    bridge:
      "Se a mano: \"Quindi il prezzo dipende dal tempo che riuscite a dedicarci. SANTADDEO lo aggiorna ogni giorno da solo, sulla base di domanda reale, occupazione e competitor, mentre voi pensate agli ospiti.\"",
  },
  {
    id: "d-frequenza",
    question: "Ogni quanto aggiornate le tariffe?",
    why: "Misura quanto e' reattivo il loro pricing. Chi aggiorna 'quando si ricorda' lascia soldi sul tavolo ogni giorno.",
    goodAnswer:
      "\"Una volta a settimana / quando ci accorgiamo che siamo pieni\": prezzo statico = revenue perso, leva di vendita fortissima.",
    redFlag:
      "\"Piu' volte al giorno con regole automatiche\": sono gia' evoluti, sposta il discorso su precisione e tempo risparmiato.",
    bridge:
      "\"Il mercato si muove ogni ora: un evento, un competitor che alza, un buco di occupazione. SANTADDEO ricalcola il prezzo ottimale ogni giorno per ogni data futura, cosa impossibile da fare a mano.\"",
  },
  {
    id: "d-ota",
    question: "Su quali OTA siete presenti e come tenete allineati i prezzi e la disponibilita'?",
    why: "Capisci la complessita' della loro distribuzione e il rischio di disallineamenti (overbooking, parita' tariffaria).",
    goodAnswer:
      "\"Booking, Expedia, e cambiamo a mano su ognuna\": gestione frammentata e a rischio errori, valore immediato dell'automazione.",
    redFlag:
      "\"Solo Booking e basta\": ok, ma esplora se vogliono crescere sulla distribuzione.",
    bridge:
      "\"SANTADDEO si collega al vostro channel manager e spinge il prezzo giusto su tutti i canali insieme: niente piu' aggiornamenti manuale per canale, niente disallineamenti.\"",
  },
  {
    id: "d-pms",
    question: "Che PMS e channel manager usate?",
    why: "Verifica la compatibilita' tecnica e mostra competenza. E' anche un modo per capire quanto sono strutturati.",
    goodAnswer:
      "Un PMS/channel manager tra quelli integrati: l'attivazione e' rapida, puoi dirlo con sicurezza.",
    redFlag:
      "Un gestionale poco diffuso o nessun channel manager: segna la domanda per il team tecnico, non promettere integrazioni che non esistono.",
    bridge:
      "\"Ci integriamo direttamente con il vostro [PMS]: leggiamo occupazione e prenotazioni in automatico e rimandiamo indietro i prezzi. Per voi non cambia il modo di lavorare.\"",
  },
  {
    id: "d-chi-pricing",
    question: "Chi si occupa del pricing e del revenue nella struttura?",
    why: "Identifica il decisore e il 'dolore' personale: spesso e' il titolare che lo fa la sera, togliendo tempo ad altro.",
    goodAnswer:
      "\"Me ne occupo io la sera / nei ritagli\": il dolore e' il tempo personale, leva emotiva forte sul titolare.",
    redFlag:
      "\"Abbiamo un revenue manager dedicato\": parla di come SANTADDEO lo potenzia, non lo sostituisce.",
    bridge:
      "\"Quindi e' tempo tolto a voi e alla struttura. SANTADDEO fa il lavoro di analisi al posto vostro: voi restate sempre in controllo, ma senza passarci le serate.\"",
  },
  {
    id: "d-alta-richiesta",
    question: "Come decidete il prezzo quando c'e' un weekend di alta richiesta o un evento in citta'?",
    why: "Fa emergere se sfruttano davvero i picchi di domanda o se vendono allo stesso prezzo di sempre (revenue perso).",
    goodAnswer:
      "\"Alziamo un po', a sensazione\": non massimizzano i picchi, esempio concreto di soldi lasciati sul tavolo.",
    redFlag:
      "\"Abbiamo un calendario eventi e regole precise\": sono bravi, valorizza l'automazione e la copertura su tutte le date.",
    bridge:
      "\"SANTADDEO conosce gli eventi e legge la domanda reale: nelle date calde alza il prezzo al punto giusto, in quelle deboli lo abbassa per riempire. Cattura ogni picco, anche quelli che sfuggono.\"",
  },
  {
    id: "d-competitor",
    question: "Tenete d'occhio i prezzi dei vostri competitor? Come?",
    why: "Capisci se hanno visibilita' sul mercato o se navigano a vista.",
    goodAnswer:
      "\"Ogni tanto guardo su Booking come stanno gli altri\": controllo manuale e saltuario, facilmente superabile.",
    redFlag:
      "\"Usiamo gia' un tool di rate shopping\": chiedi se quei dati guidano poi davvero i prezzi o restano solo un report.",
    bridge:
      "\"Guardare i competitor e' utile solo se poi agisci. SANTADDEO li monitora in automatico e usa quei dati per posizionare il vostro prezzo, non solo per mostrarvi un grafico.\"",
  },
  {
    id: "d-revpar",
    question: "Sapete qual e' il vostro RevPAR e come si sta muovendo rispetto all'anno scorso?",
    why: "Qualifica la maturita' revenue del cliente e introduce il linguaggio dei numeri su cui SANTADDEO lavora.",
    goodAnswer:
      "\"Non saprei dirti il RevPAR\": opportunita' per educare e posizionarti come consulente, non come venditore.",
    redFlag:
      "Conoscono RevPAR, ADR e occupazione a memoria: cliente evoluto, alza il livello tecnico della conversazione.",
    bridge:
      "\"SANTADDEO lavora proprio per far crescere il RevPAR: trova l'equilibrio tra tariffa e occupazione che a mano e' quasi impossibile da centrare ogni giorno.\"",
  },
  {
    id: "d-tempo",
    question: "Quanto tempo a settimana dedicate, in tutto, alla gestione delle tariffe e dei canali?",
    why: "Quantifica il costo nascosto del lavoro manuale, da riconvertire in valore (tempo restituito).",
    goodAnswer:
      "\"Diverse ore, e' un peso\": dolore chiaro e misurabile, perfetto per il ritorno sull'investimento.",
    redFlag:
      "\"Pochissimo, e' tutto automatizzato\": il valore non e' il tempo ma la precisione e i ricavi, sposta li' il discorso.",
    bridge:
      "\"Mettiamo che siano X ore a settimana: sono ore tolte agli ospiti e alla struttura. Con SANTADDEO quelle ore le recuperate e i prezzi sono pure migliori.\"",
  },
  {
    id: "d-invenduto",
    question: "Vi capita di restare con camere invendute sotto data, o al contrario di vendere tutto troppo presto a prezzo basso?",
    why: "Fa toccare con mano i due errori classici del pricing statico: sottoprezzo nei picchi e overprice nei buchi.",
    goodAnswer:
      "\"Si', a volte ci ritroviamo pieni a prezzo basso o vuoti all'ultimo\": dolore concreto, e' esattamente cio' che SANTADDEO risolve.",
    redFlag:
      "\"No, riempiamo sempre bene\": riempire 'sempre' a volte vuol dire prezzi troppo bassi: indaga sull'ADR.",
    bridge:
      "\"Sono i due classici: aver venduto troppo presto a poco, o restare vuoti. SANTADDEO regola il prezzo nel tempo per riempire alla tariffa piu' alta possibile, data per data.\"",
  },
]

/* ───────────────────────────── OBIEZIONI ───────────────────────────── */

export type ObjectionCategory = "concorrenza" | "prezzo" | "fiducia" | "tempo" | "status-quo"

export const OBJECTION_CATEGORIES: {
  value: ObjectionCategory
  label: string
}[] = [
  { value: "concorrenza", label: "Concorrenza" },
  { value: "prezzo", label: "Prezzo / costo" },
  { value: "fiducia", label: "Fiducia / controllo" },
  { value: "tempo", label: "Tempo / priorita'" },
  { value: "status-quo", label: "Faccio gia' da solo" },
]

export interface Objection {
  id: string
  objection: string
  category: ObjectionCategory
  /** Risposta consigliata da dare. */
  response: string
  /** Consiglio tattico per il venditore (tono, follow-up). */
  tip?: string
}

export const OBJECTIONS: Objection[] = [
  {
    id: "o-revenue-manager",
    objection: "Ho gia' un revenue manager.",
    category: "concorrenza",
    response:
      "\"Ottimo, vuol dire che date valore al revenue. SANTADDEO non sostituisce il vostro revenue manager: gli toglie il lavoro ripetitivo di aggiornare i prezzi ogni giorno e gli da' analisi su domanda e competitor pronte all'uso. Cosi' lui ragiona sulla strategia invece di passare le giornate a cambiare tariffe.\"",
    tip: "Posiziona SANTADDEO come potenziatore, mai come minaccia al posto di lavoro: il revenue manager puo' diventare il tuo miglior alleato interno.",
  },
  {
    id: "o-costa-troppo",
    objection: "Costa troppo.",
    category: "prezzo",
    response:
      "\"Capisco. Guardiamolo come un investimento: basta una manciata di camere in piu' vendute al prezzo giusto in un mese per ripagarlo. La domanda vera non e' quanto costa, ma quanto state lasciando sul tavolo ogni notte con i prezzi fermi. Le faccio vedere una stima sul vostro caso?\"",
    tip: "Sposta sempre dal costo al ritorno. Se hai i dati della struttura, mostra una stima di uplift RevPAR concreta invece di discutere la cifra.",
  },
  {
    id: "o-automatismo",
    objection: "Non mi fido a lasciare i prezzi gestiti da un automatismo.",
    category: "fiducia",
    response:
      "\"E' giusto, e' la sua struttura. Per questo restate sempre voi al comando: potete mettere prezzi minimi e massimi, regole vostre, e approvare prima che vada online. SANTADDEO propone, voi decidete fin quando volete. Molti partono in modalita' supervisionata e attivano l'automatico solo quando si fidano dei risultati.\"",
    tip: "La leva e' il controllo, non la cessione. Offri sempre la partenza 'supervisionata' con limiti min/max per abbassare il rischio percepito.",
  },
  {
    id: "o-gestionale",
    objection: "Uso gia' il mio gestionale / channel manager, mi basta.",
    category: "concorrenza",
    response:
      "\"Perfetto, e SANTADDEO ci lavora insieme, non al posto suo. Il gestionale distribuisce i prezzi; noi decidiamo QUALE prezzo mettere. Il channel manager fa l'autista, SANTADDEO e' il navigatore che sceglie la strada migliore. Si collega al vostro e lo rende piu' intelligente.\"",
    tip: "Chiarisci la differenza di ruolo: channel manager = distribuzione, SANTADDEO = decisione di prezzo. Non sono concorrenti.",
  },
  {
    id: "o-faccio-da-solo",
    objection: "Lo faccio a mano da anni e mi e' sempre andata bene.",
    category: "status-quo",
    response:
      "\"E si vede che lo fate con cura, complimenti. La domanda e': potreste fare ancora meglio senza dedicarci tutto quel tempo? Quello che voi fate a sensazione su poche date, SANTADDEO lo fa con i dati su tutte le date insieme, ogni giorno. Non e' fare diversamente, e' fare di piu' e in meno tempo.\"",
    tip: "Mai sminuire il lavoro fatto finora: validalo e poi alza l'asticella su scala e precisione.",
  },
  {
    id: "o-piccolo",
    objection: "Siamo una struttura piccola, non ci serve.",
    category: "status-quo",
    response:
      "\"Anzi, proprio perche' siete piccoli ogni camera pesa di piu'. Le grandi catene hanno interi uffici revenue; SANTADDEO da' a voi la stessa potenza di calcolo senza assumere nessuno. E' come avere un revenue manager always-on al costo di un abbonamento.\"",
    tip: "Trasforma la piccola dimensione in un punto di forza: meno margine d'errore, quindi piu' bisogno di ottimizzare ogni camera.",
  },
  {
    id: "o-ci-penso",
    objection: "Devo pensarci / parlarne con il socio.",
    category: "tempo",
    response:
      "\"Giustissimo, e' una decisione da prendere insieme. Per aiutarvi a valutarla bene, vi preparo una stima sul vostro storico cosi' ne parlate sui numeri e non sulle sensazioni. Vi va se fissiamo 15 minuti la prossima settimana con il socio, cosi' rispondo a tutte le domande in una volta?\"",
    tip: "Non lasciare il 'ci penso' senza un passo successivo concreto: fissa sempre data e coinvolgi il secondo decisore.",
  },
  {
    id: "o-gia-provato",
    objection: "Ho gia' provato un software di pricing e non ha funzionato.",
    category: "fiducia",
    response:
      "\"Mi dispiace sia andata cosi', e capisco la diffidenza. Posso chiederle cosa non aveva funzionato? Spesso il problema e' stato un'attivazione lasciata a meta' o nessuno a seguirvi. Noi vi affianchiamo nel setup e nei primi mesi guardiamo insieme i risultati: se non porta valore, ve ne accorgete subito.\"",
    tip: "Fai parlare il cliente del fallimento precedente: e' oro per differenziarti. Punta su onboarding e affiancamento.",
  },
  {
    id: "o-non-ho-tempo",
    objection: "Adesso non ho tempo / non e' il momento.",
    category: "tempo",
    response:
      "\"Capisco benissimo, e proprio per questo SANTADDEO esiste: per ridarvi tempo. L'attivazione la seguiamo noi, a voi serve pochissimo. E se posso: qual e' il momento dell'anno in cui i prezzi contano di piu' per voi? Meglio arrivarci gia' pronti che a stagione iniziata.\"",
    tip: "Usa la stagionalita' come urgenza naturale: arrivare pronti prima del picco e' un vantaggio concreto e non aggressivo.",
  },
]

/* ─────────────────────────── TRACCIA DEL PITCH ─────────────────────────── */

export interface PitchPhase {
  id: string
  phase: string
  /** Obiettivo della fase. */
  goal: string
  /** Esempio di script da adattare. */
  script: string
  /** Promemoria tattici per la fase. */
  tips: string[]
}

export const PITCH: PitchPhase[] = [
  {
    id: "p-apertura",
    phase: "1. Apertura",
    goal: "Conquistare i primi 20 secondi, dichiarare il motivo della chiamata e ottenere il permesso di proseguire.",
    script:
      "\"Buongiorno, sono [Nome] di SANTADDEO. Aiutiamo hotel come il vostro a vendere le camere al prezzo giusto ogni giorno, in automatico, senza passarci le serate. La chiamo per capire in due minuti come gestite oggi i prezzi e se ha senso approfondire. Ha un minuto?\"",
    tips: [
      "Sii breve e chiaro sul perche' chiami: niente monologhi.",
      "Chiedi sempre il permesso di proseguire: abbassa la difesa.",
      "Usa una frase di valore concreta, non 'siamo leader di mercato'.",
    ],
  },
  {
    id: "p-scoperta",
    phase: "2. Scoperta",
    goal: "Capire come lavorano oggi e far emergere il dolore con domande, ascoltando piu' che parlando.",
    script:
      "\"Mi racconti: oggi i prezzi li gestite a mano o con un software? Ogni quanto li cambiate? E quanto tempo vi porta via in una settimana?\" — Poi ascolta e annota, senza vendere ancora.",
    tips: [
      "Regola 70/30: parla il cliente, non tu.",
      "Usa le domande di scoperta del Disco Vendita.",
      "Non proporre soluzioni finche' non hai capito il dolore reale.",
    ],
  },
  {
    id: "p-valore",
    phase: "3. Dimostrazione del valore",
    goal: "Collegare cio' che hai scoperto a come SANTADDEO risolve, idealmente con i loro numeri.",
    script:
      "\"Mi diceva che aggiornate i prezzi una volta a settimana e ci perdete diverse ore. Le faccio vedere: SANTADDEO ricalcola il prezzo ottimale ogni giorno per ogni data, guardando domanda, occupazione ed eventi. Su una struttura come la vostra questo significa tipicamente piu' RevPAR e zero tempo speso. Le mostro una stima sul vostro storico?\"",
    tips: [
      "Parla di benefici (piu' ricavi, meno tempo), non di funzioni.",
      "Se puoi, mostra dati reali della loro struttura: vale piu' di mille slide.",
      "Aggancia ogni beneficio a un dolore emerso nella scoperta.",
    ],
  },
  {
    id: "p-rischio",
    phase: "4. Gestione del rischio e prova",
    goal: "Abbattere la paura del cambiamento offrendo controllo, affiancamento e un percorso a basso rischio.",
    script:
      "\"So che cambiare come gestite i prezzi fa un certo effetto. Per questo restate sempre voi al comando: limiti minimi e massimi, regole vostre, e potete partire in modalita' supervisionata. Vi affianchiamo nel setup e guardiamo insieme i risultati dei primi mesi.\"",
    tips: [
      "Offri la partenza supervisionata con limiti min/max.",
      "Sottolinea l'affiancamento: non li lasci soli dopo la firma.",
      "Anticipa le obiezioni invece di aspettarle.",
    ],
  },
  {
    id: "p-chiusura",
    phase: "5. Chiusura",
    goal: "Trasformare l'interesse in un passo concreto: prossimo appuntamento, demo o attivazione.",
    script:
      "\"Per come mi ha descritto la situazione, credo che SANTADDEO possa darvi una mano concreta. Le propongo di fissare 30 minuti di demo sul vostro caso reale: le mostro i numeri e decidete con calma. Le va meglio martedi' o giovedi'?\"",
    tips: [
      "Chiudi sempre su un passo successivo concreto e datato.",
      "Usa la scelta tra due opzioni ('martedi' o giovedi'?'), non un si'/no.",
      "Riassumi il dolore emerso prima di proporre il passo: rende naturale il si'.",
    ],
  },
]

/* ─────────────────────────── FRASI PRONTE ─────────────────────────── */

export type PhraseContext = "apertura" | "valore" | "appuntamento" | "chiusura"

export const PHRASE_CONTEXTS: { value: PhraseContext; label: string }[] = [
  { value: "apertura", label: "Aperture" },
  { value: "valore", label: "Ganci di valore" },
  { value: "appuntamento", label: "Richiesta appuntamento" },
  { value: "chiusura", label: "Chiusure" },
]

export interface ReadyPhrase {
  id: string
  context: PhraseContext
  text: string
}

export const PHRASES: ReadyPhrase[] = [
  {
    id: "ph-ap-1",
    context: "apertura",
    text: "Aiutiamo hotel come il vostro a vendere ogni camera al prezzo giusto, ogni giorno, in automatico.",
  },
  {
    id: "ph-ap-2",
    context: "apertura",
    text: "La chiamo per capire in due minuti come gestite oggi i prezzi: se ha senso, approfondiamo. Ha un minuto?",
  },
  {
    id: "ph-ap-3",
    context: "apertura",
    text: "Lavoriamo con strutture della vostra zona per far crescere i ricavi senza aumentare il lavoro. Posso farle un paio di domande?",
  },
  {
    id: "ph-va-1",
    context: "valore",
    text: "Il prezzo giusto al momento giusto, su tutte le date e tutti i canali, senza passarci le serate.",
  },
  {
    id: "ph-va-2",
    context: "valore",
    text: "Quello che un revenue manager farebbe a mano su poche date, SANTADDEO lo fa con i dati su tutte, ogni giorno.",
  },
  {
    id: "ph-va-3",
    context: "valore",
    text: "Il channel manager e' l'autista che distribuisce i prezzi; SANTADDEO e' il navigatore che sceglie quale prezzo mettere.",
  },
  {
    id: "ph-va-4",
    context: "valore",
    text: "Basta qualche camera in piu' venduta al prezzo giusto in un mese e lo strumento si e' gia' ripagato.",
  },
  {
    id: "ph-app-1",
    context: "appuntamento",
    text: "Le propongo 30 minuti di demo sul vostro caso reale: le mostro i numeri e decidete con calma. Meglio martedi' o giovedi'?",
  },
  {
    id: "ph-app-2",
    context: "appuntamento",
    text: "Vi preparo una stima sul vostro storico cosi' ne parlate coi numeri: fissiamo 15 minuti la prossima settimana?",
  },
  {
    id: "ph-ch-1",
    context: "chiusura",
    text: "Per come mi ha descritto la situazione, credo possiamo darvi una mano concreta: partiamo con un setup supervisionato?",
  },
  {
    id: "ph-ch-2",
    context: "chiusura",
    text: "Restate sempre voi al comando, con limiti vostri: che ne dice di provarlo e guardare insieme i risultati dei primi mesi?",
  },
]
