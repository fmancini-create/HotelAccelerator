import { CalendarClock, FileLock2, MapPin, ScanFace, ShieldCheck, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Software HR per hotel con dipendenti, reparti, turni, assenze, geofence, timbrature, anomalie e documenti privati, integrato nel tenant HotelAccelerator."

export const metadata = buildFeatureMetadata({
  slug: "hr-hotel",
  title: "Software HR per hotel: turni, presenze e personale",
  description,
  keywords: ["software hr hotel", "gestione personale hotel", "turni hotel", "timbrature hotel", "geofence dipendenti hotel", "assenze personale hotel"],
})

const capabilities = [
  { icon: UsersRound, title: "Dipendenti e reparti", description: "Anagrafiche e reparti vivono nel perimetro del tenant e possono essere gestiti in base ai ruoli autorizzati." },
  { icon: CalendarClock, title: "Turni e assenze", description: "La piattaforma dispone di superfici per pianificare turni, pubblicarli e gestire richieste di assenza." },
  { icon: MapPin, title: "Geofence", description: "La struttura può definire un'area geografica per contestualizzare la timbratura da smartphone e rilevare anomalie fuori zona." },
  { icon: ScanFace, title: "Presenze e timbrature", description: "Entrata, uscita e anomalie possono essere registrate come eventi del dipendente nel tenant corretto." },
  { icon: FileLock2, title: "Documenti privati", description: "I documenti sensibili del personale richiedono storage privato e permessi coerenti con il ruolo dell'utente." },
  { icon: ShieldCheck, title: "Permessi tenant-aware", description: "Le aree HR sono attivabili per tenant e devono rispettare autorizzazioni server-side, non semplici controlli grafici." },
]

const faqs = [
  { question: "HotelAccelerator può gestire i turni del personale?", answer: "Sì, il modulo HR include dipendenti, reparti, turni e assenze nel codice attuale. Il collaudo completo su smartphone e con utenti reali resta necessario prima di considerare l'intero flusso verificato sul tenant." },
  { question: "La timbratura può usare la posizione del telefono?", answer: "Il modulo prevede geofence e verifica della posizione. Permessi GPS, accuratezza e comportamento fuori area devono essere provati sul dispositivo e sul contesto reale della struttura." },
  { question: "I dipendenti vedono tutti i documenti?", answer: "No. I documenti privati devono essere accessibili soltanto agli utenti e ai ruoli autorizzati. L'area HR è tenant-scoped e i file sensibili non devono essere pubblici." },
  { question: "Il modulo HR calcola automaticamente le buste paga?", answer: "No. L'attuale capability riguarda workforce, turni, presenze, assenze, geofence e documenti. Non viene presentata come un sistema payroll completo." },
]

export default function HrHotelPage() {
  return <FeatureLandingPage
    slug="hr-hotel"
    eyebrow="HR per hotel"
    icon={UsersRound}
    title="Turni, presenze e personale dentro la piattaforma dell'hotel"
    intro="HotelAccelerator HR riunisce anagrafiche, reparti, pianificazione dei turni, assenze, timbrature e documenti privati. L'obiettivo è dare a direzione e collaboratori una superficie semplice, separata dai dati degli ospiti ma integrata nello stesso tenant."
    statusLabel="Workforce HR presente nel codice"
    statusDescription="Dipendenti, turni, geofence, timbrature, anomalie e documenti sono implementati. Serve collaudo completo su smartphone e con ruoli reali prima di promuovere il modulo a tenant reale."
    benefits={[
      { title: "Meno fogli e chat separate", description: "Turni e richieste possono essere gestiti in un ambiente condiviso anziché essere distribuiti tra file, messaggi e strumenti diversi." },
      { title: "Presenze contestualizzate", description: "Geofence e anomalie consentono di distinguere una semplice timbratura da un evento che richiede controllo." },
      { title: "Permessi più chiari", description: "Dati del personale e documenti sensibili restano separati dalle aree operative accessibili a tutti gli utenti del tenant." },
    ]}
    capabilitiesTitle="Funzioni HR previste per la struttura"
    capabilitiesIntro="Il modulo è pensato per il lavoro quotidiano del personale alberghiero, senza trasformarsi in un gestionale paghe universale."
    capabilities={capabilities}
    workflowTitle="Dal turno alla presenza"
    workflow={[
      { title: "L'admin organizza il team", description: "Dipendenti e reparti vengono associati al tenant e i turni vengono pianificati e pubblicati." },
      { title: "Il collaboratore consulta", description: "L'utente vede ciò che gli è consentito e può gestire le azioni previste, come richieste di assenza o timbratura." },
      { title: "Le anomalie emergono", description: "Geofence, orari e dati disponibili consentono di evidenziare eventi da verificare senza decidere automaticamente conseguenze sul dipendente." },
    ]}
    seoSections={[
      { title: "Gestione del personale alberghiero con una UI semplice", paragraphs: ["Hotel, resort e strutture ricettive lavorano spesso con reparti, orari e presenze molto diversi tra loro. Un modulo HR utile deve essere rapido da usare anche da smartphone e comprensibile senza formazione tecnica.", "HotelAccelerator mantiene quindi il modulo separato dalle aree CRM e commerciali, ma usa lo stesso tenant e gli stessi principi di autorizzazione per evitare account e contesti duplicati."], bullets: ["Reparti e dipendenti tenant-scoped", "Turni e assenze", "Timbrature con contesto geofence", "Documenti privati con accesso controllato"] },
    ]}
    availableNow={["Dipendenti e reparti.", "Turni e assenze.", "Geofence, timbrature e anomalie.", "Documenti privati nell'area HR."]}
    requiresVerification={["Collaudo smartphone reale.", "Permessi GPS e comportamento fuori geofence.", "Matrice ruoli admin/collaboratore.", "Accesso e isolamento dei documenti sensibili."]}
    faqs={faqs}
    related={[
      { href: "/features/analytics", title: "Analytics", description: "Consulta KPI operativi soltanto sui dati effettivamente raccolti." },
      { href: "/features/manutenzioni-hotel", title: "Manutenzioni", description: "Collega personale operativo e attività tecniche quando ManuBot è attivo." },
    ]}
    ctaTitle="Vuoi vedere il modulo HR sul flusso reale del tuo hotel?"
    ctaDescription="Nella demo possiamo partire da reparti, turni e modalità di timbratura per verificare cosa è già utilizzabile e cosa richiede configurazione."
    schemaName="Software HR per hotel con turni e presenze"
    schemaDescription={description}
  />
}
