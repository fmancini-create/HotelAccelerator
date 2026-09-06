import { ContactRound, Inbox, Mail, MessageSquareText, Tags, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Inbox omnicanale per hotel: gestisci Gmail, WhatsApp, Telegram e canali collegati con CRM, assegnazioni, collaborazione del team, ricerca e AI assistita in un unico workspace."

export const metadata = buildFeatureMetadata({
  slug: "inbox-omnicanale",
  title: "Inbox omnicanale per hotel, email e WhatsApp",
  description,
  keywords: ["inbox omnicanale hotel", "gestione email hotel", "gmail hotel", "inbox condivisa hotel", "messaggi ospiti hotel", "collaborazione reception", "whatsapp hotel inbox", "customer service hotel"],
})

const capabilities = [
  { icon: Mail, title: "Gmail sincronizzato", description: "OAuth, import storico riprendibile, aggiornamenti push, polling di fallback e riconciliazione mantengono la casella collegata al tenant." },
  { icon: Inbox, title: "Conversazioni organizzate", description: "Thread, cartelle, ricerca, filtri, priorità e stati aiutano a trasformare un flusso di messaggi in una coda di lavoro leggibile." },
  { icon: MessageSquareText, title: "Risposta dal canale corretto", description: "Il composer usa il canale attivo e mantiene il contesto disponibile senza costringere l'operatore a passare continuamente tra applicazioni." },
  { icon: UsersRound, title: "Collaborazione del team", description: "Presenza, assegnazioni, lock di lavorazione e passaggi di consegna riducono il rischio di risposte duplicate sulla stessa richiesta." },
  { icon: Tags, title: "Cartelle, etichette e stato", description: "Per Gmail sono presenti cartelle complete e label; gli altri canali conservano gli stati effettivamente esposti dai rispettivi provider." },
  { icon: ContactRound, title: "Collegamento al CRM", description: "Il mittente può essere collegato a un contatto esistente o acquisito secondo le regole del tenant, mantenendo conversazione e profilo nello stesso contesto." },
]

const faqs = [
  { question: "Quali canali sono già verificati su una struttura reale?", answer: "Gmail e il flusso base WhatsApp Coexistence hanno evidenze su un tenant reale. Telegram e social hanno codice nel Core ma richiedono collaudo/provider activation; Outlook, IMAP/SMTP e OTA non vengono presentati come automaticamente disponibili." },
  { question: "Posso vedere insieme messaggi ricevuti e inviati?", answer: "L'obiettivo della Inbox è rappresentare il lavoro conversazionale per canale, compresi gli elementi inviati quando il provider e il modello dati lo consentono. Per Gmail esistono anche cartelle complete multi-account nel codice." },
  { question: "Come si evita che due operatori rispondano contemporaneamente?", answer: "La piattaforma dispone di presenza, lock di lavorazione, assegnazioni e collaborazione. Il comportamento va comunque provato con più utenti reali prima di considerare l'intero workflow production-ready." },
  { question: "L'AI risponde automaticamente?", answer: "HotelAccelerator dispone di funzioni AI per bozze, classificazione e handoff, ma le automazioni ad alto impatto restano sotto controllo umano finché non sono state valutate e collaudate sul caso d'uso reale." },
  { question: "Posso cercare una vecchia conversazione?", answer: "Sono presenti ricerca, filtri e dati conversazionali. La qualità di una ricerca trasversale dipende dall'indicizzazione e dai canali effettivamente sincronizzati nel tenant." },
]

export default function InboxOmnichannelLandingPage() {
  return <FeatureLandingPage
    slug="inbox-omnicanale"
    eyebrow="Inbox omnicanale"
    icon={Inbox}
    title="Tutte le conversazioni dell'hotel in un unico spazio di lavoro"
    intro="HotelAccelerator porta email, WhatsApp e gli altri canali supportati dentro una Inbox collegata al CRM. Il valore non è soltanto leggere messaggi insieme: è sapere chi sta seguendo l'ospite, mantenere il contesto e trasformare una conversazione in un'azione commerciale o operativa."
    statusLabel="Gmail e WhatsApp base hanno evidenze su tenant reale"
    statusDescription="L'Inbox unificata e diversi connettori sono presenti nel Core. Copertura, app review, credenziali e workflow multi-operatore devono essere verificati per ogni canale e tenant."
    benefitsTitle="Perché un'Inbox omnicanale è utile in hotel"
    benefitsIntro="Reception, booking e commerciale ricevono richieste da canali diversi; separarli significa perdere tempo e ricostruire continuamente la storia del cliente."
    benefits={[
      { title: "Un solo punto di lavoro", description: "Il team consulta i canali attivi da una superficie comune invece di distribuire responsabilità tra caselle e app separate." },
      { title: "Meno risposte duplicate", description: "Presenza e collaborazione rendono più chiaro chi ha preso in carico una conversazione." },
      { title: "Conversazione collegata al cliente", description: "Quando il contatto è identificabile, il CRM conserva il contesto utile per le interazioni successive." },
    ]}
    capabilitiesTitle="Le principali funzioni dell'Inbox HotelAccelerator"
    capabilitiesIntro="Ogni provider mantiene le proprie regole: la piattaforma unifica l'esperienza senza simulare capability che il canale non espone."
    capabilities={capabilities}
    workflowTitle="Dal nuovo messaggio alla presa in carico"
    workflow={[
      { title: "Il canale sincronizza", description: "Webhook, push o polling ricevono l'evento secondo l'integrazione configurata e lo associano al tenant corretto." },
      { title: "Il team vede il contesto", description: "Conversazione, contatto e stato operativo vengono mostrati agli utenti autorizzati." },
      { title: "La richiesta viene gestita", description: "L'operatore risponde, assegna, crea un'attività o passa il caso ad altri moduli della suite quando l'azione è disponibile." },
    ]}
    seoSections={[
      { title: "Inbox condivisa per reception, booking e commerciale", paragraphs: ["Una richiesta di preventivo può arrivare per email, una domanda pre-arrivo su WhatsApp e una segnalazione su un altro canale. Se ogni operatore lavora in applicazioni diverse, è difficile capire quale richiesta è ancora aperta e chi l'ha gestita.", "HotelAccelerator costruisce una superficie comune sopra connettori indipendenti. In questo modo il canale resta riconoscibile, ma il metodo di lavoro del team può essere più uniforme."], bullets: ["Gmail con sincronizzazione e cartelle", "WhatsApp Business nel flusso base", "Telegram e social tramite connettori dedicati", "CRM e attività collegabili alla conversazione"] },
      { title: "Omnicanale non significa fingere che tutti i provider siano uguali", paragraphs: ["Email, WhatsApp e social hanno API, regole e limiti diversi. HotelAccelerator mantiene adapter separati e dichiara lo stato reale di ogni integrazione, così una UI comune non nasconde dipendenze esterne ancora da attivare."] },
    ]}
    availableNow={["Gmail OAuth, import storico, Pub/Sub e polling fallback.", "Cartelle Gmail complete e supporto multi-account nel codice.", "WhatsApp Coexistence base verificato su tenant reale.", "Composer unificato, rubrica, rich text/allegati e collaborazione presenti a livello Core."]}
    requiresVerification={["Recovery drill, SLO e alert Gmail.", "WhatsApp fuori 24 ore e billing Meta sul WABA specifico.", "App review e permessi reali dei social.", "Outlook, IMAP/SMTP, OTA e copertura completa dei canali non ancora implementati/auditati."]}
    faqs={faqs}
    related={[
      { href: "/features/crm", title: "CRM alberghiero", description: "Collega ogni conversazione al profilo ospite e alla pipeline commerciale." },
      { href: "/features/whatsapp-hotel", title: "WhatsApp per hotel", description: "Approfondisci il flusso WhatsApp Business e le regole fuori 24 ore." },
      { href: "/features/ai-assistant", title: "AI assistita", description: "Genera bozze e usa knowledge base mantenendo il controllo dell'operatore." },
      { href: "/features/manutenzioni-hotel", title: "Manutenzioni", description: "Trasforma una criticità emersa in conversazione in un'attività ManuBot quando il modulo è attivo." },
    ]}
    ctaTitle="Vuoi centralizzare i canali del tuo hotel?"
    ctaDescription="Nella demo partiamo dalle caselle e dai numeri realmente utilizzati per verificare connettori, permessi e modalità di lavoro del team."
    schemaName="Inbox omnicanale per hotel, email e WhatsApp"
    schemaDescription={description}
  />
}
