import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Globe,
  Layers3,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import DevButtons from "@/components/dev-buttons"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const PLATFORM_URL = "https://www.hotelaccelerator.com"

const features = [
  {
    icon: Globe,
    title: "CMS per hotel",
    description: "Contenuti, media, metadati SEO, pubblicazione versionata, rollback e configurazione del dominio.",
    status: "Pubblicazione e rollback in codice",
    href: "/features/cms",
  },
  {
    icon: UsersRound,
    title: "CRM alberghiero",
    description: "Contatti, consensi, soggiorni, ricerca e collegamento controllato alle conversazioni degli ospiti.",
    status: "Anagrafiche e KPI in codice",
    href: "/features/crm",
  },
  {
    icon: Mail,
    title: "Campagne email",
    description: "Crea campagne e bozze e consulta le metriche disponibili; invio e automazioni sono in consolidamento.",
    status: "Invio da verificare",
    href: "/features/email-marketing",
  },
  {
    icon: MessageSquare,
    title: "Inbox per hotel",
    description: "Sincronizza Gmail, organizza i thread, collabora nel team e collega i mittenti al CRM.",
    status: "Gmail: Tenant reale",
    href: "/features/inbox-omnicanale",
  },
  {
    icon: BarChart3,
    title: "Analytics e tracking",
    description: "Raccoglie sessioni, sorgenti ed eventi dai siti configurati e mostra i KPI delle fonti collegate.",
    status: "Dati dalle fonti attive",
    href: "/features/analytics",
  },
  {
    icon: Sparkles,
    title: "AI con controllo umano",
    description: "Genera bozze dalla knowledge base con confidenza e fonti; l'operatore verifica e decide l'invio.",
    status: "Revisione umana",
    href: "/features/ai-assistant",
  },
]

const evidence = [
  {
    title: "Gmail",
    description: "OAuth, sincronizzazione e risposta verificati su un tenant pilota.",
  },
  {
    title: "CMS",
    description: "Documento validato, pubblicazioni versionate e rollback presenti nel codice.",
  },
  {
    title: "AI assistita",
    description: "Bozza da knowledge base con confidenza, fonti e passaggio all'operatore.",
  },
  {
    title: "CRM",
    description: "Contatti, consensi e soggiorni isolati per tenant e accessibili in base ai permessi.",
  },
]

const activationSteps = [
  {
    number: "01",
    title: "Mappiamo il contesto",
    description: "Struttura, ruoli, strumenti già usati e obiettivi determinano quali moduli hanno davvero senso.",
  },
  {
    number: "02",
    title: "Colleghiamo le fonti",
    description: "Account, domini, siti, tracker e dati vengono configurati solo con credenziali e consensi appropriati.",
  },
  {
    number: "03",
    title: "Verifichiamo i flussi",
    description: "Ogni funzione viene provata sul tenant prima di essere considerata operativa per il team.",
  },
]

const faqs = [
  {
    question: "Tutti i moduli sono già attivi per ogni hotel?",
    answer:
      "No. HotelAccelerator è modulare: visibilità e disponibilità dipendono dal tenant, dal ruolo e dalle integrazioni realmente configurate e collaudate.",
  },
  {
    question: "Quali canali dell'inbox sono verificati oggi?",
    answer:
      "Gmail è il primo canale verificato su un tenant reale. Gli altri connettori vengono presentati come disponibili solo dopo verifica di provider, permessi, webhook e flusso end-to-end.",
  },
  {
    question: "L'AI risponde autonomamente agli ospiti?",
    answer:
      "La funzione pubblicizzata genera una bozza basata sulla knowledge base e mostra fonti e confidenza. La revisione e l'invio restano sotto il controllo dell'operatore.",
  },
  {
    question: "Quanto costa HotelAccelerator?",
    answer:
      "Il perimetro economico viene definito dopo aver verificato moduli, integrazioni, struttura e livello di supporto. Il sito non pubblica piani o prezzi non ancora formalizzati.",
  },
]

