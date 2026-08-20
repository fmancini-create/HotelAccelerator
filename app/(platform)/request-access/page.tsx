import type { Metadata } from "next"
import { ArrowRight, Building2, CheckCircle2, Mail, MessagesSquare } from "lucide-react"
import Link from "next/link"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { PlatformFooter } from "@/components/platform-footer"
import { Button } from "@/components/ui/button"

const canonical = "https://www.hotelaccelerator.com/request-access"
const description =
  "Richiedi una demo guidata di HotelAccelerator: verifichiamo struttura, strumenti attuali, moduli utili e integrazioni necessarie."

export const metadata: Metadata = {
  title: { absolute: "Richiedi una demo di HotelAccelerator" },
  description,
  keywords: ["demo software hotel", "software gestionale hotel", "crm hotel demo", "inbox hotel demo"],
  alternates: { canonical },
  openGraph: {
    title: "Richiedi una demo di HotelAccelerator",
    description,
    type: "website",
    locale: "it_IT",
    siteName: "HotelAccelerator",
    url: canonical,
  },
  twitter: {
    card: "summary_large_image",
    title: "Richiedi una demo di HotelAccelerator",
    description,
  },
}

const preparation = [
  "Nome e tipologia della struttura",
  "Numero indicativo di camere o unità",
  "PMS, caselle email e sito attualmente utilizzati",
  "Moduli prioritari e principali criticità operative",
]

export default function RequestAccessPage() {
  const subject = encodeURIComponent("Richiesta demo HotelAccelerator")
  const body = encodeURIComponent(
    "Buongiorno,\n\nvorrei richiedere una demo di HotelAccelerator.\n\nStruttura:\nNumero camere/unità:\nStrumenti attuali:\nModuli di interesse:\nEsigenza principale:\n\nGrazie,",
  )
  const contactHref = `mailto:info@4bid.it?subject=${subject}&body=${body}`
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Richiedi una demo di HotelAccelerator",
    description,
    url: canonical,
    mainEntity: {
      "@type": "Organization",
      name: "4Bid S.r.l.",
      url: "https://www.4bid.it",
      email: "info@4bid.it",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "sales",
        email: "info@4bid.it",
        availableLanguage: "Italian",
      },
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
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              Accedi
            </Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1 px-4 pb-24 pt-32">
        <div className="container mx-auto max-w-5xl">
          <nav className="mb-8 text-sm text-muted-foreground" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span aria-current="page">Richiedi demo</span>
          </nav>

          <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <section aria-labelledby="demo-title">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ha-brand/20 bg-ha-brand-soft px-4 py-2 text-sm text-ha-brand-soft-foreground">
                <MessagesSquare className="h-4 w-4 text-ha-brand" aria-hidden="true" />
                Confronto guidato sul tuo contesto
              </div>
              <h1 id="demo-title" className="text-balance text-4xl font-black tracking-tight md:text-6xl">
                Richiedi una demo di HotelAccelerator
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                La demo parte dai processi della tua struttura. Verifichiamo insieme quali moduli sono pertinenti,
                quali dati possono essere collegati e quali funzioni richiedono ancora configurazione o collaudo.
              </p>

              <div className="mt-10 rounded-2xl border border-border bg-card p-6">
                <h2 className="text-xl font-semibold">Cosa includere nel primo messaggio</h2>
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

            <aside className="rounded-3xl border border-ha-brand/20 bg-ha-brand-soft/40 p-8">
              <Building2 className="h-10 w-10 text-ha-brand" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Parla con il team 4Bid</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Il contatto verificato per la richiesta è l'indirizzo email aziendale. Il pulsante apre un messaggio
                precompilato nel tuo programma di posta.
              </p>
              <Button asChild size="lg" className="mt-8 h-14 w-full gap-2 rounded-full text-base font-semibold">
                <a href={contactHref}>
                  <Mail className="h-5 w-5" aria-hidden="true" />
                  Scrivi a info@4bid.it
                </a>
              </Button>
              <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
                Prima di inviare dati personali, consulta la nostra{" "}
                <Link href="/privacy" className="text-ha-brand hover:underline">
                  Privacy Policy
                </Link>
                . Non inserire credenziali o dati degli ospiti nella richiesta iniziale.
              </p>
              <Link href="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
                Torna alla panoramica
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
