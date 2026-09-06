import { BarChart3, ContactRound, FileEdit, Mail, Send, Tags } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Email marketing per hotel collegato al CRM: campagne, segmenti, consensi, contenuti e metriche. Invio, lifecycle e automazioni si attivano soltanto dopo verifica del provider e del flusso reale."

export const metadata = buildFeatureMetadata({
  slug: "email-marketing",
  title: "Email marketing per hotel collegato al CRM",
  description,
  keywords: ["email marketing hotel", "campagne email hotel", "newsletter hotel", "crm email hotel", "marketing alberghiero", "automazione email hotel", "segmentazione clienti hotel"],
})

const capabilities = [
  { icon: FileEdit, title: "Bozze di campagna", description: "Salva nome, oggetto, preview, mittente, reply-to e contenuto della campagna nell'area del tenant." },
  { icon: ContactRound, title: "Contatti e consensi dal CRM", description: "Segmenti e destinatari devono derivare dai dati CRM effettivamente disponibili e dallo stato del consenso prima di qualsiasi invio." },
  { icon: Tags, title: "Segmentazione", description: "Il modulo può riferirsi a segmenti del CRM, mentre valutazione dinamica e composizione finale del pubblico richiedono verifica sul workflow reale." },
  { icon: BarChart3, title: "Metriche di campagna", description: "Invii, consegne, aperture, click, bounce e disiscrizioni sono significativi soltanto quando il provider li registra correttamente." },
  { icon: Mail, title: "Contenuto e anteprima", description: "L'interfaccia raccoglie contenuto HTML e dati della campagna per consentire un controllo prima della pubblicazione o dell'invio." },
  { icon: Send, title: "Invio sotto controllo", description: "Provider, destinatari, consenso, retry, errori e tracking devono essere collaudati prima di dichiarare un flusso automatico attivo." },
]

const faqs = [
  { question: "Posso inviare newsletter ai clienti dell'hotel?", answer: "La piattaforma dispone di campagne collegate al CRM, ma il pubblico effettivo deve rispettare consenso e disiscrizione. L'invio reale dipende inoltre dal provider configurato e dal collaudo della deliverability." },
  { question: "Sono già attive email automatiche pre-stay e post-stay?", answer: "L'automazione lifecycle è una direzione del prodotto, ma non viene dichiarata production-ready nello stato corrente. Campagne e superfici esistono; scheduling, trigger e conversion tracking completi richiedono ancora verifica." },
  { question: "Posso segmentare gli ospiti?", answer: "Il CRM supporta dati e definizioni utili alla segmentazione. Prima di usare un segmento come lista definitiva di invio devono essere verificati regole dinamiche, consenso e composizione dei destinatari." },
  { question: "Come leggo aperture e click?", answer: "Le metriche vengono mostrate quando sono memorizzate dal flusso. Per interpretarle serve sapere che tracking e provider siano realmente attivi; inoltre aperture e click non equivalgono automaticamente a prenotazioni." },
]

export default function EmailMarketingLandingPage() {
  return <FeatureLandingPage
    slug="email-marketing"
    eyebrow="Email marketing per hotel"
    icon={Mail}
    title="Campagne email costruite sui dati e sui consensi del CRM"
    intro="HotelAccelerator collega campagne, contatti e metriche nello stesso ecosistema. La priorità è sapere a chi si sta scrivendo, con quale consenso e attraverso quale provider prima di aggiungere automazioni commerciali più aggressive."
    statusLabel="Creazione campagne presente; lifecycle completo ancora da verificare"
    statusDescription="Bozze, campi campagna e metriche sono presenti. Invio, scheduling, automazioni e attribution devono essere collaudati con provider e dati reali prima di essere considerati operativi."
    benefits={[
      { title: "CRM e campagne nello stesso flusso", description: "Il marketing può partire dai dati del cliente invece di gestire liste scollegate e difficili da aggiornare." },
      { title: "Consenso visibile", description: "Stato marketing e disiscrizione restano parte del profilo e del controllo prima dell'invio." },
      { title: "Metriche contestualizzate", description: "Le performance possono essere lette insieme ai dati della suite quando esistono fonti affidabili per il collegamento." },
    ]}
    capabilitiesTitle="Funzioni per campagne e newsletter dell'hotel"
    capabilitiesIntro="La piattaforma costruisce prima una base affidabile di dati, consenso e contenuto; le automazioni vengono aggiunte soltanto quando il flusso di invio è verificato."
    capabilities={capabilities}
    workflowTitle="Dalla selezione del pubblico alla misurazione"
    workflow={[
      { title: "Si prepara la campagna", description: "Oggetto, mittente, contenuto e segmento vengono salvati nel tenant e controllati prima dell'invio." },
      { title: "Si verifica il pubblico", description: "Contatti, consenso e disiscrizioni determinano chi può realmente entrare nella lista destinatari." },
      { title: "Si misurano gli esiti", description: "Quando provider e tracking sono attivi, la piattaforma archivia le metriche disponibili senza confonderle con revenue non attribuita." },
    ]}
    seoSections={[
      { title: "Email marketing alberghiero basato sul ciclo dell'ospite", paragraphs: ["Le campagne di un hotel possono avere obiettivi diversi: promozioni, ritorno degli ospiti, comunicazioni stagionali o proposte legate al soggiorno. Per essere utili devono però partire da dati aggiornati e da un consenso gestito correttamente.", "HotelAccelerator collega il modulo campagne al CRM proprio per ridurre la distanza tra database clienti e comunicazione. Le automazioni pre-stay, post-stay e di recupero vengono considerate un livello successivo, da attivare solo quando trigger e conversion tracking sono affidabili."], bullets: ["Campagne e bozze", "Segmenti collegati al CRM", "Consenso e disiscrizione", "Metriche quando il provider le registra"] },
    ]}
    availableNow={["Creazione e salvataggio di campagne per tenant.", "Campi per oggetto, mittente, contenuto, reply-to e segmento.", "Dashboard delle metriche memorizzate.", "Autorizzazione server-side dell'area marketing."]}
    requiresVerification={["Provider di invio, deliverability, retry ed error handling.", "Destinatari effettivi, consenso e disiscrizione prima dell'invio.", "Scheduling e automazioni lifecycle.", "Attribution della prenotazione e del ricavo alle campagne."]}
    faqs={faqs}
    related={[
      { href: "/features/crm", title: "CRM alberghiero", description: "Gestisci contatti, consensi e dati utili a definire il pubblico." },
      { href: "/features/analytics", title: "Analytics e tracking", description: "Misura le fonti e gli eventi realmente collegati alle campagne." },
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Mantieni la relazione individuale separata dalle campagne massive." },
      { href: "/features/ai-assistant", title: "AI per hotel", description: "Usa conoscenza e assistenza AI per preparare contenuti sotto controllo umano." },
    ]}
    ctaTitle="Vuoi costruire campagne partendo dal tuo CRM?"
    ctaDescription="Nella demo verifichiamo database, consensi, segmenti e provider prima di definire il flusso di invio più adatto alla struttura."
    schemaName="Email marketing per hotel collegato al CRM"
    schemaDescription={description}
  />
}
