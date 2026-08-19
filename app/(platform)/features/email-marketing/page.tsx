import { BarChart3, ContactRound, FileEdit, Mail, Send, Tags } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Prepara campagne email per hotel usando contatti e segmenti del CRM. Bozze e metriche sono disponibili; invio e automazioni si attivano solo dopo verifica."

export const metadata = buildFeatureMetadata({
  slug: "email-marketing",
  title: "Campagne email per hotel e CRM",
  description,
  keywords: [
    "email marketing hotel",
    "campagne email hotel",
    "newsletter hotel",
    "crm email hotel",
    "gestione campagne albergo",
    "marketing alberghiero",
  ],
})

const capabilities = [
  {
    icon: FileEdit,
    title: "Bozze di campagna",
    description:
      "Salva nome, oggetto, testo di anteprima, mittente, reply-to e contenuto della campagna nell'area del tenant.",
  },
  {
    icon: ContactRound,
    title: "Collegamento al CRM",
    description:
      "La campagna può riferirsi a un segmento del CRM; destinatari e consenso devono essere verificati prima dell'invio.",
  },
  {
    icon: Tags,
    title: "Stati operativi",
    description:
      "L'elenco distingue bozze, programmate, in invio, inviate e sospese quando questi stati sono valorizzati dal processo.",
  },
  {
    icon: BarChart3,
    title: "Metriche archiviate",
    description:
      "La dashboard legge conteggi di invio, consegna, apertura, clic, rimbalzi e disiscrizioni quando la fonte li ha registrati.",
  },
  {
    icon: Mail,
    title: "Contenuto email",
    description:
      "L'interfaccia raccoglie contenuto HTML e offre una vista di anteprima per controllare la campagna prima di procedere.",
  },
  {
    icon: Send,
    title: "Invio sotto verifica",
    description:
      "L'invio reale non viene dichiarato attivo finché provider, destinatari, consensi, retry e tracciamento non sono collaudati.",
  },
]

const faqs = [
  {
    question: "HotelAccelerator invia già campagne automatiche pre e post soggiorno?",
    answer:
      "No, non come funzione dichiarata production-ready. La creazione e l'archiviazione delle campagne sono presenti; automazioni, scheduling e invio reale devono essere completati e collaudati.",
  },
  {
    question: "Le metriche di apertura e clic sono reali?",
    answer:
      "La dashboard legge i valori memorizzati per ogni campagna. I numeri sono significativi solo quando il provider di invio e il tracking sono configurati correttamente.",
  },
  {
    question: "Posso usare i segmenti del CRM?",
    answer:
      "Il collegamento dati è predisposto, ma la valutazione dinamica dei segmenti e l'elenco definitivo dei destinatari devono essere verificati prima dell'uso.",
  },
  {
    question: "Sono disponibili A/B test e invio all'orario migliore?",
    answer:
      "Queste funzioni non sono presentate come disponibili nello stato attuale. Saranno comunicate solo dopo implementazione e prova nel codice e su un tenant reale.",
  },
]

export default function EmailMarketingLandingPage() {
  return (
    <FeatureLandingPage
      slug="email-marketing"
      eyebrow="Campagne email"
      icon={Mail}
      title="Prepara campagne email partendo dai dati del CRM"
      intro="Il modulo organizza bozze, contenuti, mittenti e metriche. L'invio automatico viene attivato solo quando provider, consensi e processo operativo sono stati verificati."
      statusLabel="Creazione campagne presente; invio in consolidamento"
      statusDescription="La pagina distingue ciò che è già nel codice dalle automazioni commerciali che non sono ancora dichiarate operative o vendibili."
      capabilitiesTitle="Una base concreta per il marketing email"
      capabilitiesIntro="Il focus attuale è rendere affidabili dati, consenso e destinatari prima di aggiungere automazioni o promesse di performance."
      capabilities={capabilities}
      availableNow={[
        "Creazione e salvataggio di campagne associate alla struttura.",
        "Campi per oggetto, mittente, contenuto, reply-to e segmento.",
        "Elenco campagne e dashboard delle metriche memorizzate.",
        "Autorizzazione dell'area marketing lato server.",
      ]}
      requiresVerification={[
        "Provider di invio, deliverability, retry e gestione degli errori.",
        "Destinatari effettivi, consenso e disiscrizione prima di ogni invio.",
        "Scheduling, automazioni lifecycle, A/B test e attribuzione del ricavo.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/crm",
          title: "CRM alberghiero",
          description: "Gestisci contatti, consensi e dati utili a definire il pubblico.",
        },
        {
          href: "/features/analytics",
          title: "Analytics e tracking",
          description: "Consulta solo le metriche prodotte da fonti realmente collegate.",
        },
      ]}
      ctaTitle="Partiamo da contatti e consensi reali"
      ctaDescription="Nella demo controlliamo CRM, segmenti e provider prima di definire il flusso di invio adatto alla struttura."
      schemaName="Gestione campagne email per hotel collegata al CRM"
      schemaDescription={description}
    />
  )
}
