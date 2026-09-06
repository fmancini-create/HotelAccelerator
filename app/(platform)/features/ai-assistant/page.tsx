import { BookOpenText, Bot, CircleGauge, FileUp, HandHelping, SearchCheck } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "AI per hotel con knowledge base, bozze contestuali, fonti, confidenza, analisi e handoff all'operatore. Automazioni e risposte restano controllabili in base al rischio e allo stato reale del flusso."

export const metadata = buildFeatureMetadata({
  slug: "ai-assistant",
  title: "AI per hotel con knowledge base e controllo umano",
  description,
  keywords: ["ai hotel", "intelligenza artificiale hotel", "assistente ai hotel", "knowledge base hotel", "ai reception hotel", "risposte ospiti hotel", "automazione hotel ai"],
})

const capabilities = [
  { icon: BookOpenText, title: "Knowledge base della struttura", description: "Organizza informazioni approvate in basi separate per tenant e canale, così l'AI usa il contesto realmente disponibile." },
  { icon: FileUp, title: "Fonti da URL e documenti", description: "Le basi possono essere alimentate da contenuti supportati e devono essere curate, aggiornate e verificate prima dell'uso operativo." },
  { icon: Bot, title: "Bozze e assistenza", description: "L'AI può preparare risposte nel contesto della conversazione e assistere classificazione, sintesi e altre attività previste dal workflow." },
  { icon: SearchCheck, title: "Fonti richiamate", description: "Quando il flusso lo supporta, la risposta assistita restituisce riferimenti alle fonti usate per rendere più semplice la verifica." },
  { icon: CircleGauge, title: "Confidenza e gap", description: "Confidenza e lacune informative aiutano a distinguere una risposta ben fondata da un caso che richiede conoscenza aggiuntiva o revisione." },
  { icon: HandHelping, title: "Handoff umano", description: "I casi delicati o incompleti possono essere passati al personale mantenendo il contesto e una traccia operativa durevole." },
]

const faqs = [
  { question: "L'AI risponde automaticamente agli ospiti?", answer: "HotelAccelerator dispone di funzioni AI per bozze, classificazione, knowledge base e handoff. L'autonomia dipende dal workflow specifico: le azioni commerciali, reputazionali o operative ad alto impatto restano sotto controllo umano finché non esiste evidenza sufficiente per automatizzarle in sicurezza." },
  { question: "Come si riducono le risposte inventate?", answer: "Le funzioni pubbliche privilegiano knowledge base, fonti, confidenza e revisione. Nessun controllo elimina completamente l'errore del modello, perciò qualità delle fonti ed evaluation restano parte essenziale dell'attivazione." },
  { question: "Ogni canale può avere una knowledge base diversa?", answer: "Il Core separa le basi e le associazioni ai canali; inoltre ogni knowledge base può avere una propria identità virtuale AI. L'isolamento per tenant e la corretta associazione devono essere mantenuti in ogni lookup." },
  { question: "L'AI può passare la conversazione a una persona?", answer: "Sì. Il progetto dispone di un workflow durevole per handoff allo staff: l'offerta di contatto e l'accettazione dell'ospite sono eventi distinti e il passaggio deve lasciare una traccia operativa." },
  { question: "L'AI può usare dati del PMS o del CRM?", answer: "Può usare soltanto il contesto che il workflow autorizzato le mette a disposizione. L'accesso non deve attraversare tenant, ruoli o sistemi proprietari senza un contratto esplicito." },
]