async function PlatformLanding() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${PLATFORM_URL}/#website`,
        url: PLATFORM_URL,
        name: "HotelAccelerator",
        inLanguage: "it-IT",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${PLATFORM_URL}/#software`,
        name: "HotelAccelerator",
        url: PLATFORM_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Software gestionale modulare per hotel con inbox Gmail, CRM, CMS, tracking e intelligenza artificiale assistita.",
        provider: {
          "@type": "Organization",
          name: "4Bid S.r.l.",
          url: "https://www.4bid.it",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Navigazione principale">
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="#moduli" className="text-sm text-muted-foreground transition hover:text-foreground">
              Moduli
            </Link>
            <Link href="#attivazione" className="text-sm text-muted-foreground transition hover:text-foreground">
              Attivazione
            </Link>
            <Link href="#faq" className="text-sm text-muted-foreground transition hover:text-foreground">
              FAQ
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                Accedi
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/request-access">Richiedi demo</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
          <div
            className="absolute inset-0 bg-gradient-to-br from-muted/60 via-background to-ha-brand-soft/40"
            aria-hidden="true"
          />
          <div className="container relative mx-auto max-w-5xl px-4 pb-20 pt-32 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm font-medium text-ha-brand-soft-foreground">
              <Layers3 className="h-4 w-4 text-ha-brand" aria-hidden="true" />
              Software modulare per strutture ricettive
            </div>
            <h1 id="hero-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl lg:text-7xl">
              Operazioni e dati dell'hotel,
              <br />
              <span className="text-ha-brand">in moduli verificabili</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              HotelAccelerator riunisce inbox Gmail, CRM alberghiero, CMS, tracking e AI assistita. Ogni modulo viene
              attivato in base al tenant, ai permessi e alle integrazioni realmente configurate.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-14 gap-2 rounded-full px-8 text-lg font-semibold">
                <a href="https://calendar.google.com/calendar/appointments/schedules/AcZssZ1RFQzgy0TK0UScNGWRtIfT9PxQsV9UlXsMB9tszlB6d6Urt0P2oQbDSGsLt4W2PoN7a3YXfO-K" target="_blank" rel="noopener noreferrer">
                  Prenota una demo
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 text-lg font-semibold">
                <Link href="#moduli">
                  Esplora i moduli
                </Link>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-7 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-ha-brand" aria-hidden="true" />
                Attivazione guidata
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-ha-brand" aria-hidden="true" />
                Permessi per tenant e ruolo
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-ha-brand" aria-hidden="true" />
                Stato delle funzioni dichiarato
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/50 px-4 py-16" aria-labelledby="evidence-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 id="evidence-title" className="text-2xl font-bold md:text-3xl">
                Capacità descritte con il loro stato reale
              </h2>
              <p className="mt-3 text-muted-foreground">
                Il sito distingue ciò che esiste nel prodotto da ciò che richiede ancora verifica sul tenant.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {evidence.map((item) => (
                <article key={item.title} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="font-semibold text-ha-brand">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="moduli" className="px-4 py-24" aria-labelledby="modules-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-16 max-w-3xl text-center">
              <h2 id="modules-title" className="text-3xl font-bold md:text-4xl">
                Moduli operativi per il lavoro dell'hotel
              </h2>
              <p className="mt-4 text-muted-foreground">
                Ogni pagina spiega funzioni presenti, dipendenze e verifiche ancora necessarie, senza risultati
                percentuali prestabiliti.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Link
                  key={feature.href}
                  href={feature.href}
                  className="group rounded-2xl border border-border bg-card p-6 transition hover:border-ha-brand/40 hover:shadow-sm"
                >
                  <article>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ha-brand-soft">
                      <feature.icon className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
                      <span className="text-xs font-medium uppercase tracking-wide text-ha-brand">{feature.status}</span>
                      <ArrowRight
                        className="h-4 w-4 flex-none text-muted-foreground transition group-hover:translate-x-1 group-hover:text-ha-brand"
                        aria-hidden="true"
                      />
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="attivazione" className="border-y border-border bg-secondary/50 px-4 py-24" aria-labelledby="activation-title">
          <div className="container mx-auto max-w-5xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 id="activation-title" className="text-3xl font-bold md:text-4xl">
                Dalla demo al flusso verificato
              </h2>
              <p className="mt-4 text-muted-foreground">
                La demo parte dai processi della struttura e mostra solo i moduli pertinenti, con dati e integrazioni
                esplicitamente identificati.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {activationSteps.map((step) => (
                <article key={step.number} className="rounded-2xl border border-border bg-card p-6">
                  <span className="text-sm font-bold text-ha-brand">{step.number}</span>
                  <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="px-4 py-24" aria-labelledby="faq-title">
          <div className="container mx-auto max-w-3xl">
            <h2 id="faq-title" className="text-center text-3xl font-bold md:text-4xl">
              Domande frequenti su HotelAccelerator
            </h2>
            <div className="mt-10 space-y-4">
              {faqs.map((faq) => (
                <details key={faq.question} className="rounded-2xl border border-border bg-card p-5">
                  <summary className="cursor-pointer list-none pr-6 font-semibold">{faq.question}</summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24" aria-labelledby="cta-title">
          <div className="container mx-auto max-w-3xl rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/50 p-8 text-center md:p-12">
            <Sparkles className="mx-auto h-10 w-10 text-ha-brand" aria-hidden="true" />
            <h2 id="cta-title" className="mt-5 text-2xl font-bold md:text-3xl">
              Richiedi una demo basata sullo stato reale
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Indica struttura, strumenti attuali e priorità: la verifica iniziale chiarisce quali moduli sono
              pertinenti e quali integrazioni servono.
            </p>
            <Button asChild size="lg" className="mt-8 h-14 gap-2 rounded-full px-8 text-lg font-semibold">
              <a href="https://calendar.google.com/calendar/appointments/schedules/AcZssZ1RFQzgy0TK0UScNGWRtIfT9PxQsV9UlXsMB9tszlB6d6Urt0P2oQbDSGsLt4W2PoN7a3YXfO-K" target="_blank" rel="noopener noreferrer">
                Prenota una demo
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      {await DevButtons()}
      <PlatformFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  )
}

export { PlatformLanding }
export default PlatformLanding
