import { BookOpenCheck, Gauge, Hotel, MailPlus, Search, ShieldCheck, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Centralizza contatti, consensi, segmenti e storico soggiorni. HotelAccelerator collega inbox e CRM e prepara la sincronizzazione con il PMS configurato."

export const metadata = buildFeatureMetadata({
  slug: "crm",
  title: "CRM alberghiero per ospiti e soggiorni",
  description,
  keywords: [
    "crm alberghiero",
    "crm per hotel",
    "gestione ospiti hotel",
    "database clienti hotel",
    "storico soggiorni",
    "consensi marketing hotel",
  ],
})

const capabilities = [
  {
    icon: UsersRound,
    title: "Anagrafica ospiti",
    description:
      "Crea e modifica contatti separati per struttura, con recapiti, tag, livello VIP e informazioni utili al team.",
  },
  {
    icon: Search,
    title: "Ricerca e filtri",
    description:
      "Cerca per nome, email o azienda e filtra i contatti per livello VIP senza uscire dall'area CRM.",
  },
  {
    icon: ShieldCheck,
    title: "Consensi visibili",
    description:
      "Il CRM conserva stato del consenso marketing e disiscrizione, così il team può distinguere i contatti utilizzabili.",
  },
  {
    icon: Hotel,
    title: "Soggiorni e valore",
    description:
      "La scheda contatto può mostrare soggiorni, prenotazioni e ricavi quando questi dati sono stati importati dalla fonte autorizzata.",
  },
  {
    icon: MailPlus,
    title: "Contatti dall'inbox",
    description:
      "Le email possono creare o collegare il contatto corretto, escludendo mittenti automatici e rispettando le impostazioni del tenant.",
  },
  {
    icon: Gauge,
    title: "KPI del database",
    description:
      "Totale contatti, consensi, VIP, prenotazioni, ricavi e punteggio medio vengono calcolati sui dati realmente presenti.",
  },
]

const faqs = [
  {
    question: "Il CRM importa automaticamente tutti gli ospiti dal PMS?",
    answer:
      "La sincronizzazione PMS è presente come flusso configurabile, ma viene attivata e collaudata per il connettore del singolo tenant. Scidoo è il primo adapter previsto; non tutti i PMS sono automaticamente compatibili.",
  },
  {
    question: "Il lead score viene calcolato automaticamente?",
    answer:
      "Il CRM conserva e visualizza il campo di punteggio quando disponibile. Il sito non promette un motore automatico di lead scoring finché regole, test e origine del dato non sono verificati.",
  },
  {
    question: "Posso creare segmenti di contatti?",
    answer:
      "È possibile salvare definizioni di segmento. La valutazione dinamica delle condizioni e il filtro completo dei membri sono ancora in consolidamento.",
  },
  {
    question: "I contatti sono separati tra strutture?",
    answer:
      "Le API CRM applicano lo scope della struttura e i permessi dell'area. L'isolamento va comunque verificato nel collaudo del tenant prima di dichiarare il flusso production-ready.",
  },
]

export default function CrmLandingPage() {
  return (
    <FeatureLandingPage
      slug="crm"
      eyebrow="CRM alberghiero"
      icon={BookOpenCheck}
      title="Un profilo ospite unico per contatti, consensi e soggiorni"
      intro="Il CRM di HotelAccelerator riunisce anagrafiche e dati operativi della struttura, collegando le conversazioni ai contatti e mostrando solo le informazioni realmente disponibili."
      statusLabel="Anagrafiche e KPI presenti nell'area riservata"
      statusDescription="La sincronizzazione con PMS, le regole di segmentazione e la qualità dei dati vengono verificate per ogni struttura durante l'onboarding."
      capabilitiesTitle="Le funzioni CRM già presenti"
      capabilitiesIntro="Nessuna promessa generica di retention o aumento dei ricavi: il valore dipende dalla qualità dei dati e dai processi adottati dal team."
      capabilities={capabilities}
      availableNow={[
        "Creazione, modifica, ricerca e filtri dei contatti per tenant.",
        "Consenso marketing, stato di disiscrizione, tag e livello VIP.",
        "Scheda con soggiorni e KPI aggregati quando i dati sono presenti.",
        "Collegamento e acquisizione controllata dei contatti dalle email.",
      ]}
      requiresVerification={[
        "Configurazione e collaudo del connettore PMS della struttura.",
        "Valutazione dinamica dei segmenti e loro uso come destinatari di campagna.",
        "Regole di calcolo del lead score e provenienza del dato.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/inbox-omnicanale",
          title: "Inbox per hotel",
          description: "Collega conversazioni email e lavoro del team ai profili ospite.",
        },
        {
          href: "/features/email-marketing",
          title: "Campagne email",
          description: "Prepara campagne usando dati e consensi del CRM verificati.",
        },
      ]}
      ctaTitle="Verifichiamo insieme dati e PMS"
      ctaDescription="La demo parte dal database ospiti e dal connettore disponibile, così distinguiamo subito ciò che è attivabile da ciò che richiede integrazione."
      schemaName="CRM alberghiero per contatti, consensi e soggiorni"
      schemaDescription={description}
    />
  )
}
