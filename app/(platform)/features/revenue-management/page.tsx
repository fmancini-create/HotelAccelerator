import { BarChart3, Gauge, Hotel, Link2, TrendingUp, Waves } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description = "Revenue management per hotel con Santaddeo integrato in HotelAccelerator: pricing, KPI, forecast, domanda e connettori PMS attivabili in base alla struttura."

export const metadata = buildFeatureMetadata({
  slug: "revenue-management",
  title: "Revenue Management per hotel con pricing e forecast",
  description,
  keywords: ["revenue management hotel", "software revenue hotel", "pricing hotel", "forecast hotel", "rms hotel", "strategia prezzi hotel"],
})

const capabilities = [
  { icon: TrendingUp, title: "Pricing alberghiero", description: "Santaddeo gestisce il dominio revenue e pricing con logiche dedicate e può essere aperto dalla suite quando il modulo è attivo." },
  { icon: BarChart3, title: "KPI revenue", description: "Produzione, andamento e indicatori disponibili dipendono dai dati realmente sincronizzati dal PMS o dalle altre fonti configurate." },
  { icon: Gauge, title: "Forecast e segnali", description: "Il modulo revenue dispone di logiche di previsione e intelligence della domanda, da valutare sul tenant e sulle fonti effettivamente collegate." },
  { icon: Link2, title: "Connettori PMS", description: "I provider PMS passano attraverso connettori dedicati e non vengono trattati come se avessero tutti gli stessi endpoint o lo stesso modello dati." },
  { icon: Waves, title: "Domanda", description: "I segnali di domanda possono essere arricchiti con dati interni e, quando disponibili e autorizzati, con fonti esterne dedicate." },
  { icon: Hotel, title: "Suite integrata", description: "Revenue, CRM, domanda e controllo economico possono essere consultati nello stesso ecosistema pur mantenendo sistemi proprietari separati." },
]

const faqs = [
  { question: "Santaddeo è il modulo revenue di HotelAccelerator?", answer: "Sì. Santaddeo è un prodotto autonomo della suite 4BID e rappresenta il dominio specializzato per RMS, pricing, connettori PMS, forecast e intelligence della domanda." },
  { question: "Il revenue management funziona con qualsiasi PMS?", answer: "La piattaforma è progettata per usare adapter differenti, ma ogni PMS va verificato in base alle API e ai dati che mette realmente a disposizione. La presenza di un provider nel catalogo non equivale a una sincronizzazione già collaudata." },
  { question: "HotelAccelerator modifica automaticamente i prezzi?", answer: "Le capacità di pricing appartengono a Santaddeo. Qualunque flusso di push o autopilot deve essere valutato e collaudato sul connettore e sul tenant reale prima di essere descritto come automatico." },
  { question: "Posso collegare revenue e calendario domanda?", answer: "Sì come direzione di prodotto: il calendario domanda raccoglie richieste per data e può diventare un segnale utile insieme ai dati PMS e agli altri indicatori disponibili." },
]

export default function RevenueManagementPage() {
  return <FeatureLandingPage
    slug="revenue-management"
    eyebrow="Revenue management"
    icon={TrendingUp}
    title="Revenue management collegato ai dati reali della struttura"
    intro="HotelAccelerator integra Santaddeo, il modulo specializzato per pricing e revenue. L'obiettivo è unire segnali di domanda, dati PMS e strategia tariffaria senza nascondere la dipendenza dalla qualità e dalla disponibilità delle fonti."
    statusLabel="Santaddeo presente come dominio revenue della suite"
    statusDescription="Il codice del prodotto è presente nel monorepo, ma stato dei singoli connettori e dei flussi end-to-end deve essere verificato separatamente sul tenant e sul deploy Santaddeo."
    benefits={[
      { title: "Pricing più contestualizzato", description: "Le decisioni tariffarie possono usare dati di produzione e segnali disponibili invece di basarsi soltanto su regole statiche." },
      { title: "PMS non vincolante", description: "L'architettura a connettori evita di costruire il sistema attorno a un unico provider." },
      { title: "Visione di suite", description: "Revenue può dialogare con CRM, domanda e controllo economico mantenendo confini tecnici chiari." },
    ]}
    capabilitiesTitle="Cosa comprende l'area revenue"
    capabilitiesIntro="Santaddeo mantiene il dominio specialistico, mentre HotelAccelerator coordina accesso, tenant e collegamenti con le altre aree della suite."
    capabilities={capabilities}
    workflowTitle="Dal PMS alla decisione tariffaria"
    workflow={[
      { title: "Il connettore legge i dati", description: "Disponibilità, tariffe, produzione o altre entità vengono lette soltanto se il PMS espone il contratto necessario." },
      { title: "Il motore elabora", description: "Santaddeo normalizza i dati e applica le logiche revenue disponibili per il tenant." },
      { title: "Il prezzo viene gestito", description: "Approvazione e push dipendono dal flusso configurato e devono essere verificati sul provider prima dell'automazione." },
    ]}
    seoSections={[
      { title: "RMS per hotel integrato ma non dipendente dal PMS", paragraphs: ["La parte più delicata di un software revenue è la qualità dell'integrazione con il gestionale. HotelAccelerator e Santaddeo evitano di assumere che tutti i PMS espongano le stesse informazioni o consentano le stesse azioni.", "Per questo ogni connettore deve dichiarare dati leggibili, operazioni scrivibili e limiti effettivi. La strategia tariffaria può così evolvere senza trasformare un provider esterno nel cuore dell'architettura."], bullets: ["Connettori PMS tramite adapter", "KPI calcolati sulle fonti attive", "Pricing e forecast nel dominio Santaddeo", "Possibilità di collegare segnali di domanda e dati commerciali"] },
    ]}
    availableNow={["Santaddeo presente come prodotto revenue della suite.", "Codice per pricing, KPI, forecast e connettori PMS nel dominio dedicato.", "Accesso integrabile tramite la suite HotelAccelerator."]}
    requiresVerification={["Connettore PMS specifico della struttura.", "Lettura e normalizzazione dei dati reali.", "Push tariffario end-to-end con retry e audit.", "Stato reale del deploy e dei sottodomini Santaddeo."]}
    faqs={faqs}
    related={[
      { href: "/features/pms-hotel", title: "PMS integrato", description: "Collega il gestionale operativo e i connettori dati della struttura." },
      { href: "/features/calendario-domanda", title: "Calendario domanda", description: "Raccoglie richieste di soggiorno per data come ulteriore segnale operativo." },
    ]}
    ctaTitle="Vuoi capire quali dati revenue possiamo collegare?"
    ctaDescription="Partiamo dal PMS, dalle fonti disponibili e dal processo tariffario attuale per definire un'integrazione verificabile."
    schemaName="Revenue management per hotel con Santaddeo"
    schemaDescription={description}
  />
}
