import { BellRing, ContactRound, MessageCircle, MessagesSquare, ShieldCheck, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "WhatsApp per hotel integrato con CRM e inbox: conversazioni Business, assegnazioni, contatti, storico e gestione del flusso fuori 24 ore in base alla configurazione Meta del tenant."

export const metadata = buildFeatureMetadata({
  slug: "whatsapp-hotel",
  title: "WhatsApp per hotel integrato con CRM e Inbox",
  description,
  keywords: ["whatsapp hotel", "whatsapp business hotel", "crm whatsapp hotel", "messaggistica hotel", "inbox whatsapp hotel", "assistenza ospiti whatsapp"],
})

const capabilities = [
  { icon: MessagesSquare, title: "Conversazioni in Inbox", description: "I messaggi WhatsApp possono entrare nella stessa superficie operativa usata dal team per le altre conversazioni abilitate." },
  { icon: ContactRound, title: "Contatto collegato", description: "Numero e conversazione possono essere associati al profilo corretto del CRM, mantenendo il contesto disponibile agli operatori autorizzati." },
  { icon: UsersRound, title: "Lavoro di squadra", description: "Assegnazioni, presenza operatori e gestione della conversazione aiutano a evitare risposte duplicate e passaggi di consegna confusi." },
  { icon: MessageCircle, title: "Outbound controllato", description: "Il composer unificato invia sul canale attivo e distingue il messaggio libero dai casi in cui Meta richiede un template di riapertura." },
  { icon: BellRing, title: "Stati e notifiche", description: "La piattaforma conserva gli stati disponibili del flusso e può evidenziare errori o comunicazioni che richiedono attenzione." },
  { icon: ShieldCheck, title: "Configurazione tenant-scoped", description: "Credenziali e identificativi Meta sono associati alla singola struttura e gestiti lato server, evitando di esporli nel browser." },
]

const faqs = [
  { question: "Posso usare il numero WhatsApp Business già usato dall'hotel?", answer: "HotelAccelerator supporta il modello WhatsApp Business App Coexistence quando la configurazione Meta del tenant lo consente. Il flusso base è stato verificato su una struttura reale, ma onboarding, WABA, billing e permessi vengono controllati per ogni numero." },
  { question: "Cosa succede dopo 24 ore dall'ultimo messaggio dell'ospite?", answer: "Meta impone regole specifiche per riaprire una conversazione. HotelAccelerator dispone del flusso con template e coda, ma la consegna reale dipende anche dalla configurazione e dal billing del WABA." },
  { question: "Più operatori possono rispondere allo stesso ospite?", answer: "La piattaforma dispone di presenza, assegnazioni e collaborazione. Il comportamento operativo va configurato in base ai ruoli del tenant per evitare risposte concorrenti." },
  { question: "WhatsApp è collegato al CRM?", answer: "Sì: la conversazione può essere collegata al contatto e usata insieme agli altri dati disponibili nel CRM, sempre nel perimetro del tenant e dei permessi dell'operatore." },
]

export default function WhatsappHotelPage() {
  return <FeatureLandingPage
    slug="whatsapp-hotel"
    eyebrow="WhatsApp per hotel"
    icon={MessageCircle}
    title="WhatsApp Business dentro il flusso operativo dell'hotel"
    intro="Porta le conversazioni WhatsApp nel contesto di HotelAccelerator, collegandole a contatti, operatori e attività. L'obiettivo non è aggiungere un'altra chat: è evitare che informazioni importanti restino isolate sul telefono o in account separati."
    statusLabel="WhatsApp Coexistence verificato su tenant reale per il flusso base"
    statusDescription="Inbound e outbound base sono stati provati su una struttura reale. Template fuori 24 ore e billing Meta centralizzato restano soggetti a configurazione e collaudo specifico."
    benefitsTitle="Perché integrare WhatsApp nel gestionale dell'hotel"
    benefitsIntro="Quando il canale vive insieme a CRM e Inbox, il team conserva contesto e responsabilità senza dover ricostruire la storia dell'ospite ogni volta."
    benefits={[
      { title: "Meno conversazioni sparse", description: "Il team lavora dalla stessa area operativa invece di distribuire messaggi tra telefoni personali, web app e caselle separate." },
      { title: "Più contesto sull'ospite", description: "Il messaggio può essere letto insieme al profilo CRM e agli altri dati effettivamente disponibili per quella struttura." },
      { title: "Passaggi di consegna più chiari", description: "Assegnazioni, presenza e storico aiutano a capire chi sta seguendo la richiesta e cosa è già stato fatto." },
    ]}
    capabilitiesTitle="Funzioni WhatsApp disponibili in HotelAccelerator"
    capabilitiesIntro="Il canale è progettato come parte dell'Inbox omnicanale, non come applicazione separata."
    capabilities={capabilities}
    workflowTitle="Come entra una conversazione WhatsApp nel lavoro del team"
    workflowIntro="Il flusso dipende dal numero e dalla configurazione Meta effettivamente associati al tenant."
    workflow={[
      { title: "Il messaggio arriva", description: "Il webhook condiviso identifica il numero Meta e instrada l'evento verso il tenant corretto." },
      { title: "Il contatto viene contestualizzato", description: "La conversazione viene collegata al profilo disponibile e resa visibile agli operatori autorizzati." },
      { title: "Il team risponde", description: "L'operatore usa il composer del canale e, quando necessario, il sistema applica il flusso previsto per la riapertura oltre 24 ore." },
    ]}
    seoSections={[
      { title: "WhatsApp per prenotazioni, richieste e assistenza", paragraphs: ["Per una struttura ricettiva WhatsApp può diventare un punto di contatto per richieste pre-soggiorno, informazioni, servizi, assistenza durante la permanenza e comunicazioni successive. Se questi scambi restano separati dal CRM, il rischio è perdere contesto o duplicare il lavoro.", "HotelAccelerator tratta WhatsApp come uno dei canali della relazione con l'ospite: ciò che conta non è soltanto inviare un messaggio, ma collegarlo alla persona, al tenant e al lavoro del team."], bullets: ["Contesto condiviso tra operatori autorizzati", "Collegamento al CRM quando il contatto è identificabile", "Gestione delle regole Meta sul canale", "Possibilità di integrare attività e automazioni controllate"] },
    ]}
    availableNow={["WhatsApp Business App Coexistence sul flusso base verificato.", "Routing tenant-scoped per numero e identificativi Meta.", "Composer unificato e integrazione con Inbox.", "Coda e gestione applicativa del caso fuori 24 ore presenti nel codice."]}
    requiresVerification={["Billing/extended credit Meta per il WABA specifico.", "Template approvati e consegna reale oltre 24 ore.", "Permessi e comportamento multi-operatore della singola struttura."]}
    faqs={faqs}
    related={[
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Gestisci WhatsApp insieme agli altri canali attivati." },
      { href: "/features/crm", title: "CRM alberghiero", description: "Collega la conversazione al profilo ospite e alle attività commerciali." },
    ]}
    ctaTitle="Vuoi portare WhatsApp nel flusso del tuo hotel?"
    ctaDescription="Verifichiamo numero, WABA, configurazione Meta e modalità di lavoro del team prima di attivare il canale."
    schemaName="WhatsApp per hotel integrato con CRM e Inbox"
    schemaDescription={description}
  />
}
