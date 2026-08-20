import { Activity, BarChart3, Database, MousePointerClick, Route, ShieldCheck } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Raccogli eventi, sessioni e sorgenti dei siti configurati e consulta KPI operativi. Copertura e metriche dipendono dai moduli e dai dati collegati."

export const metadata = buildFeatureMetadata({
  slug: "analytics",
  title: "Analytics e tracking per hotel",
  description,
  keywords: [
    "analytics hotel",
    "tracking sito hotel",
    "eventi sito hotel",
    "sessioni sito hotel",
    "utm hotel",
    "kpi crm hotel",
  ],
})

const capabilities = [
  {
    icon: Database,
    title: "Siti e chiavi di raccolta",
    description:
      "Ogni sito tracciato viene configurato per tenant con una propria chiave di scrittura, così i dati restano separati per struttura.",
  },
  {
    icon: Route,
    title: "Sessioni e sorgenti",
    description:
      "Registra identificatore anonimo, pagina di ingresso e parametri UTM quando il tracker è installato e configurato correttamente.",
  },
  {
    icon: MousePointerClick,
    title: "Eventi del sito",
    description:
      "Raccoglie gli eventi effettivamente strumentati, come visualizzazioni, click e invii di form, senza inventare eventi non inviati dal sito.",
  },
  {
    icon: Activity,
    title: "Dettaglio visite",
    description:
      "Consente di consultare sessioni, visitatori e sequenze di eventi disponibili per analizzare i percorsi osservati.",
  },
  {
    icon: BarChart3,
    title: "KPI dai moduli collegati",
    description:
      "Mostra indicatori CRM ed email quando le relative fonti sono attive e contengono dati attendibili per il tenant.",
  },
  {
    icon: ShieldCheck,
    title: "Raccolta controllata",
    description:
      "Configurazione, permessi e consenso devono essere verificati prima di usare i dati per decisioni operative o commerciali.",
  },
]

const faqs = [
  {
    question: "La dashboard mostra dati in tempo reale?",
    answer:
      "Il sistema registra e consulta gli eventi ricevuti, ma non promette aggiornamenti al secondo. Frequenza e completezza dipendono dal tracker, dalla rete e dalle fonti collegate.",
  },
  {
    question: "HotelAccelerator attribuisce già ogni prenotazione al canale corretto?",
    answer:
      "No. Sessioni e parametri UTM sono disponibili, ma un modello completo di attribuzione della revenue richiede dati di prenotazione collegati e una validazione specifica.",
  },
  {
    question: "Vengono generate previsioni automatiche?",
    answer:
      "La pagina non presenta forecast come funzione pronta. Le analisi previsionali possono essere valutate solo dopo aver verificato quantità, qualità e continuità dei dati storici.",
  },
  {
    question: "È possibile tracciare un sito esterno?",
    answer:
      "Sì, se il sito viene configurato per il tenant e integra correttamente la chiave e gli eventi previsti, nel rispetto delle scelte di consenso.",
  },
]

export default function AnalyticsLandingPage() {
  return (
    <FeatureLandingPage
      slug="analytics"
      eyebrow="Analytics per hotel"
      icon={BarChart3}
      title="Dati osservabili, collegati alle fonti reali"
      intro="HotelAccelerator raccoglie sessioni, sorgenti ed eventi dai siti configurati e affianca i KPI disponibili nei moduli CRM ed email. Ogni numero va letto in base alla copertura effettiva dei dati."
      statusLabel="Raccolta di sessioni ed eventi presente nel codice"
      statusDescription="Installazione del tracker, consenso, chiavi di scrittura e qualità degli eventi devono essere verificati sul singolo sito prima di considerare completa la misurazione."
      capabilitiesTitle="Cosa può misurare oggi"
      capabilitiesIntro="Il sistema espone ciò che riceve dalle fonti configurate. Non presenta forecast, attribuzione della revenue o incrementi percentuali come risultati automatici."
      capabilities={capabilities}
      availableNow={[
        "Configurazione tenant-scoped dei siti e delle chiavi di raccolta.",
        "Sessioni con landing page, sorgenti e parametri UTM disponibili.",
        "Eventi inviati dal tracker e dettaglio dei percorsi osservati.",
        "KPI CRM ed email calcolati sui dati effettivamente presenti.",
      ]}
      requiresVerification={[
        "Installazione del tracker e copertura degli eventi sul sito interessato.",
        "Gestione del consenso e minimizzazione dei dati per il contesto reale.",
        "Collegamento con prenotazioni e revenue prima di parlare di attribuzione.",
        "Completezza, latenza e continuità delle fonti prima di usare i KPI operativamente.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/cms",
          title: "CMS per hotel",
          description: "Pubblica il sito e configura i punti in cui raccogliere gli eventi necessari.",
        },
        {
          href: "/features/crm",
          title: "CRM alberghiero",
          description: "Consulta KPI e profili solo sui dati ospite realmente acquisiti.",
        },
      ]}
      ctaTitle="Partiamo dalle fonti che possiedi davvero"
      ctaDescription="Durante la demo verifichiamo sito, tracker, consenso e moduli collegati prima di definire i KPI utili alla struttura."
      schemaName="Analytics e tracking per hotel"
      schemaDescription={description}
    />
  )
}
