import { Activity, BarChart3, Database, MousePointerClick, Route, ShieldCheck } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Analytics per hotel con tracking di sessioni, UTM, sorgenti ed eventi, collegabile a CRM e moduli della suite. Misura soltanto dati realmente raccolti e configurati per il tenant."

export const metadata = buildFeatureMetadata({
  slug: "analytics",
  title: "Analytics hotel: tracking sito, UTM, eventi e KPI",
  description,
  keywords: ["analytics hotel", "tracking sito hotel", "eventi sito hotel", "sessioni sito hotel", "utm hotel", "kpi crm hotel", "web analytics hotel", "conversioni hotel"],
})

const capabilities = [
  { icon: Database, title: "Siti e chiavi di raccolta", description: "Ogni sito tracciato viene configurato per tenant con una propria chiave, mantenendo la separazione dei dati tra strutture." },
  { icon: Route, title: "Sessioni, sorgenti e UTM", description: "Registra landing page, sorgenti e parametri UTM quando il tracker è installato e il consenso consente la raccolta prevista." },
  { icon: MousePointerClick, title: "Eventi del sito", description: "Raccoglie gli eventi realmente strumentati, come visualizzazioni, click e invii, senza inventare conversioni non ricevute." },
  { icon: Activity, title: "Percorsi osservati", description: "Sessioni e sequenze di eventi consentono di analizzare come gli utenti attraversano le pagine e i punti di contatto misurati." },
  { icon: BarChart3, title: "KPI dai moduli collegati", description: "CRM, email e altri moduli possono contribuire indicatori quando le relative fonti sono attive e considerate attendibili." },
  { icon: ShieldCheck, title: "Consenso e qualità dati", description: "Tracker, consenso, minimizzazione e completezza delle fonti vengono verificati prima di usare le metriche per decisioni operative." },
]

const faqs = [
  { question: "HotelAccelerator sostituisce Google Analytics?", answer: "Non viene presentato come sostituto universale. Il Core raccoglie sessioni, UTM ed eventi dai siti configurati e li collega al contesto della suite; eventuali strumenti esterni possono continuare a essere usati secondo la strategia di misurazione della struttura." },
  { question: "Posso sapere da quale campagna arriva una prenotazione?", answer: "Sessioni e UTM sono una base utile, ma attribuire una prenotazione richiede un collegamento affidabile con il dato booking e una regola di attribuzione validata. Non viene dichiarata una revenue attribution completa senza queste condizioni." },
  { question: "I dati sono in tempo reale?", answer: "Il sistema registra e consulta gli eventi ricevuti, ma non promette aggiornamenti al secondo. Frequenza e completezza dipendono dal tracker, dalla rete e dalle fonti collegate." },
  { question: "Posso tracciare un sito esterno a HotelAccelerator?", answer: "Sì, se il sito viene configurato per il tenant e integra correttamente la chiave e gli eventi previsti nel rispetto del consenso." },
]

export default function AnalyticsLandingPage() {
  return <FeatureLandingPage
    slug="analytics"
    eyebrow="Analytics per hotel"
    icon={BarChart3}
    title="Capisci da dove arriva la domanda e cosa fanno gli utenti sul sito"
    intro="HotelAccelerator raccoglie sessioni, sorgenti, UTM ed eventi dai siti configurati e può affiancarli ai KPI provenienti dagli altri moduli. Ogni numero viene presentato in base alla copertura reale dei dati, senza trasformare eventi mancanti in conversioni stimate."
    statusLabel="Tracking di sessioni ed eventi presente nel Core"
    statusDescription="Installazione, consenso, chiavi e qualità degli eventi devono essere verificati sul sito della struttura. Attribution completa e forecast non vengono dichiarati pronti senza dati collegati e validazione."
    benefits={[
      { title: "Più visibilità sul traffico utile", description: "UTM e sorgenti aiutano a distinguere da dove arrivano le sessioni quando la campagna e il tracker sono configurati correttamente." },
      { title: "Eventi leggibili nel contesto hotel", description: "Click e azioni possono essere interpretati insieme a CRM e altre fonti invece di restare numeri isolati." },
      { title: "Meno KPI decorativi", description: "Il sistema distingue ciò che è raccolto da ciò che richiede ancora una fonte o un modello di attribuzione affidabile." },
    ]}
    capabilitiesTitle="Cosa misura HotelAccelerator Analytics"
    capabilitiesIntro="La misurazione parte dagli eventi realmente ricevuti. L'obiettivo è costruire progressivamente una vista affidabile del percorso digitale della struttura."
    capabilities={capabilities}
    workflowTitle="Dal tracker alla lettura dei KPI"
    workflow={[
      { title: "Il sito viene configurato", description: "Il tenant riceve una configurazione di raccolta e il tracker viene installato nei punti previsti." },
      { title: "Sessioni ed eventi arrivano", description: "La piattaforma registra soltanto i segnali effettivamente inviati e conserva sorgenti e parametri disponibili." },
      { title: "I dati vengono letti insieme", description: "La dashboard può affiancare tracking e KPI dei moduli collegati, dichiarando i limiti delle fonti non complete." },
    ]}
    seoSections={[
      { title: "Web analytics per hotel orientata a prenotazioni e relazione con l'ospite", paragraphs: ["Per un hotel non basta conoscere il numero di visite: è più utile capire quali campagne portano utenti, quali pagine vengono consultate e quali azioni precedono una richiesta o una prenotazione.", "HotelAccelerator raccoglie gli eventi del sito e li prepara per essere collegati agli altri dati della suite. L'attribuzione economica viene aggiunta soltanto quando esiste un legame affidabile con booking e revenue."], bullets: ["Sorgenti e UTM", "Landing page e sessioni", "Eventi strumentati sul sito", "KPI dei moduli collegati quando disponibili"] },
    ]}
    availableNow={["Configurazione tenant-scoped dei siti e delle chiavi di raccolta.", "Sessioni con landing page, sorgenti e UTM.", "Eventi inviati dal tracker e dettaglio dei percorsi osservati.", "KPI CRM ed email calcolati sui dati effettivamente presenti."]}
    requiresVerification={["Installazione e copertura del tracker sul sito interessato.", "Gestione del consenso e minimizzazione dei dati.", "Collegamento con prenotazioni prima di parlare di attribution revenue.", "Completezza e continuità delle fonti prima di usare i KPI operativamente."]}
    faqs={faqs}
    related={[
      { href: "/features/cms", title: "CMS per hotel", description: "Pubblica il sito e configura le pagine e gli eventi da misurare." },
      { href: "/features/crm", title: "CRM alberghiero", description: "Collega il percorso digitale al profilo cliente soltanto quando il dato è acquisito in modo autorizzato." },
      { href: "/features/revenue-management", title: "Revenue management", description: "Affianca segnali digitali, produzione e domanda nella lettura commerciale." },
      { href: "/features/calendario-domanda", title: "Calendario domanda", description: "Osserva le date richieste nelle conversazioni come ulteriore segnale di interesse." },
    ]}
    ctaTitle="Vuoi capire cosa stai davvero misurando?"
    ctaDescription="Nella demo verifichiamo sito, tracker, eventi, consenso e fonti collegate prima di definire i KPI utili alla struttura."
    schemaName="Analytics hotel con tracking sito, UTM ed eventi"
    schemaDescription={description}
  />
}
