import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  Globe,
  Hotel,
  Layers3,
  MessageCircle,
  MessageSquare,
  MonitorCog,
  Phone,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import DevButtons from "@/components/dev-buttons"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const PLATFORM_URL = "https://www.hotelaccelerator.com"
const DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"

const features = [
  { icon: MessageSquare, title: "Inbox omnicanale", description: "Email, WhatsApp e canali collegati in un workspace con CRM, assegnazioni e collaborazione.", href: "/features/inbox-omnicanale" },
  { icon: UsersRound, title: "CRM alberghiero", description: "Ospiti, consensi, soggiorni, pipeline, workspace e attività commerciali nello stesso contesto.", href: "/features/crm" },
  { icon: MessageCircle, title: "WhatsApp per hotel", description: "WhatsApp Business collegato a Inbox, contatti e operatori, con gestione delle regole Meta.", href: "/features/whatsapp-hotel" },
  { icon: Phone, title: "Telefonia e centralino", description: "Centralini integrabili, click-to-call, journal e flussi vocali AI dove il provider lo consente.", href: "/features/telefono-hotel" },
  { icon: MonitorCog, title: "PMS integrato", description: "Vista del gestionale web, connettori API separati e apprendimento controllato delle procedure.", href: "/features/pms-hotel" },
  { icon: TrendingUp, title: "Revenue management", description: "Santaddeo per pricing, KPI, forecast e connettori PMS attivati in base alla struttura.", href: "/features/revenue-management" },
  { icon: WalletCards, title: "Controllo di gestione", description: "HotelProfitAI per costi, fatture, budget, banche e finanza nel dominio economico dedicato.", href: "/features/controllo-gestione-hotel" },
  { icon: Wrench, title: "Manutenzioni", description: "ManuBot per ticket, segnalazioni, attività tecniche, asset e team operativo.", href: "/features/manutenzioni-hotel" },
  { icon: UsersRound, title: "HR per hotel", description: "Dipendenti, reparti, turni, assenze, geofence, timbrature e documenti privati.", href: "/features/hr-hotel" },
  { icon: CalendarDays, title: "Calendario domanda", description: "Richieste di soggiorno estratte da conversazioni e telefonate, organizzate per data richiesta.", href: "/features/calendario-domanda" },
  { icon: Bot, title: "AI per hotel", description: "Knowledge base, bozze, fonti, confidenza e handoff allo staff con controllo progressivo dell'automazione.", href: "/features/ai-assistant" },
  { icon: BarChart3, title: "Analytics", description: "Sessioni, sorgenti, UTM ed eventi dei siti configurati, collegabili ai KPI degli altri moduli.", href: "/features/analytics" },
  { icon: Globe, title: "CMS e sito", description: "Pagine, media, metadati SEO, pubblicazioni versionate e strumenti per il sito della struttura.", href: "/features/cms" },
]

const pillars = [
  { title: "Relazione con l'ospite", description: "Conversazioni, contatti e attività commerciali restano collegate invece di vivere in strumenti separati." },
  { title: "Ricavi e domanda", description: "PMS, revenue, richieste e segnali digitali possono essere letti insieme mantenendo chiara la fonte di ogni dato." },
  { title: "Controllo operativo", description: "Finanza, manutenzioni, personale e attività diventano moduli coordinati ma con responsabilità tecniche distinte." },
  { title: "AI controllabile", description: "L'intelligenza artificiale assiste i flussi e aumenta autonomia solo quando dati, guardrail e qualità lo consentono." },
]

const audiences = [
  { title: "Direzione e proprietà", description: "Una vista più coerente su performance, ricavi, costi, attività e obiettivi della struttura." },
  { title: "Booking e reception", description: "Inbox, CRM, PMS e telefonia nello stesso ambiente operativo per ridurre passaggi e perdita di contesto." },
  { title: "Revenue e commerciale", description: "Pricing, domanda, pipeline, prospect e canali di acquisizione collegati ai dati realmente disponibili." },
  { title: "Amministrazione e operations", description: "Controllo di gestione, personale e manutenzioni collegabili alla suite senza confondere i domini specialistici." },
]

const activationSteps = [
  { number: "01", title: "Partiamo da come lavori oggi", description: "Mappiamo PMS, caselle, WhatsApp, centralino, processi e criticità della struttura." },
  { number: "02", title: "Attiviamo soltanto ciò che serve", description: "Moduli, ruoli ed entitlement vengono configurati in base al tenant e alle integrazioni realmente disponibili." },
  { number: "03", title: "Verifichiamo i flussi", description: "Una funzione viene considerata operativa soltanto dopo il collaudo del percorso reale e non perché esiste una schermata." },
]

