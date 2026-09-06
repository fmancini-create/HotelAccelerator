import type { Metadata } from "next"
import Link from "next/link"
import {
  BarChart3,
  Bot,
  CalendarDays,
  ChevronRight,
  Globe,
  Hotel,
  Mail,
  MessageCircle,
  MessageSquare,
  MonitorCog,
  Phone,
  TrendingUp,
  UsersRound,
  WalletCards,
  Wrench,
} from "lucide-react"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const canonical = "https://www.hotelaccelerator.com/features"
const DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"

export const metadata: Metadata = {
  title: { absolute: "Funzionalità HotelAccelerator: CRM, Inbox, PMS, Revenue e AI" },
  description:
    "Scopri tutte le funzionalità di HotelAccelerator per hotel: CRM, inbox omnicanale, WhatsApp, telefonia, PMS, revenue management, controllo di gestione, manutenzioni, HR, marketing, analytics e AI.",
  keywords: [
    "software gestionale hotel",
    "software hotel all in one",
    "crm hotel",
    "inbox omnicanale hotel",
    "software revenue management hotel",
    "controllo di gestione hotel",
    "software manutenzioni hotel",
    "software hr hotel",
    "pms hotel integrazione",
    "intelligenza artificiale hotel",
  ],
  alternates: { canonical },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "HotelAccelerator",
    url: canonical,
    title: "Tutte le funzionalità di HotelAccelerator",
    description: "Una piattaforma modulare per relazione ospite, vendite, revenue, finanza, operatività, personale e automazioni.",
  },
}

const groups = [
  {
    title: "Relazione con l'ospite e vendite",
    description: "Centralizza conversazioni, contatti, opportunità e attività commerciali in un unico flusso operativo.",
    items: [
      { href: "/features/inbox-omnicanale", icon: MessageSquare, title: "Inbox omnicanale", text: "Email, WhatsApp, Telegram e canali social in una vista unificata, in base alle integrazioni attive." },
      { href: "/features/whatsapp-hotel", icon: MessageCircle, title: "WhatsApp per hotel", text: "Conversazioni WhatsApp Business collegate a contatti, operatori e storico del tenant." },
      { href: "/features/crm", icon: UsersRound, title: "CRM alberghiero", text: "Contatti, soggiorni, consensi, pipeline, workspace e attività commerciali." },
      { href: "/crm-hotel-confronto", icon: BarChart3, title: "Confronto CRM hotel", text: "Tabella comparativa tra HotelAccelerator, CRM alberghieri e generalisti per PMS, canali, AI e operations." },
      { href: "/features/telefono-hotel", icon: Phone, title: "Telefonia e centralino", text: "Integrazione con centralini, click-to-call, journal e flussi vocali assistiti dall'AI dove configurati." },
      { href: "/features/email-marketing", icon: Mail, title: "Email marketing", text: "Campagne e segmenti collegati ai dati e ai consensi presenti nel CRM." },
      { href: "/features/ai-assistant", icon: Bot, title: "AI assistita", text: "Knowledge base, bozze, classificazione e handoff verso operatori con controllo umano." },
    ],
  },
  {
    title: "Revenue, domanda e distribuzione",
    description: "Collega dati commerciali, domanda e strumenti di pricing senza imporre un unico PMS o provider.",
    items: [
      { href: "/features/revenue-management", icon: TrendingUp, title: "Revenue management", text: "Accesso al modulo Santaddeo per pricing, KPI, forecast e connettori PMS dove attivati." },
      { href: "/features/pms-hotel", icon: MonitorCog, title: "PMS integrato", text: "Vista del gestionale PMS nel flusso di lavoro e connettori API separati quando disponibili." },
      { href: "/features/calendario-domanda", icon: CalendarDays, title: "Calendario domanda", text: "Raccoglie richieste di soggiorno estratte da conversazioni e telefonate per data richiesta." },
      { href: "/features/analytics", icon: BarChart3, title: "Analytics e tracking", text: "Sessioni, sorgenti, UTM ed eventi dei siti e dei canali configurati." },
    ],
  },
  {
    title: "Controllo, operatività e personale",
    description: "Dalla redditività alle manutenzioni fino alla gestione del team, con moduli collegati ma separati per responsabilità.",
    items: [
      { href: "/features/controllo-gestione-hotel", icon: WalletCards, title: "Controllo di gestione", text: "Accesso a HotelProfitAI per costi, fatture, banche, budget e finanza quando il modulo è attivo." },
      { href: "/features/manutenzioni-hotel", icon: Wrench, title: "Manutenzioni", text: "Collegamento a ManuBot per ticket, attività tecniche, asset e segnalazioni operative." },
      { href: "/features/hr-hotel", icon: UsersRound, title: "HR per hotel", text: "Dipendenti, reparti, turni, assenze, geofence, timbrature, anomalie e documenti privati." },
      { href: "/features/cms", icon: Globe, title: "CMS e sito", text: "Pagine, contenuti, media, metadati SEO e strumenti di pubblicazione del sito." },
    ],
  },
]

