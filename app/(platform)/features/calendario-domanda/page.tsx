import { CalendarDays, MessageSquareText, PhoneCall, SearchCheck, Sparkles, TrendingUp } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Calendario domanda hotel di HotelAccelerator: raccoglie richieste di soggiorno da conversazioni e telefonate, le organizza per data richiesta e le collega al contesto commerciale."

export const metadata = buildFeatureMetadata({
  slug: "calendario-domanda",
  title: "Calendario domanda hotel da richieste, email e chiamate",
  description,
  keywords: ["calendario domanda hotel", "domanda hotel", "richieste soggiorno hotel", "analisi richieste hotel", "demand intelligence hotel", "crm richieste hotel"],
})

const capabilities = [
  { icon: MessageSquareText, title: "Richieste dalle conversazioni", description: "Le conversazioni possono alimentare la pipeline di estrazione delle richieste di soggiorno quando il dato è identificabile nel contenuto disponibile." },
  { icon: PhoneCall, title: "Richieste dalle telefonate", description: "Le trascrizioni telefoniche possono essere analizzate per individuare date e richieste, se il journal e il transcript sono realmente disponibili." },
  { icon: CalendarDays, title: "Vista per data", description: "Le richieste estratte vengono aggregate per la data desiderata, rendendo più semplice individuare giornate con maggiore interesse commerciale." },
  { icon: SearchCheck, title: "Dettaglio della richiesta", description: "Il calendario deve permettere di risalire dal giorno alla singola richiesta e, quando presente, alla conversazione o sorgente collegata." },
  { icon: Sparkles, title: "Estrazione assistita dall'AI", description: "L'AI può estrarre elementi strutturati dal testo, ma il dato resta legato alla qualità della fonte e ai controlli applicativi previsti." },
  { icon: TrendingUp, title: "Segnale per revenue", description: "La domanda osservata può affiancare PMS, produzione e altri indicatori nel ragionamento revenue senza essere confusa con una prenotazione confermata." },
]

const faqs = [
  { question: "Il calendario domanda mostra le prenotazioni?", answer: "No. Il suo scopo è rappresentare le richieste di soggiorno e l'interesse espresso nelle conversazioni o telefonate. Una richiesta non viene trasformata automaticamente in prenotazione o produzione PMS." },
  { question: "Da quali canali arrivano i dati?", answer: "La pipeline è progettata per usare conversazioni e telefonate disponibili nel Core. La copertura effettiva dipende dai canali attivi, dalla presenza del contenuto necessario e dal collaudo delle rispettive integrazioni." },
  { question: "L'AI può sbagliare la data richiesta?", answer: "Sì, come ogni estrazione da testo o voce può esserci ambiguità. Per questo la sorgente deve restare collegata e le pipeline critiche devono avere recovery, controlli e possibilità di revisione." },
  { question: "Il calendario domanda può aiutare il revenue manager?", answer: "Può diventare un segnale utile perché rende visibile l'interesse per date future. Va però interpretato insieme a produzione, disponibilità e altre fonti, non come previsione certa della domanda." },
]

export default function CalendarioDomandaPage() {
  return <FeatureLandingPage
    slug="calendario-domanda"
    eyebrow="Calendario domanda"
    icon={CalendarDays}
    title="Trasforma le richieste degli ospiti in un segnale di domanda per data"
    intro="HotelAccelerator può estrarre dalle conversazioni e dalle telefonate le date richieste dagli ospiti e organizzarle in un calendario dedicato. Così il team commerciale e revenue vede non solo ciò che è già prenotato, ma anche dove si concentra l'interesse che ancora non si è trasformato in vendita."
    statusLabel="Pipeline calendario domanda presente nel codice"
    statusDescription="Estrazione da conversazioni e telefonate, aggregazione per data e recovery sono implementati. Servono evidenze runtime complete su transcript reali, backlog e rebuild prima di considerare il flusso production-ready."
    benefits={[
      { title: "Domanda prima della prenotazione", description: "Rende visibili le date chieste dagli ospiti anche quando la trattativa non è ancora chiusa." },
      { title: "Contesto commerciale", description: "Dal giorno si può risalire alla richiesta e alla conversazione collegata invece di vedere un semplice numero aggregato." },
      { title: "Segnale complementare per il revenue", description: "L'interesse espresso può affiancare occupazione e produzione come indicatore da interpretare nella strategia tariffaria." },
    ]}
    capabilitiesTitle="Come funziona il calendario domanda"
    capabilitiesIntro="Il sistema separa intenzione e prenotazione: mostra ciò che gli ospiti stanno chiedendo senza inventare produzione non presente nel PMS."
    capabilities={capabilities}
    workflowTitle="Dalla conversazione alla giornata richiesta"
    workflow={[
      { title: "Arriva una richiesta", description: "Email, messaggio o telefonata contiene informazioni su date, soggiorno o necessità dell'ospite." },
      { title: "Il sistema estrae i dati", description: "La pipeline identifica gli elementi utili e mantiene il riferimento alla sorgente per consentire verifica e approfondimento." },
      { title: "La domanda viene aggregata", description: "Le richieste vengono organizzate per data richiesta, lasciando disponibile il dettaglio delle singole opportunità." },
    ]}
    seoSections={[
      { title: "Demand intelligence basata sulle richieste reali dell'hotel", paragraphs: ["Le prenotazioni raccontano soltanto la domanda che si è già convertita. Le richieste ricevute dal booking office, invece, possono mostrare interesse su date future anche quando il cliente non ha ancora confermato.", "Il calendario domanda nasce per rendere questo segnale consultabile e collegato alla sua origine. Non sostituisce forecast o PMS, ma aggiunge un livello informativo utile a booking e revenue manager."], bullets: ["Richieste aggregate per data desiderata", "Dettaglio per singola richiesta", "Collegamento alla conversazione quando disponibile", "Separazione esplicita tra richiesta e prenotazione"] },
    ]}
    availableNow={["Pipeline di estrazione richieste presente nel Core.", "Aggregazione per data richiesta.", "Recovery e dirty marker per ricostruzione differita.", "Collegamento previsto con conversazioni e telefonate."]}
    requiresVerification={["Transcript telefonici reali persistiti e processati.", "Backlog e recovery in runtime di produzione.", "Qualità dell'estrazione su casi ambigui.", "Completezza del link dal dettaglio alla sorgente per tutti i canali."]}
    faqs={faqs}
    related={[
      { href: "/features/revenue-management", title: "Revenue management", description: "Usa la domanda osservata come segnale complementare a PMS, produzione e pricing." },
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Le conversazioni con gli ospiti sono una delle sorgenti da cui possono emergere le richieste." },
    ]}
    ctaTitle="Vuoi vedere la domanda che oggi resta nascosta nelle conversazioni?"
    ctaDescription="Nella demo possiamo partire dai canali attivi e verificare come le richieste vengono estratte, aggregate e ricondotte alla sorgente."
    schemaName="Calendario domanda hotel da conversazioni e telefonate"
    schemaDescription={description}
  />
}
