import { ContactRound, Headphones, Phone, PhoneCall, Route, ScrollText } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Telefonia per hotel integrata con CRM e Inbox: centralini compatibili, click-to-call, journal chiamate, trascrizioni e flussi vocali AI dove configurati."

export const metadata = buildFeatureMetadata({
  slug: "telefono-hotel",
  title: "Telefonia per hotel integrata con CRM e centralino",
  description,
  keywords: ["centralino hotel", "telefonia hotel", "crm telefono hotel", "click to call hotel", "centralino voip hotel", "ai telefono hotel"],
})

const capabilities = [
  { icon: Phone, title: "Centralino configurabile", description: "Il tenant può collegare un provider supportato senza trasformare 3CX nel modello universale della piattaforma." },
  { icon: PhoneCall, title: "Click-to-call", description: "Dove il provider lo consente, l'operatore può avviare una chiamata dal contesto del contatto o dell'area operativa." },
  { icon: ScrollText, title: "Journal chiamate", description: "Le chiamate possono essere registrate come eventi applicativi con metadati, esito e collegamento al tenant corretto." },
  { icon: ContactRound, title: "Contesto CRM", description: "Il numero chiamante può essere ricondotto al contatto disponibile per aprire o arricchire la scheda corretta." },
  { icon: Headphones, title: "Voice Agent", description: "Su 3CX è presente un flusso Voice Agent collegato alle knowledge base e ai tool del Core, con fallback verso operatori configurati." },
  { icon: Route, title: "Routing provider-agnostic", description: "Il Core usa adapter diversi per provider, mantenendo configurazioni e capacità specifiche separate." },
]

const faqs = [
  { question: "Quali centralini può gestire HotelAccelerator?", answer: "Il registry include 3CX, Wildix, NethVoice, VOIspeed, Yeastar, Teams Phone, Webex Calling, Asterisk/FreePBX e Avaya IP Office. Le capacità effettive cambiano per provider e nessun nuovo adapter viene considerato verificato su tenant reale senza un test E2E sull'impianto cliente." },
  { question: "Posso chiamare direttamente dal CRM?", answer: "Il click-to-call è previsto per i provider che espongono un'integrazione adatta. La disponibilità va verificata sulla configurazione del centralino della struttura." },
  { question: "HotelAccelerator registra le telefonate?", answer: "La piattaforma dispone di journal e superfici per chiamate; registrazione audio e trascrizione dipendono dal provider, dai permessi, dalla configurazione e dagli obblighi privacy applicabili." },
  { question: "L'AI può rispondere alle telefonate?", answer: "Esiste un Voice Agent 3CX collegato a OpenAI Realtime e alle knowledge base del Core. La prova reale del provider vocale non equivale però a dichiarare tutta la catena telefonica production-ready." },
]

export default function TelefonoHotelPage() {
  return <FeatureLandingPage
    slug="telefono-hotel"
    eyebrow="Telefonia per hotel"
    icon={Phone}
    title="Centralino, CRM e chiamate nello stesso contesto operativo"
    intro="HotelAccelerator collega la telefonia al lavoro quotidiano del team: contatto, chiamata, storico e azioni successive possono vivere nello stesso perimetro, senza obbligare l'hotel a cambiare centralino se il provider è integrabile."
    statusLabel="Layer telefonico provider-agnostic presente nel Core"
    statusDescription="3CX conserva le evidenze reali più avanzate. Gli altri provider dispongono di adapter e guide a livelli diversi e richiedono collaudo su impianto cliente."
    benefits={[
      { title: "Chiamate meno isolate", description: "Il contatto telefonico può entrare nel CRM invece di restare soltanto nel registro del centralino." },
      { title: "Meno passaggi manuali", description: "Click-to-call, journal e contesto riducono copia-incolla di numeri e note tra sistemi separati." },
      { title: "Più continuità con l'ospite", description: "Chi risponde può avere accesso alle informazioni autorizzate sul contatto e alle attività collegate." },
    ]}
    capabilitiesTitle="Cosa può fare la telefonia di HotelAccelerator"
    capabilitiesIntro="Le funzioni dipendono dal provider scelto: il Core espone un contratto comune, mentre le capacità specifiche restano nell'adapter corretto."
    capabilities={capabilities}
    workflowTitle="Dal numero chiamante alla scheda operativa"
    workflow={[
      { title: "Il PBX genera l'evento", description: "Il provider o il bridge invia i dati disponibili della chiamata secondo il contratto configurato." },
      { title: "Il Core identifica il tenant", description: "Mapping e regole server-side impediscono di dedurre il tenant da dati ambigui quando più strutture condividono infrastrutture." },
      { title: "La chiamata entra nel contesto", description: "Il journal può collegarsi al contatto, alla trascrizione e alle attività successive disponibili." },
    ]}
    seoSections={[
      { title: "Centralino VoIP per hotel senza lock-in su un solo provider", paragraphs: ["Molti hotel hanno già un centralino operativo. Sostituirlo soltanto per usare il CRM può essere costoso e poco realistico. Per questo HotelAccelerator separa il contratto telefonico comune dagli adapter specifici del fornitore.", "La struttura può quindi valutare l'integrazione con il proprio impianto e mantenere attivo il provider funzionante finché una nuova configurazione non supera le verifiche previste."], bullets: ["Un solo PBX attivo per tenant", "Switch solo dopo verifica riuscita quando supportato", "Segreti lato server", "Funzioni specifiche non simulate sui provider che non le offrono"] },
    ]}
    availableNow={["Registry centralini e configurazione provider nel Core.", "Adapter di verifica per diversi provider.", "Click-to-call per i provider già supportati dal relativo adapter.", "Flussi 3CX con journal, routing e Voice Agent presenti nel codice."]}
    requiresVerification={["E2E reale sul centralino della struttura.", "Disponibilità effettiva di recording, transcript e journal dal provider.", "Permessi privacy e policy interne sulle registrazioni.", "Collaudo dei provider diversi da 3CX su impianti cliente."]}
    faqs={faqs}
    related={[
      { href: "/features/crm", title: "CRM alberghiero", description: "Collega chiamate e numeri al profilo e alla pipeline del contatto." },
      { href: "/features/calendario-domanda", title: "Calendario domanda", description: "Trasforma richieste estratte dalle conversazioni e telefonate in segnali per data." },
    ]}
    ctaTitle="Vuoi collegare il centralino del tuo hotel?"
    ctaDescription="Nella demo verifichiamo provider, versione, funzioni disponibili e livello di integrazione realistico prima di cambiare qualsiasi configurazione esistente."
    schemaName="Telefonia e centralino per hotel integrati con CRM"
    schemaDescription={description}
  />
}