const faqs = [
  {
    q: "HotelAccelerator sostituisce il PMS?",
    a: "Non necessariamente. HotelAccelerator può affiancare il PMS, incorporarne l'interfaccia web e usare connettori API quando disponibili. Il PMS resta il sistema proprietario delle funzioni che gli competono finché non viene definito diversamente.",
  },
  {
    q: "Devo attivare tutti i moduli?",
    a: "No. La piattaforma è modulare: ogni tenant vede e utilizza soltanto le aree abilitate in base a ruolo, permessi, abbonamento e integrazioni configurate.",
  },
  {
    q: "Santaddeo, HotelProfitAI e ManuBot sono inclusi nella stessa piattaforma?",
    a: "Sono prodotti autonomi della suite 4BID e possono essere collegati a HotelAccelerator tramite accesso e integrazioni dedicate. La disponibilità effettiva dipende dall'attivazione del singolo modulo.",
  },
  {
    q: "HotelAccelerator usa intelligenza artificiale?",
    a: "Sì, in diverse aree l'AI può assistere classificazione, bozze, knowledge base, analisi e automazioni. Le azioni ad alto impatto restano soggette a controllo umano finché non esiste evidenza sufficiente per automatizzarle in sicurezza.",
  },
]

export default function FeaturesPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Funzionalità HotelAccelerator",
        url: canonical,
        description: metadata.description,
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Navigazione principale">
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/admin">Accedi</Link></Button>
            <Button asChild size="sm"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a></Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="px-4 pb-20 pt-32 text-center">
          <div className="container mx-auto max-w-5xl">
            <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm text-ha-brand-soft-foreground">
              <Hotel className="h-4 w-4 text-ha-brand" aria-hidden="true" />
              Piattaforma modulare per hotel e strutture ricettive
            </div>
            <h1 className="text-balance text-4xl font-black tracking-tight md:text-6xl">
              Tutte le funzionalità di HotelAccelerator
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              HotelAccelerator collega relazione con l'ospite, CRM, vendite, revenue, PMS, controllo economico, manutenzioni, personale, marketing e intelligenza artificiale. Non è un blocco monolitico: ogni area viene attivata in base alle esigenze e alle integrazioni reali della struttura.
            </p>
          </div>
        </section>

        {groups.map((group, index) => (
          <section key={group.title} className={index % 2 === 0 ? "border-y border-border bg-secondary/40 px-4 py-24" : "px-4 py-24"}>
            <div className="container mx-auto max-w-6xl">
              <div className="mb-12 max-w-3xl">
                <h2 className="text-3xl font-bold md:text-4xl">{group.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{group.description}</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <Link key={item.href} href={item.href} className="group rounded-2xl border border-border bg-card p-6 transition hover:border-ha-brand/40 hover:shadow-sm">
                    <article>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ha-brand-soft">
                        <item.icon className="h-6 w-6 text-ha-brand" aria-hidden="true" />
                      </div>
                      <h3 className="flex items-center justify-between gap-3 text-xl font-semibold">
                        {item.title}
                        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground transition group-hover:translate-x-1 group-hover:text-ha-brand" aria-hidden="true" />
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="px-4 py-24">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-bold md:text-4xl">Un unico accesso, moduli specializzati</h2>
            <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-relaxed text-muted-foreground">
              L'obiettivo di HotelAccelerator è ridurre la dispersione tra strumenti senza fingere che un solo software debba possedere ogni processo. Il Core gestisce identità, tenant, permessi e superfici trasversali; i moduli specialistici conservano il proprio dominio e si collegano tramite contratti e integrazioni dedicate.
            </p>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-xl font-semibold">Per la direzione</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Dashboard, obiettivi, dati commerciali, revenue, controllo economico e stato operativo diventano consultabili da un ecosistema coerente.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-xl font-semibold">Per il team operativo</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Conversazioni, contatti, attività, chiamate, turni e segnalazioni possono essere collegate al contesto dell'ospite e del tenant.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/40 px-4 py-24">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold md:text-4xl">Domande frequenti</h2>
            <div className="mt-10 space-y-4">
              {faqs.map((item) => (
                <details key={item.q} className="rounded-2xl border border-border bg-card p-5">
                  <summary className="cursor-pointer font-semibold">{item.q}</summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24">
          <div className="container mx-auto max-w-3xl rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/50 p-8 text-center md:p-12">
            <h2 className="text-2xl font-bold md:text-3xl">Vuoi capire quali moduli servono davvero al tuo hotel?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Nella demo partiamo dai processi attuali, dal PMS e dai canali già utilizzati per costruire una configurazione comprensibile e concreta.</p>
            <Button asChild size="lg" className="mt-8 rounded-full px-8"><a href={DEMO_URL} target="_blank" rel="noopener noreferrer">Prenota una demo</a></Button>
          </div>
        </section>
      </main>

      <PlatformFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  )
}
