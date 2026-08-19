import { BookOpenText, Bot, CircleGauge, FileUp, HandHelping, SearchCheck } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Genera bozze di risposta da knowledge base con confidenza, fonti e passaggio all'operatore. L'AI assiste il team: l'invio resta sotto controllo umano."

export const metadata = buildFeatureMetadata({
  slug: "ai-assistant",
  title: "AI per hotel con controllo umano",
  description,
  keywords: [
    "ai hotel",
    "assistente ai hotel",
    "bozze risposta ospiti",
    "knowledge base hotel",
    "ai reception hotel",
    "risposte email hotel",
  ],
})

const capabilities = [
  {
    icon: BookOpenText,
    title: "Knowledge base della struttura",
    description:
      "Organizza le informazioni approvate dell'hotel in fonti separate per tenant, così la bozza parte dal contesto disponibile.",
  },
  {
    icon: FileUp,
    title: "Import da URL e documenti",
    description:
      "Le fonti possono essere alimentate tramite scansione di pagine e caricamento di documenti, da rivedere prima dell'uso operativo.",
  },
  {
    icon: Bot,
    title: "Bozza su richiesta",
    description:
      "L'operatore genera una risposta a partire dall'ultimo messaggio del cliente e dalla cronologia disponibile, poi decide come modificarla.",
  },
  {
    icon: SearchCheck,
    title: "Fonti richiamate",
    description:
      "La risposta assistita restituisce i riferimenti alle fonti usate, così il team può controllare il fondamento della bozza.",
  },
  {
    icon: CircleGauge,
    title: "Confidenza e lacune",
    description:
      "Un indicatore di confidenza e la rilevazione dei gap aiutano a riconoscere i casi in cui la knowledge base va migliorata.",
  },
  {
    icon: HandHelping,
    title: "Revisione e passaggio umano",
    description:
      "L'operatore mantiene il controllo dell'invio e può prendere in carico richieste delicate, ambigue o prive di fonti sufficienti.",
  },
]

const faqs = [
  {
    question: "L'AI risponde e invia messaggi autonomamente 24/7?",
    answer:
      "No. La funzione pubblicizzata qui genera una bozza assistita su richiesta. Un operatore la verifica, la modifica se necessario e decide se inviarla.",
  },
  {
    question: "Come si limita il rischio di risposte inventate?",
    answer:
      "Le bozze usano le fonti della knowledge base e restituiscono riferimenti e confidenza. Questi controlli aiutano, ma non sostituiscono la revisione umana.",
  },
  {
    question: "Quali contenuti può usare la knowledge base?",
    answer:
      "Può acquisire contenuti da URL e documenti supportati. Il team deve verificare accuratezza, aggiornamento, diritti d'uso e presenza di dati non necessari.",
  },
  {
    question: "L'AI può lavorare in più lingue?",
    answer:
      "Il modello può gestire più lingue, ma qualità, tono e terminologia devono essere collaudati sui contenuti e sui casi d'uso della struttura prima dell'attivazione.",
  },
]

export default function AIAssistantLandingPage() {
  return (
    <FeatureLandingPage
      slug="ai-assistant"
      eyebrow="AI assistita per hotel"
      icon={Bot}
      title="Bozze fondate sulle tue fonti, invio sotto controllo umano"
      intro="HotelAccelerator aiuta il team a preparare risposte usando la knowledge base della struttura. Confidenza, fonti e revisione restano visibili prima dell'invio."
      statusLabel="Generazione assistita presente nel codice"
      statusDescription="La funzione genera bozze on demand dalla knowledge base. Non viene presentata come concierge autonomo né come garanzia di risposta continua o priva di errori."
      capabilitiesTitle="Come assiste il lavoro del team"
      capabilitiesIntro="L'obiettivo è ridurre la ricerca manuale delle informazioni mantenendo responsabilità, contesto e decisione finale nelle mani dell'operatore."
      capabilities={capabilities}
      availableNow={[
        "Knowledge base separate per tenant con contenuti da URL e documenti.",
        "Bozza contestuale generata su richiesta dalla conversazione disponibile.",
        "Confidenza e identificativi delle fonti restituiti insieme alla risposta.",
        "Rilevazione dei gap informativi e passaggio all'operatore.",
      ]}
      requiresVerification={[
        "Qualità, aggiornamento e copertura della knowledge base della struttura.",
        "Tono di voce e qualità linguistica sui casi d'uso reali.",
        "Policy per dati personali, contenuti sensibili e richieste ad alto rischio.",
        "Qualsiasi flusso automatico futuro prima di rimuovere la revisione umana.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/inbox-omnicanale",
          title: "Inbox per hotel",
          description: "Genera la bozza nel contesto della conversazione e lascia l'invio all'operatore.",
        },
        {
          href: "/features/crm",
          title: "CRM alberghiero",
          description: "Collega la conversazione al profilo autorizzato senza esporre dati di altri tenant.",
        },
      ]}
      ctaTitle="Valutiamo l'AI sui contenuti della tua struttura"
      ctaDescription="La demo mostra fonti, confidenza e revisione della bozza: nessuna promessa di autonomia viene data senza collaudo."
      schemaName="AI per hotel con knowledge base e controllo umano"
      schemaDescription={description}
    />
  )
}
