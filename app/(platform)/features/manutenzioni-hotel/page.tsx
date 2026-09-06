import { ClipboardCheck, Gauge, Hotel, PackageSearch, UsersRound, Wrench } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Software manutenzioni per hotel con ManuBot integrato in HotelAccelerator: ticket, segnalazioni, attività tecniche, asset, team e storico operativo collegati alla struttura."

export const metadata = buildFeatureMetadata({
  slug: "manutenzioni-hotel",
  title: "Software manutenzioni hotel: ticket, asset e attività",
  description,
  keywords: ["software manutenzioni hotel", "gestione manutenzioni hotel", "ticket manutenzione hotel", "asset hotel", "segnalazioni hotel", "manutenzione preventiva hotel"],
})

const capabilities = [
  { icon: Wrench, title: "Ticket e attività tecniche", description: "ManuBot è il dominio specializzato della suite per trasformare segnalazioni e problemi operativi in attività assegnabili e tracciabili." },
  { icon: ClipboardCheck, title: "Segnalazioni operative", description: "Una criticità può essere registrata con contesto, priorità e informazioni utili per il personale che deve intervenire." },
  { icon: UsersRound, title: "Team e assegnazioni", description: "Le attività possono essere associate al team o agli operatori disponibili nel perimetro della struttura." },
  { icon: PackageSearch, title: "Asset e inventario", description: "Il prodotto ManuBot prevede il dominio di asset, inventario e informazioni tecniche collegate agli interventi." },
  { icon: Gauge, title: "Stato e KPI", description: "Ticket aperti, attività, tempi e altri indicatori possono diventare una vista operativa quando i dati del modulo sono disponibili." },
  { icon: Hotel, title: "Collegamento alla suite", description: "HotelAccelerator collega il tenant al company scope corretto di ManuBot senza accedere direttamente al database del prodotto satellite." },
]

const faqs = [
  { question: "ManuBot è il modulo manutenzioni di HotelAccelerator?", answer: "Sì. ManuBot è un prodotto autonomo della suite 4BID e rappresenta il dominio specializzato per manutenzioni e attività tecniche. HotelAccelerator lo integra tramite entitlement e contratti dedicati." },
  { question: "Posso creare un ticket da una conversazione o da una recensione?", answer: "La direzione di prodotto prevede azioni contestuali verso ManuBot nelle superfici dove nasce il problema. La disponibilità reale della singola azione dipende dall'entitlement e dal contratto API effettivamente collaudato." },
  { question: "I tecnici vedono tutti i dati del CRM?", answer: "No. Le autorizzazioni restano separate per area e tenant. L'integrazione deve passare solo il contesto necessario all'attività, senza trasformare ManuBot in un accesso indiscriminato ai dati dell'ospite." },
  { question: "ManuBot gestisce manutenzione preventiva e asset?", answer: "Il prodotto è progettato per coprire segnalazioni, preventive, asset, inventario, costi e KPI. Dal punto di vista del Core HotelAccelerator, l'intero prodotto satellite richiede però audit separato prima di promuovere ogni capability come verificata." },
]

export default function ManutenzioniHotelPage() {
  return <FeatureLandingPage
    slug="manutenzioni-hotel"
    eyebrow="Manutenzioni hotel"
    icon={Wrench}
    title="Dalla segnalazione all'intervento, senza perdere il contesto"
    intro="HotelAccelerator integra ManuBot per collegare problemi operativi, ticket, attività tecniche, asset e persone responsabili. L'obiettivo è evitare segnalazioni disperse tra messaggi, fogli e passaggi verbali, mantenendo chiaro chi deve fare cosa e per quale struttura."
    statusLabel="Integrazione Core → ManuBot presente nel codice"
    statusDescription="Il Core risolve il company scope in modo esplicito e fail-closed. Creazione e aggiornamento task su tenant reale devono essere collaudati con il backend ManuBot corrente."
    benefits={[
      { title: "Problemi più tracciabili", description: "Una segnalazione diventa un'attività con responsabilità e stato invece di restare in una chat o in una nota informale." },
      { title: "Contesto nel punto giusto", description: "L'azione verso ManuBot può nascere dove emerge la criticità, evitando di far ricopiare informazioni all'operatore." },
      { title: "Dominio tecnico separato", description: "ManuBot mantiene asset e manutenzioni nel proprio sistema, mentre HotelAccelerator coordina accesso e contesto di suite." },
    ]}
    capabilitiesTitle="Cosa comprende l'area manutenzioni"
    capabilitiesIntro="Il modulo tecnico resta specializzato, ma può essere richiamato dalle superfici di HotelAccelerator quando l'entitlement è attivo."
    capabilities={capabilities}
    workflowTitle="Come nasce un'attività di manutenzione"
    workflow={[
      { title: "La criticità viene rilevata", description: "Può emergere da un operatore, da una conversazione, da una recensione o da un controllo operativo." },
      { title: "Viene creato il contesto tecnico", description: "La segnalazione passa al company scope ManuBot corretto con le informazioni necessarie e senza accessi cross-tenant." },
      { title: "Il team la gestisce", description: "Assegnazione, stato e successive attività restano nel dominio manutenzioni, con ritorno di informazioni alla suite quando previsto dal contratto." },
    ]}
    seoSections={[
      { title: "Gestione manutenzioni alberghiere collegata al lavoro quotidiano", paragraphs: ["In hotel una criticità tecnica può nascere ovunque: camera, SPA, ristorante, reception o recensione dell'ospite. Se il problema viene gestito solo con messaggi informali, è facile perdere priorità, responsabilità e storico.", "L'integrazione tra HotelAccelerator e ManuBot punta a trasformare questi segnali in attività operative senza duplicare il dominio tecnico dentro il CRM."], bullets: ["Ticket e segnalazioni", "Assegnazioni al team", "Asset e inventario nel dominio ManuBot", "Collegamento contestuale dalle superfici della suite"] },
    ]}
    availableNow={["Client Core ManuBot con company scope esplicito.", "Entitlement e mapping property → company presenti nel codice.", "Fail-closed quando il mapping non è affidabile.", "Prodotto ManuBot collegabile come satellite della suite."]}
    requiresVerification={["Creazione task reale sul backend ManuBot corrente.", "Aggiornamento e ritorno stato end-to-end.", "Permessi e visibilità del team tecnico.", "Audit separato delle capability avanzate ManuBot."]}
    faqs={faqs}
    related={[
      { href: "/features/hr-hotel", title: "HR per hotel", description: "Gestisci il personale e i reparti che possono partecipare alle attività operative." },
      { href: "/features/inbox-omnicanale", title: "Inbox omnicanale", description: "Trasforma una criticità emersa in conversazione in un'attività operativa quando ManuBot è attivo." },
    ]}
    ctaTitle="Vuoi collegare manutenzioni e attività operative?"
    ctaDescription="Verifichiamo entitlement, struttura del team e flusso ticket prima di attivare l'integrazione con ManuBot."
    schemaName="Software manutenzioni hotel integrato con ManuBot"
    schemaDescription={description}
  />
}
