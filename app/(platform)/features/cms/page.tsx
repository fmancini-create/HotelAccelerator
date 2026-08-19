import { FileClock, Globe2, Images, LayoutTemplate, RotateCcw, Search } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Crea e pubblica il sito del tuo hotel con pagine, media, metadati SEO, versioni e rollback. Domini e pubblicazione hanno onboarding assistito."

export const metadata = buildFeatureMetadata({
  slug: "cms",
  title: "CMS per hotel con sito web e SEO",
  description,
  keywords: [
    "cms per hotel",
    "sito web hotel",
    "website builder hotel",
    "seo per hotel",
    "sito strutture ricettive",
    "gestione sito albergo",
  ],
})

const capabilities = [
  {
    icon: LayoutTemplate,
    title: "Template e pagine",
    description:
      "Imposta struttura, navigazione e sezioni del sito partendo da template dedicati all'ospitalità.",
  },
  {
    icon: Images,
    title: "Libreria media",
    description:
      "Carica e organizza immagini della struttura in una libreria separata per tenant e riutilizzabile nelle pagine.",
  },
  {
    icon: Search,
    title: "Metadati SEO per pagina",
    description:
      "Titoli, descrizioni, URL e navigazione vengono salvati nel documento pubblicato e resi dal sito pubblico.",
  },
  {
    icon: FileClock,
    title: "Pubblicazioni versionate",
    description:
      "Ogni pubblicazione crea una versione immutabile: la bozza resta separata dal contenuto visibile agli ospiti.",
  },
  {
    icon: RotateCcw,
    title: "Rollback controllato",
    description:
      "Una versione precedente può essere ripristinata creando una nuova pubblicazione tracciata, senza modifiche silenziose.",
  },
  {
    icon: Globe2,
    title: "Sottodominio o dominio proprio",
    description:
      "Il pannello gestisce disponibilità, verifica DNS e stato HTTPS prima di mostrare il sito come pronto.",
  },
]

const faqs = [
  {
    question: "Il CMS pubblica automaticamente ogni modifica?",
    answer:
      "No. La bozza viene validata e pubblicata solo con un'azione esplicita. Il sito pubblico usa una versione attiva separata e tracciata.",
  },
  {
    question: "Posso usare il dominio del mio hotel?",
    answer:
      "Sì, dopo la configurazione e la verifica dei record DNS richiesti. Il link pubblico viene indicato come pronto solo quando dominio, SSL e routing risultano validi.",
  },
  {
    question: "È già un servizio self-service per qualsiasi struttura?",
    answer:
      "Non ancora. Il codice di pubblicazione e rollback è presente, ma il collaudo end-to-end e il provisioning del dominio vengono completati con onboarding assistito.",
  },
  {
    question: "Il CMS include funzioni SEO?",
    answer:
      "Gestisce metadati e URL delle pagine pubblicate. Il posizionamento organico dipende poi da contenuti, autorevolezza, performance e concorrenza: non viene promesso un aumento percentuale prestabilito.",
  },
]

export default function CmsLandingPage() {
  return (
    <FeatureLandingPage
      slug="cms"
      eyebrow="CMS per hotel"
      icon={Globe2}
      title="Crea e pubblica il sito del tuo hotel con controllo delle versioni"
      intro="HotelAccelerator separa bozza e sito pubblico, valida il documento prima della pubblicazione e conserva lo storico per poter tornare a una versione precedente."
      statusLabel="Pubblicazione e rollback presenti nel codice"
      statusDescription="L'attivazione su una struttura richiede ancora collaudo guidato del sito pubblico, del dominio e della configurazione infrastrutturale."
      capabilitiesTitle="Un CMS alberghiero costruito per pubblicare in sicurezza"
      capabilitiesIntro="Le funzioni descritte qui corrispondono ai flussi presenti nel repository, senza promettere risultati SEO automatici o generazione AI non verificata."
      capabilities={capabilities}
      availableNow={[
        "Bozza tenant-aware con documento JSON validato lato server.",
        "Pubblicazioni immutabili, versione attiva e rollback tracciato.",
        "Renderer pubblico unico per sottodominio e dominio personalizzato.",
        "Libreria media e metadati SEO associati alle pagine.",
      ]}
      requiresVerification={[
        "Collaudo end-to-end sul tenant e controllo responsive delle pagine pubblicate.",
        "Configurazione delle variabili Vercel, DNS, verifica dominio e SSL.",
        "Funzioni AI, comandi vocali ed editor avanzato prima di considerarli vendibili su larga scala.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/analytics",
          title: "Analytics e tracking",
          description: "Misura sessioni ed eventi dei siti configurati, nel rispetto del consenso.",
        },
        {
          href: "/features/ai-assistant",
          title: "AI assistita",
          description: "Usa contenuti verificati per proporre bozze di risposta al team.",
        },
      ]}
      ctaTitle="Valutiamo il sito e il dominio della tua struttura"
      ctaDescription="Durante la demo verifichiamo contenuti, dominio, pubblicazione e funzioni realmente attivabili per il tuo tenant."
      schemaName="CMS per hotel con sito web e pubblicazione versionata"
      schemaDescription={description}
    />
  )
}