const faqs = [
  { question: "HotelAccelerator è un PMS?", answer: "HotelAccelerator è una piattaforma madre che collega CRM, Inbox, PMS, revenue, controllo economico, manutenzioni, HR e automazioni. Può incorporare e integrare il PMS esistente invece di obbligare la struttura a sostituirlo." },
  { question: "Devo usare tutti i moduli?", answer: "No. Il prodotto è modulare: ogni struttura attiva soltanto le aree pertinenti in base a tenant, ruolo, entitlement e integrazioni configurate." },
  { question: "Santaddeo, HotelProfitAI e ManuBot cosa sono?", answer: "Sono prodotti specialistici e autonomi della suite 4BID: Santaddeo per revenue, HotelProfitAI per controllo economico e ManuBot per manutenzioni. HotelAccelerator coordina accesso e integrazione senza fondere i loro database." },
  { question: "Quali canali sono già collegabili all'Inbox?", answer: "Gmail e il flusso base WhatsApp hanno evidenze su tenant reale. Telegram e social hanno implementazioni nel Core a livelli diversi; Outlook, IMAP/SMTP e OTA vengono attivati solo quando esiste un connettore verificato." },
  { question: "L'AI lavora da sola?", answer: "Dipende dal flusso. Knowledge base, bozze, analisi e handoff possono assistere il team; le azioni ad alto impatto restano sotto controllo umano finché non esiste evidenza sufficiente per automatizzarle in sicurezza." },
  { question: "Come capisco se il mio PMS o centralino è compatibile?", answer: "La demo parte proprio dai provider reali della struttura. HotelAccelerator usa adapter separati e non promette compatibilità universale senza verificare API, permessi e comportamento end-to-end." },
]

