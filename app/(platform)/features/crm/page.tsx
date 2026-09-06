import { BookOpenCheck, Gauge, Hotel, MailPlus, Search, ShieldCheck, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "CRM alberghiero per hotel: centralizza contatti, consensi, soggiorni, workspace, pipeline e conversazioni. Collegabile a Inbox, PMS e attività commerciali in base alle integrazioni attive."

export const metadata = buildFeatureMetadata({
  slug: "crm",
  title: "CRM alberghiero per ospiti, vendite e soggiorni",
  description,
  keywords: ["crm alberghiero", "crm per hotel", "gestione ospiti hotel", "database clienti hotel", "storico soggiorni", "consensi marketing hotel", "pipeline commerciale hotel", "crm prenotazioni hotel"],
})

const capabilities = [
  { icon: UsersRound, title: "Anagrafica ospiti", description: "Crea e modifica contatti separati per struttura, con recapiti, tag, livello VIP e informazioni utili al team." },
  { icon: Search, title: "Ricerca e filtri", description: "Cerca per nome, email o azienda e usa filtri e workspace per organizzare il database senza uscire dall'area CRM." },
  { icon: ShieldCheck, title: "Consensi visibili", description: "Il CRM conserva stato del consenso marketing e disiscrizione, così il team può distinguere i contatti utilizzabili." },
  { icon: Hotel, title: "Soggiorni e valore", description: "La scheda contatto può mostrare soggiorni, prenotazioni e ricavi quando questi dati sono stati importati dalla fonte autorizzata." },
  { icon: MailPlus, title: "Contatti dalle conversazioni", description: "Email e altri canali attivi possono creare o collegare il contatto corretto, rispettando le impostazioni e lo scope del tenant." },
  { icon: Gauge, title: "Pipeline e KPI", description: "Il CRM dispone di pipeline, attività commerciali e indicatori costruiti sui dati realmente presenti, senza trasformare stime in risultati certi." },
]

const faqs = [
  { question: "Il CRM importa automaticamente tutti gli ospiti dal PMS?", answer: "La sincronizzazione PMS dipende dal connettore del singolo tenant. HotelAccelerator è progettato per usare adapter differenti e non presume che tutti i PMS espongano gli stessi dati o le stesse API." },
  { question: "Il CRM gestisce anche prospect e trattative?", answer: "Nel Core sono presenti workspace, pipeline, motore di vendita e funzioni di prospecting a livelli diversi di maturità. Le capability avanzate vengono attivate e collaudate sul tenant prima di essere considerate operative." },
  { question: "Posso creare segmenti di contatti?", answer: "Sono presenti strutture e superfici per segmentazione e campagne. La valutazione dinamica completa e il loro uso nelle automazioni marketing devono essere verificati prima dell'invio reale." },
  { question: "I contatti sono separati tra strutture?", answer: "Le API CRM applicano tenant scope e permessi dell'area. Il progetto richiede comunque test espliciti di isolamento prima di promuovere l'intera capability a livello multi-tenant." },
  { question: "Il CRM è collegato a email, WhatsApp e telefono?", answer: "La direzione del prodotto è unificare il contesto del contatto tra canali. Gmail e WhatsApp hanno evidenze reali sul flusso base; telefonia e altri connettori dipendono dal provider e dal collaudo del tenant." },
]

export default function CrmLandingPage() {
  return <FeatureLandingPage
    slug="crm"
    eyebrow="CRM alberghiero"
    icon={BookOpenCheck}
    title="Un CRM per hotel che collega ospiti, conversazioni e opportunità"
    intro="HotelAccelerator riunisce anagrafiche, consensi, soggiorni, pipeline e attività commerciali in un profilo contestuale. Il CRM non vive isolato: può collegarsi a Inbox, WhatsApp, telefono e PMS quando le rispettive integrazioni sono attive."
    statusLabel="CRM base e diverse estensioni presenti nel Core"
    statusDescription="Anagrafiche, workspace, pipeline e componenti commerciali esistono a livelli diversi di maturità. La capability CRM ospite completa resta da verificare end-to-end prima di essere dichiarata production-ready."
    benefitsTitle="Perché un CRM specifico per hotel"
    benefitsIntro="Un ospite non è soltanto un indirizzo email: può avere soggiorni, richieste, conversazioni, consensi, valore e attività aperte che devono essere letti insieme."
    benefits={[
      { title: "Una vista più completa dell'ospite", description: "Contatti, conversazioni e dati di soggiorno possono convergere nello stesso profilo quando le fonti sono collegate." },
      { title: "Vendite meno disperse", description: "Pipeline, follow-up e attività aiutano il team a distinguere una semplice richiesta da una vera opportunità commerciale." },
      { title: "Dati utilizzabili con criterio", description: "Consensi, tenant scope e provenienza del dato restano parte del processo, soprattutto quando il CRM alimenta campagne o automazioni." },
    ]}
    capabilitiesTitle="Le principali funzioni del CRM HotelAccelerator"
    capabilitiesIntro="Il CRM copre relazione con l'ospite e lavoro commerciale, ma ogni dato viene mostrato soltanto se esiste una fonte autorizzata e coerente."
    capabilities={capabilities}
    workflowTitle="Dal primo contatto alla relazione con l'ospite"
    workflow={[
      { title: "La richiesta entra", description: "Una email, un messaggio, una chiamata o un'importazione PMS può fornire dati utili per identificare il contatto." },
      { title: "Il profilo viene arricchito", description: "Il CRM collega informazioni, consensi, conversazioni e soggiorni disponibili senza attraversare tenant o aree non autorizzate." },
      { title: "Il team lavora sulla relazione", description: "Pipeline, follow-up, attività e campagne possono usare il profilo come contesto, mantenendo revisione e permessi dove richiesti." },
    ]}
    seoSections={[
      { title: "CRM hotel per booking, reception e direzione commerciale", paragraphs: ["In una struttura ricettiva le informazioni sul cliente possono essere distribuite tra PMS, email, WhatsApp, telefono e fogli di lavoro. Il problema non è soltanto raccoglierle, ma ricostruire rapidamente il contesto quando una persona torna a contattare l'hotel.", "HotelAccelerator usa il CRM come punto di collegamento tra queste fonti. La scheda non inventa dati mancanti: mostra ciò che arriva dalle integrazioni realmente configurate e mantiene separati i tenant."], bullets: ["Anagrafiche e consensi", "Soggiorni quando importati dal PMS", "Conversazioni collegate", "Pipeline, follow-up e workspace commerciali"] },
      { title: "CRM B2C e B2B nello stesso ecosistema", paragraphs: ["Oltre all'ospite individuale, HotelAccelerator dispone di workspace CRM per hotel, SPA, ristorante, aziende e agenzie. Questo permette di organizzare linee di business differenti senza dover creare database completamente scollegati.", "Le funzioni di prospecting e motore di vendita restano soggette a permessi, verifica dei dati e intervento umano nei passaggi commerciali sensibili."] },
    ]}
    availableNow={["Creazione, modifica, ricerca e filtri dei contatti per tenant.", "Consenso marketing, stato di disiscrizione, tag e livello VIP.", "Workspace CRM e pipeline commerciali presenti nel Core.", "Collegamento controllato tra conversazioni e contatti."]}
    requiresVerification={["Connettore PMS e qualità dei dati della struttura.", "CRM ospite completo end-to-end, inclusi identity resolution e LTV.", "Segmentazione dinamica e automazioni lifecycle.", "Test multi-tenant e permessi su workspace e gruppi reali."]}
    faqs={faqs}
    related={[
      { href: "/crm-hotel-confronto", title: "Confronto CRM hotel", description: "Confronta HotelAccelerator con CRM alberghieri e generalisti sulle funzioni davvero utili in struttura." },
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Collega conversazioni email e messaggi ai profili e al lavoro del team." },
      { href: "/features/pms-hotel", title: "PMS integrato", description: "Porta nel CRM i dati supportati dal gestionale della struttura." },
      { href: "/features/whatsapp-hotel", title: "WhatsApp per hotel", description: "Gestisci le conversazioni WhatsApp nel contesto del contatto." },
      { href: "/features/email-marketing", title: "Email marketing", description: "Usa dati e consensi del CRM come base per campagne controllate." },
    ]}
    ctaTitle="Vuoi vedere il CRM sui flussi reali del tuo hotel?"
    ctaDescription="Partiamo da PMS, caselle, WhatsApp e processi commerciali per capire quali dati possiamo collegare e con quale livello di automazione."
    schemaName="CRM alberghiero per ospiti, vendite e soggiorni"
    schemaDescription={description}
  />
}
