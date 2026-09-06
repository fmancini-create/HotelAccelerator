import { Banknote, FileText, Landmark, PieChart, ReceiptText, WalletCards } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Controllo di gestione per hotel con HotelProfitAI integrato in HotelAccelerator: costi, fatture, budget, banche, finanza e lettura economica della struttura."

export const metadata = buildFeatureMetadata({
  slug: "controllo-gestione-hotel",
  title: "Controllo di gestione per hotel, costi e marginalità",
  description,
  keywords: ["controllo di gestione hotel", "software costi hotel", "budget hotel", "marginalità hotel", "fatture hotel", "finanza hotel"],
})

const capabilities = [
  { icon: ReceiptText, title: "Fatture e documenti", description: "HotelProfitAI è il dominio specializzato per documenti economici, fatture e processi amministrativi collegati." },
  { icon: PieChart, title: "Costi e centri di costo", description: "Le voci economiche possono essere organizzate per categorie e centri di costo per leggere meglio dove si genera spesa." },
  { icon: WalletCards, title: "Budget e scostamenti", description: "Il modulo può mettere in relazione budget, consuntivi e andamento economico sui dati realmente disponibili." },
  { icon: Landmark, title: "Banche e movimenti", description: "Le integrazioni bancarie appartengono al dominio finanziario e dipendono dal provider AISP realmente configurato e autorizzato." },
  { icon: FileText, title: "Piano dei conti", description: "La classificazione contabile e gestionale può essere strutturata per rendere leggibile il dato economico della singola struttura." },
  { icon: Banknote, title: "Visione finanziaria", description: "Liquidità, pagamenti e indicatori finanziari possono essere federati nella suite quando le fonti sono attive e verificate." },
]

const faqs = [
  { question: "HotelProfitAI fa parte di HotelAccelerator?", answer: "HotelProfitAI è un prodotto autonomo della suite 4BID, integrabile in HotelAccelerator. Mantiene il dominio economico, contabile e finanziario e può essere attivato come modulo collegato." },
  { question: "Posso importare fatture e costi?", answer: "Il prodotto dispone di funzioni dedicate a fatture, documenti e classificazione economica. Lo stato reale dei singoli connettori e dei flussi di registrazione va verificato nel prodotto HotelProfitAI e sul tenant specifico." },
  { question: "Il sistema sostituisce il commercialista?", answer: "No. HotelProfitAI è pensato per controllo di gestione e processi amministrativi assistiti. Non viene presentato come sostituto automatico delle responsabilità professionali, fiscali o contabili del consulente." },
  { question: "Posso vedere costi e revenue nello stesso ecosistema?", answer: "Sì come obiettivo di suite: HotelAccelerator può collegare il dominio revenue di Santaddeo con il dominio economico di HotelProfitAI mantenendo però i rispettivi sistemi proprietari separati." },
]

export default function ControlloGestioneHotelPage() {
  return <FeatureLandingPage
    slug="controllo-gestione-hotel"
    eyebrow="Controllo di gestione"
    icon={WalletCards}
    title="Costi, budget e finanza dell'hotel in un modulo dedicato"
    intro="HotelAccelerator integra HotelProfitAI per dare alla direzione una lettura economica più strutturata: documenti, costi, budget, banche e indicatori finanziari possono essere collegati alla suite senza confondere il dominio amministrativo con CRM o revenue."
    statusLabel="HotelProfitAI è il prodotto specializzato della suite per il controllo economico"
    statusDescription="Il Core HotelAccelerator non promuove automaticamente l'intero satellite: ogni capability e integrazione finanziaria deve essere verificata sul repository, sul deploy e sul tenant HotelProfitAI."
    benefits={[
      { title: "Più leggibilità sui costi", description: "Centri di costo e classificazioni aiutano a capire dove si concentra la spesa e a confrontarla con il budget." },
      { title: "Meno dati scollegati", description: "Documenti economici e dati bancari possono entrare in un quadro coerente invece di restare in file e portali separati." },
      { title: "Confronto con la parte commerciale", description: "La suite può mettere in relazione informazioni economiche e operative mantenendo chiaro quale modulo possiede ogni dato." },
    ]}
    capabilitiesTitle="Cosa comprende il controllo di gestione"
    capabilitiesIntro="HotelProfitAI gestisce il dominio economico e finanziario; HotelAccelerator ne coordina l'accesso nella suite quando il modulo è attivo."
    capabilities={capabilities}
    workflowTitle="Dai documenti alla lettura economica"
    workflow={[
      { title: "I dati entrano", description: "Fatture, documenti, movimenti o inserimenti manuali arrivano dalle fonti effettivamente configurate." },
      { title: "Vengono classificati", description: "Categorie, piano dei conti e centri di costo consentono di leggere il dato con logica gestionale." },
      { title: "La direzione confronta", description: "Budget, consuntivi e indicatori possono essere analizzati senza trasformare stime o fonti incomplete in numeri certi." },
    ]}
    seoSections={[
      { title: "Controllo di gestione alberghiero oltre la sola contabilità", paragraphs: ["Per un hotel sapere quanto ha fatturato non basta: servono costi per area, andamento rispetto al budget, liquidità e capacità di leggere la marginalità reale. HotelProfitAI nasce come dominio dedicato a questo lavoro.", "L'integrazione nella suite consente di affiancare questi dati alle altre aree operative senza creare accessi diretti fragili tra database o duplicare processi contabili nel Core."], bullets: ["Costi e centri di costo", "Budget e consuntivi", "Fatture e documenti", "Banche e finanza quando il provider è attivo"] },
    ]}
    availableNow={["HotelProfitAI registrato come prodotto economico della suite.", "Superfici dedicate a fatture, costi, banche e finanza nel prodotto satellite.", "Integrazione prevista tramite accesso e contratti di suite."]}
    requiresVerification={["Stato reale dei connettori fiscali e bancari.", "Flussi end-to-end sul tenant HotelProfitAI.", "Qualità della classificazione e dei centri di costo.", "Permessi e isolamento sui dati economici sensibili."]}
    faqs={faqs}
    related={[
      { href: "/features/revenue-management", title: "Revenue management", description: "Confronta la parte ricavi e pricing con la lettura economica della struttura." },
      { href: "/features/analytics", title: "Analytics", description: "Consulta gli indicatori operativi e le fonti attive della piattaforma." },
    ]}
    ctaTitle="Vuoi collegare controllo economico e operatività?"
    ctaDescription="Partiamo da documenti, fonti e struttura dei costi per capire quali dati possono essere centralizzati e con quale livello di automazione."
    schemaName="Controllo di gestione per hotel con HotelProfitAI"
    schemaDescription={description}
  />
}