async function PlatformLanding() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${PLATFORM_URL}/#website`, url: PLATFORM_URL, name: "HotelAccelerator", inLanguage: "it-IT" },
      {
        "@type": "SoftwareApplication",
        "@id": `${PLATFORM_URL}/#software`,
        name: "HotelAccelerator",
        url: PLATFORM_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: "Piattaforma gestionale modulare per hotel con CRM, Inbox omnicanale, WhatsApp, telefonia, PMS, revenue, controllo di gestione, manutenzioni, HR, analytics e AI.",
        provider: { "@type": "Organization", name: "4Bid S.r.l.", url: "https://www.4bid.it" },
        featureList: features.map((feature) => feature.title),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
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
          <div className="hidden items-center gap-7 md:flex">
            <Link href="/features" className="text-sm text-muted-foreground transition hover:text-foreground">Funzionalità</Link>
            <Link href="#per-chi" className="text-sm text-muted-foreground transition hover:text-foreground">Per chi</Link>
            <Link href="#come-funziona" className="text-sm text-muted-foreground transition hover:text-foreground">Come funziona</Link>
            <Link href="#faq" className="text-sm text-muted-foreground transition hover:text-foreground">FAQ</Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/admin">Accedi</Link></Button>
            <Button asChild size="sm"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a></Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
          <div className="absolute inset-0 bg-gradient-to-br from-muted/60 via-background to-ha-brand-soft/40" aria-hidden="true" />
          <div className="container relative mx-auto max-w-6xl px-4 pb-24 pt-32 text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm font-medium text-ha-brand-soft-foreground">
              <Layers3 className="h-4 w-4 text-ha-brand" aria-hidden="true" />
              Piattaforma gestionale modulare per hotel
            </div>
            <h1 id="hero-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl lg:text-7xl">
              CRM, Inbox, PMS, Revenue e Operations<br />
              <span className="text-ha-brand">in un unico ecosistema per l'hotel</span>
            </h1>
            <p className="mx-auto mt-6 max-w-4xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              HotelAccelerator collega relazione con l'ospite, vendite, revenue management, controllo di gestione, manutenzioni, personale, sito e intelligenza artificiale. Ogni modulo viene attivato in base alla struttura, ai ruoli e alle integrazioni realmente disponibili.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-14 gap-2 rounded-full px-8 text-lg font-semibold">
                <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo<ArrowRight className="h-5 w-5" aria-hidden="true" /></a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 text-lg font-semibold">
                <Link href="/features">Scopri tutte le funzionalità</Link>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-7 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-ha-brand" aria-hidden="true" />Moduli attivabili per tenant</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ha-brand" aria-hidden="true" />Ruoli e permessi</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-ha-brand" aria-hidden="true" />Provider tramite integrazioni dedicate</span>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/50 px-4 py-20" aria-labelledby="pillars-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 id="pillars-title" className="text-3xl font-bold md:text-4xl">Un software hotel che collega i processi, non soltanto le schermate</h2>
              <p className="mt-4 text-muted-foreground">Il Core coordina identità, tenant e lavoro trasversale; i moduli specialistici mantengono il proprio dominio e si integrano tramite contratti dedicati.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {pillars.map((item) => <article key={item.title} className="rounded-2xl border border-border bg-card p-6"><h3 className="text-lg font-semibold text-ha-brand">{item.title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p></article>)}
            </div>
          </div>
        </section>

        <section id="funzionalita" className="px-4 py-24" aria-labelledby="features-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 id="features-title" className="text-3xl font-bold md:text-4xl">Le principali funzionalità di HotelAccelerator</h2>
              <p className="mt-4 text-muted-foreground">Ogni area ha una pagina dedicata con funzioni, casi d'uso, stato e integrazioni necessarie.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Link key={feature.href} href={feature.href} className="group rounded-2xl border border-border bg-card p-6 transition hover:border-ha-brand/40 hover:shadow-sm">
                  <article>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ha-brand-soft"><feature.icon className="h-6 w-6 text-ha-brand" aria-hidden="true" /></div>
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                    <span className="mt-5 flex items-center gap-2 text-sm font-medium text-ha-brand">Approfondisci <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
                  </article>
                </Link>
              ))}
            </div>
            <div className="mt-10 text-center"><Button asChild variant="outline" size="lg" className="rounded-full px-8"><Link href="/features">Vedi la mappa completa delle funzionalità</Link></Button></div>
          </div>
        </section>

        <section id="per-chi" className="border-y border-border bg-secondary/50 px-4 py-24" aria-labelledby="audiences-title">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <Hotel className="mx-auto h-10 w-10 text-ha-brand" aria-hidden="true" />
              <h2 id="audiences-title" className="mt-5 text-3xl font-bold md:text-4xl">Una piattaforma per i diversi reparti dell'hotel</h2>
              <p className="mt-4 text-muted-foreground">Ogni utente vede soltanto le aree e i dati coerenti con il proprio ruolo e con la configurazione del tenant.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {audiences.map((item) => <article key={item.title} className="rounded-2xl border border-border bg-card p-6"><h3 className="text-xl font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p></article>)}
            </div>
          </div>
        </section>

        <section id="come-funziona" className="px-4 py-24" aria-labelledby="activation-title">
          <div className="container mx-auto max-w-5xl">
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 id="activation-title" className="text-3xl font-bold md:text-4xl">Come si attiva HotelAccelerator in una struttura</h2>
              <p className="mt-4 text-muted-foreground">La configurazione parte dagli strumenti esistenti e non richiede di sostituire tutto insieme.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {activationSteps.map((step) => <article key={step.number} className="rounded-2xl border border-border bg-card p-6"><span className="text-sm font-bold text-ha-brand">{step.number}</span><h3 className="mt-4 text-xl font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p></article>)}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/50 px-4 py-24" aria-labelledby="suite-title">
          <div className="container mx-auto max-w-5xl">
            <h2 id="suite-title" className="text-center text-3xl font-bold md:text-4xl">HotelAccelerator e la suite 4BID</h2>
            <p className="mx-auto mt-5 max-w-3xl text-center leading-relaxed text-muted-foreground">HotelAccelerator è la piattaforma madre. Santaddeo conserva il dominio revenue, HotelProfitAI quello economico-finanziario e ManuBot quello delle manutenzioni. Restano prodotti autonomi ma integrabili, così ciascuna area può evolvere senza creare dipendenze fragili.</p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <Link href="/features/revenue-management" className="rounded-2xl border border-border bg-card p-6 hover:border-ha-brand/40"><TrendingUp className="h-7 w-7 text-ha-brand" /><h3 className="mt-4 text-xl font-semibold">Santaddeo</h3><p className="mt-2 text-sm text-muted-foreground">Revenue management, pricing, PMS, forecast e demand intelligence.</p></Link>
              <Link href="/features/controllo-gestione-hotel" className="rounded-2xl border border-border bg-card p-6 hover:border-ha-brand/40"><WalletCards className="h-7 w-7 text-ha-brand" /><h3 className="mt-4 text-xl font-semibold">HotelProfitAI</h3><p className="mt-2 text-sm text-muted-foreground">Costi, fatture, budget, banche e controllo economico-finanziario.</p></Link>
              <Link href="/features/manutenzioni-hotel" className="rounded-2xl border border-border bg-card p-6 hover:border-ha-brand/40"><Wrench className="h-7 w-7 text-ha-brand" /><h3 className="mt-4 text-xl font-semibold">ManuBot</h3><p className="mt-2 text-sm text-muted-foreground">Ticket, manutenzioni, attività tecniche, asset e team operativo.</p></Link>
            </div>
          </div>
        </section>

        <section id="faq" className="px-4 py-24" aria-labelledby="faq-title">
          <div className="container mx-auto max-w-3xl">
            <h2 id="faq-title" className="text-center text-3xl font-bold md:text-4xl">Domande frequenti su HotelAccelerator</h2>
            <div className="mt-10 space-y-4">
              {faqs.map((faq) => <details key={faq.question} className="rounded-2xl border border-border bg-card p-5"><summary className="cursor-pointer list-none pr-6 font-semibold">{faq.question}</summary><p className="mt-3 leading-relaxed text-muted-foreground">{faq.answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24" aria-labelledby="cta-title">
          <div className="container mx-auto max-w-3xl rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/50 p-8 text-center md:p-12">
            <h2 id="cta-title" className="text-2xl font-bold md:text-3xl">Scopri quali moduli servono davvero al tuo hotel</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Nella demo partiamo dal PMS, dai canali e dai processi che usi oggi per costruire una configurazione concreta e comprensibile.</p>
            <Button asChild size="lg" className="mt-8 h-14 gap-2 rounded-full px-8 text-lg font-semibold"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo<ArrowRight className="h-5 w-5" aria-hidden="true" /></a></Button>
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