export default function AIAssistantLandingPage() {
  return <FeatureLandingPage
    slug="ai-assistant"
    eyebrow="AI per hotel"
    icon={Bot}
    title="Un'AI che assiste il team usando la conoscenza reale dell'hotel"
    intro="HotelAccelerator usa l'intelligenza artificiale come livello di assistenza sopra conversazioni, knowledge base e processi della struttura. Il punto non è far rispondere un modello a tutto: è ridurre lavoro ripetitivo, mostrare le fonti e passare alle persone i casi in cui il contesto non è sufficiente."
    statusLabel="Knowledge base, bozze e componenti AI presenti nel Core"
    statusDescription="L'insieme dell'AI Inbox resta una capability da valutare con eval, privacy e guardrail. Le singole funzioni vengono comunicate in base all'evidenza reale e non come concierge autonomo universale."
    benefitsTitle="Dove l'AI può aiutare davvero un hotel"
    benefitsIntro="L'AI è più utile quando riduce ricerca e attività ripetitive senza nascondere incertezza o responsabilità."
    benefits={[
      { title: "Risposte più rapide da preparare", description: "L'operatore può partire da una bozza fondata sui contenuti della struttura invece di ricercare manualmente ogni informazione." },
      { title: "Conoscenza meno dispersa", description: "FAQ, policy, servizi e procedure possono vivere in basi curate e riutilizzabili nei canali autorizzati." },
      { title: "Escalation più ordinata", description: "Quando il modello non ha abbastanza contesto, il caso può essere trasferito allo staff conservando domanda e informazioni già raccolte." },
    ]}
    capabilitiesTitle="Funzioni AI disponibili o in consolidamento"
    capabilitiesIntro="HotelAccelerator separa modello, knowledge, policy e workflow, così un cambio di provider AI non deve riscrivere la logica operativa dell'hotel."
    capabilities={capabilities}
    workflowTitle="Come nasce una risposta assistita"
    workflow={[
      { title: "Il sistema raccoglie il contesto", description: "Conversazione, canale e knowledge base autorizzata determinano quali informazioni possono entrare nella richiesta al modello." },
      { title: "L'AI prepara il risultato", description: "La funzione genera bozza, sintesi o classificazione e, dove previsto, restituisce confidenza e riferimenti alle fonti." },
      { title: "Il workflow decide il passo successivo", description: "L'operatore può correggere e inviare oppure il sistema può avviare un handoff controllato nei casi che richiedono una persona." },
    ]}
    seoSections={[
      { title: "AI per reception, booking e customer care", paragraphs: ["Le richieste più frequenti in hotel riguardano orari, servizi, disponibilità di informazioni, policy e indicazioni operative. Una knowledge base ben curata permette all'AI di aiutare il team a recuperare queste risposte in modo più coerente.", "Per richieste delicate, reclami, decisioni economiche o casi senza fonti sufficienti, la strategia di HotelAccelerator è mantenere un passaggio umano esplicito invece di nascondere l'incertezza del modello."], bullets: ["Bozze nel contesto della conversazione", "Knowledge base tenant-scoped", "Fonti e confidenza quando disponibili", "Handoff allo staff con contesto preservato"] },
      { title: "Automazione controllata invece di autopilot opaco", paragraphs: ["L'AI può diventare più autonoma soltanto quando il workflow dispone di dati affidabili, guardrail, audit e misure di qualità. HotelAccelerator tratta quindi l'automazione come un livello progressivo, non come una promessa unica valida per ogni hotel e ogni canale."] },
    ]}
    availableNow={["Knowledge base separate per tenant e associazioni ai canali.", "Bozze contestuali e funzioni di assistenza AI nel Core.", "Identità virtuali AI per knowledge base presenti nel codice.", "Workflow durevole di handoff verso lo staff."]}
    requiresVerification={["Evaluation di qualità sui casi reali della struttura.", "Privacy, retention e dati sensibili nelle fonti e nei prompt.", "Tono di voce e qualità multilingua sui contenuti del tenant.", "Qualsiasi automazione ad alto impatto prima di ridurre la revisione umana."]}
    faqs={faqs}
    related={[
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Usa l'AI nel contesto delle conversazioni del team." },
      { href: "/features/telefono-hotel", title: "Telefonia e Voice Agent", description: "Scopri il flusso vocale e le integrazioni con centralino dove configurate." },
      { href: "/features/pms-hotel", title: "PMS integrato", description: "Osserva procedure operative e costruisci conoscenza controllata sul gestionale." },
      { href: "/features/crm", title: "CRM alberghiero", description: "Collega il contesto della conversazione al profilo autorizzato dell'ospite." },
    ]}
    ctaTitle="Vuoi provare l'AI sui contenuti reali della tua struttura?"
    ctaDescription="Nella demo partiamo dalla knowledge base e da casi concreti per verificare qualità, fonti, limiti e livello di controllo necessario."
    schemaName="AI per hotel con knowledge base e controllo umano"
    schemaDescription={description}
  />
}
