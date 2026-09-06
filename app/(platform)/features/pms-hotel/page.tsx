import { BookOpenCheck, Eye, Link2, MonitorCog, RefreshCw, ShieldCheck } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Integra il PMS dell'hotel con HotelAccelerator: vista del gestionale nel workspace, sessioni Browserbase tenant-aware, connettori API separati e apprendimento assistito delle procedure operative."

export const metadata = buildFeatureMetadata({
  slug: "pms-hotel",
  title: "PMS per hotel integrato con CRM, AI e operatività",
  description,
  keywords: ["pms hotel integrazione", "software pms hotel", "integrazione gestionale hotel", "crm pms hotel", "pms api hotel", "ai pms hotel"],
})

const capabilities = [
  { icon: MonitorCog, title: "PMS incorporato", description: "Il gestionale web può essere aperto dentro l'ambiente di lavoro HotelAccelerator tramite una sessione browser dedicata al tenant." },
  { icon: Link2, title: "Connettori API separati", description: "Quando il PMS espone API, la sincronizzazione strutturata resta distinta dalla semplice vista browser e passa attraverso adapter dedicati." },
  { icon: Eye, title: "Osservazione delle procedure", description: "Il modulo può osservare i passaggi operativi effettuati dagli utenti e registrarne la struttura senza salvare i valori digitati come parte della procedura." },
  { icon: BookOpenCheck, title: "Conoscenza approvabile", description: "Le procedure osservate possono alimentare un percorso di apprendimento controllato anziché trasformarsi automaticamente in automazioni operative." },
  { icon: RefreshCw, title: "Contesto riutilizzabile", description: "Browserbase usa un Context per tenant per conservare la sessione del PMS senza copiare credenziali nel database di HotelAccelerator." },
  { icon: ShieldCheck, title: "Separazione tenant", description: "Context, configurazione browser e connettori sono associati alla singola struttura e non vengono dedotti dal client." },
]

const faqs = [
  { question: "HotelAccelerator sostituisce il PMS?", answer: "No, non è questo il presupposto. Il PMS può restare il gestionale proprietario delle prenotazioni e delle funzioni che gli competono; HotelAccelerator lo integra nel flusso operativo e usa connettori API quando disponibili." },
  { question: "Qualsiasi PMS web può essere aperto dentro HotelAccelerator?", answer: "L'architettura browser è progettata in modo agnostico per gestionali web HTTPS. La compatibilità reale dipende comunque da login, policy del sito, comportamento del browser e collaudo sul PMS specifico." },
  { question: "HotelAccelerator salva la password del PMS?", answer: "L'architettura prevista usa il Context del browser remoto per mantenere la sessione. Le credenziali non devono diventare un dato applicativo salvato o automatizzato dal Core." },
  { question: "L'AI impara automaticamente a usare il PMS?", answer: "Esiste un observer delle attività e una base per registrare procedure osservate. Prima di parlare di automazione autonoma servono sessioni reali, approvazione delle procedure, misure di qualità e controlli sull'impatto operativo." },
]

export default function PmsHotelPage() {
  return <FeatureLandingPage
    slug="pms-hotel"
    eyebrow="PMS integrato"
    icon={MonitorCog}
    title="Il PMS resta al centro delle prenotazioni, ma non deve restare isolato"
    intro="HotelAccelerator può incorporare il gestionale web nel workspace e, quando il provider lo consente, collegare dati strutturati tramite API. In questo modo il team evita continui salti tra applicazioni senza forzare una migrazione immediata del PMS."
    statusLabel="PMS Browserbase e observer presenti nel codice"
    statusDescription="Context tenant-aware, Live View e osservazione procedure sono implementati. Serve una procedura reale ripetuta e verificata sul PMS della struttura prima di promuovere il flusso a tenant reale."
    benefits={[
      { title: "Meno cambio di contesto", description: "L'operatore può lavorare sul PMS mantenendo accessibile la navigazione e il contesto di HotelAccelerator." },
      { title: "Integrazione graduale", description: "Vista browser e API sono due livelli separati: si può iniziare dall'accesso operativo e aggiungere sincronizzazioni solo dove esistono contratti affidabili." },
      { title: "Base per l'apprendimento", description: "Le procedure ripetute dagli operatori possono essere osservate e trasformate in conoscenza verificabile prima di qualunque automazione." },
    ]}
    capabilitiesTitle="Come HotelAccelerator lavora con il PMS"
    capabilitiesIntro="L'obiettivo è essere agnostici rispetto al fornitore: il modello dati di un singolo PMS non diventa il modello universale della piattaforma."
    capabilities={capabilities}
    workflowTitle="Tre livelli di integrazione con il gestionale"
    workflow={[
      { title: "Accesso operativo", description: "Il PMS web viene aperto tramite una sessione remota tenant-aware, mantenendo il login nel Context del provider browser." },
      { title: "Sincronizzazione dati", description: "Se esistono API affidabili, un adapter dedicato gestisce prenotazioni, disponibilità o altre entità supportate dal contratto del provider." },
      { title: "Apprendimento controllato", description: "Le procedure osservate vengono registrate come conoscenza candidata e devono essere verificate prima di essere usate per automatizzare azioni." },
    ]}
    seoSections={[
      { title: "Integrare il PMS senza costruire tutto attorno a un solo fornitore", paragraphs: ["Un hotel può cambiare PMS nel tempo, avere più strutture con gestionali diversi o utilizzare un provider che espone API limitate. HotelAccelerator separa quindi il concetto di accesso al gestionale dalla sincronizzazione strutturata dei dati.", "Questa scelta permette di mantenere un Core stabile e di aggiungere adapter diversi senza riscrivere CRM, Inbox o dashboard ogni volta che cambia il provider."], bullets: ["Browser PMS indipendente dal registry dei connettori", "Adapter API sostituibili", "Tenant context esplicito", "Nessuna credenziale PMS esposta al browser applicativo"] },
    ]}
    availableNow={["Browserbase Live View tenant-aware.", "Context riutilizzabile per sessione PMS.", "Observer verso pms_shadow presente nel codice.", "Separazione architetturale tra browser PMS e connettori API."]}
    requiresVerification={["Login e procedura reale sul PMS della struttura.", "Compatibilità con policy e comportamento del gestionale specifico.", "Connettore API disponibile per il provider scelto.", "Qualità e approvazione delle procedure osservate."]}
    faqs={faqs}
    related={[
      { href: "/features/crm", title: "CRM alberghiero", description: "Usa i dati disponibili per arricchire contatti, soggiorni e attività." },
      { href: "/features/revenue-management", title: "Revenue management", description: "Collega i dati PMS ai flussi di pricing e revenue quando il connettore lo consente." },
    ]}
    ctaTitle="Vuoi integrare il PMS che usi già?"
    ctaDescription="Verifichiamo URL, modalità di login, disponibilità API e dati utili prima di progettare qualsiasi sincronizzazione."
    schemaName="PMS per hotel integrato con HotelAccelerator"
    schemaDescription={description}
  />
}
