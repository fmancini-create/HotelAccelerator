import type { Metadata } from "next"
import { ArrowRight, Building2, CalendarCheck2, CheckCircle2, MessagesSquare } from "lucide-react"
import Link from "next/link"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const canonical = "https://www.hotelaccelerator.com/request-access"
const DEMO_URL = "https://calendar.app.google/hGkuEu5M8P8CzZkd6"
const description = "Prenota una demo di HotelAccelerator: analizziamo PMS, CRM, Inbox, WhatsApp, revenue, controllo di gestione, manutenzioni, HR e integrazioni utili alla tua struttura."

export const metadata: Metadata = {
  title: { absolute: "Prenota una demo HotelAccelerator per il tuo hotel" },
  description,
  keywords: ["demo software hotel", "software gestionale hotel", "crm hotel demo", "inbox hotel demo", "revenue management hotel demo", "software hotel all in one"],
  alternates: { canonical },
  openGraph: {
    title: "Prenota una demo HotelAccelerator",
    description,
    type: "website",
    locale: "it_IT",
    siteName: "HotelAccelerator",
    url: canonical,
  },
  twitter: { card: "summary_large_image", title: "Prenota una demo HotelAccelerator", description },
}

const preparation = [
  "Tipologia e dimensione della struttura",
  "PMS e altri gestionali già utilizzati",
  "Caselle email, WhatsApp e centralino da collegare",
  "Aree prioritarie: CRM, revenue, finanza, manutenzioni, HR o marketing",
]

const whatWeCheck = [
  { title: "Processi attuali", description: "Partiamo da come lavorano oggi reception, booking, commerciale, amministrazione e direzione." },
  { title: "Integrazioni", description: "Verifichiamo PMS, canali, centralino e provider realmente collegabili senza promettere compatibilità non provate." },
  { title: "Moduli utili", description: "Selezioniamo soltanto le aree che producono valore per la struttura, evitando una configurazione inutilmente complessa." },
]

export default function RequestAccessPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Prenota una demo HotelAccelerator",
    description,
    url: canonical,
    mainEntity: {
      "@type": "Organization",
      name: "4Bid S.r.l.",
      url: "https://www.4bid.it",
    },
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4" aria-label="Navigazione principale">
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator - Home">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link href="/features">Funzionalità</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href="/admin">Accedi</Link></Button>
          </div>
        </nav>
      </header>

      <main className="flex-1 px-4 pb-24 pt-32">
        <div className="container mx-auto max-w-6xl">
          <nav className="mb-8 text-sm text-muted-foreground" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <span aria-current="page">Prenota una demo</span>
          </nav>

          <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <section aria-labelledby="demo-title">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm text-ha-brand-soft-foreground">
                <MessagesSquare className="h-4 w-4 text-ha-brand" aria-hidden="true" />
                Demo costruita sui processi del tuo hotel
              </div>
              <h1 id="demo-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl">
                Prenota una demo di HotelAccelerator
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
                Non mostriamo una sequenza standard di schermate. Partiamo dagli strumenti che usi già e dalle criticità della struttura per capire quali moduli di HotelAccelerator possono davvero ridurre passaggi manuali, aumentare controllo o migliorare la relazione con l'ospite.
              </p>

              <div className="mt-10 grid gap-5 md:grid-cols-3">
                {whatWeCheck.map((item) => (
                  <article key={item.title} className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </article>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-border bg-card p-6">
                <h2 className="text-xl font-semibold">Informazioni utili prima della demo</h2>
                <ul className="mt-5 space-y-3">
                  {preparation.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-ha-brand" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside className="sticky top-24 rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/40 p-8">
              <CalendarCheck2 className="h-10 w-10 text-ha-brand" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Scegli direttamente giorno e orario</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Apri il calendario, scegli lo slot disponibile e prenota la demo. Durante l'incontro possiamo concentrarci sulle aree più importanti per la tua struttura.
              </p>
              <Button asChild size="lg" className="mt-8 h-14 w-full gap-2 rounded-full text-base font-semibold">
                <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
                  <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
                  Prenota una demo
                </a>
              </Button>
              <div className="mt-6 rounded-2xl border border-border/70 bg-background/50 p-4">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-5 w-5 flex-none text-ha-brand" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-muted-foreground">La configurazione proposta dipende da tenant, ruoli, entitlement e integrazioni realmente disponibili.</p>
                </div>
              </div>
              <Link href="/features" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                Esplora tutte le funzionalità
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </div>
      </main>

      <PlatformFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </div>
  )
}
