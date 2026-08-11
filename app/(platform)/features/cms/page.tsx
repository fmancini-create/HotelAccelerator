import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Globe, ArrowRight, Smartphone, Search, Languages, Palette, Zap, Shield } from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

export const metadata: Metadata = {
  title: "CMS per Hotel - Crea il Sito Web del Tuo Hotel | HotelAccelerator",
  description:
    "CMS professionale per hotel e strutture ricettive. Crea un sito web SEO-optimized, multilingua, mobile-first. Aumenta la visibilità organica del 300%. Nessuna competenza tecnica richiesta.",
  keywords: [
    "cms hotel",
    "sito web hotel",
    "creare sito hotel",
    "cms strutture ricettive",
    "sito web b&b",
    "website builder hotel",
    "seo hotel",
    "sito multilingua hotel",
  ],
  openGraph: {
    title: "CMS per Hotel - Crea il Sito Web Perfetto | HotelAccelerator",
    description:
      "CMS professionale per hotel. Sito web SEO-optimized, multilingua, mobile-first. +300% visibilità organica.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/cms",
  },
}

const features = [
  {
    icon: Search,
    title: "SEO Ottimizzato",
    description:
      "Meta tag, sitemap automatica, schema markup, URL SEO-friendly. Tutto configurato per posizionarti su Google.",
  },
  {
    icon: Languages,
    title: "Multilingua Nativo",
    description: "Gestisci contenuti in italiano, inglese, tedesco, francese. Ogni lingua con URL e SEO dedicati.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description:
      "Design responsive che si adatta perfettamente a smartphone e tablet. Il 70% delle prenotazioni arriva da mobile.",
  },
  {
    icon: Palette,
    title: "Editor Visuale",
    description: "Modifica testi, immagini e layout senza toccare codice. Preview in tempo reale delle modifiche.",
  },
  {
    icon: Zap,
    title: "Velocità Estrema",
    description:
      "Pagine ottimizzate per Core Web Vitals. Caricamento sotto i 2 secondi per un'esperienza utente perfetta.",
  },
  {
    icon: Shield,
    title: "Hosting Sicuro",
    description: "SSL gratuito, backup automatici, protezione DDoS. Il tuo sito sempre online e protetto.",
  },
]

const benefits = [
  { metric: "+300%", label: "Visibilità organica" },
  { metric: "< 2s", label: "Tempo di caricamento" },
  { metric: "100%", label: "Mobile responsive" },
  { metric: "4+", label: "Lingue supportate" },
]

export default function CMSLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator CMS",
            applicationCategory: "WebApplication",
            description: "CMS professionale per hotel e strutture ricettive con SEO ottimizzato",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "99",
              priceCurrency: "EUR",
            },
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Richiedi Demo
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowRight className="h-4 w-4 rotate-180" />
              Torna alla home
            </Link>
            <div className="mx-auto flex w-fit items-center gap-2 px-4 py-2 rounded-full bg-ha-brand-soft border border-ha-brand/20 text-sm text-ha-brand mb-8">
              <Globe className="h-4 w-4" />
              CMS per Hotel
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-balance">
              Il sito web che il tuo hotel merita
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Crea un sito professionale <strong>SEO-optimized</strong>, multilingua e mobile-first. Aumenta la
              visibilità organica del 300% senza competenze tecniche.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                  Crea il Tuo Sito
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="https://www.ibarronci.com" target="_blank">
                <Button size="lg" variant="outline" className="h-14 rounded-full border-ha-brand bg-transparent px-8 text-lg font-semibold text-ha-brand-soft-foreground hover:bg-ha-brand-soft">
                  Vedi Demo Live
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-12 border-y border-border">
            {benefits.map((benefit) => (
              <div key={benefit.label} className="text-center">
                <div className="text-3xl font-bold text-ha-brand mb-1">{benefit.metric}</div>
                <div className="text-sm text-muted-foreground">{benefit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Tutto quello che serve per un sito perfetto</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Un CMS progettato specificamente per le esigenze delle strutture ricettive
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <article key={feature.title} className="p-6 rounded-2xl bg-secondary/50 border border-border">
                <div className="w-12 h-12 rounded-xl bg-ha-brand-soft flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-ha-brand" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-24 px-4 bg-card/[0.02]">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Perfetto per ogni struttura</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <h3 className="text-xl font-semibold mb-2">Hotel</h3>
              <p className="text-muted-foreground text-sm">
                Presenta camere, servizi, offerte speciali con un design elegante e professionale.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <h3 className="text-xl font-semibold mb-2">B&B</h3>
              <p className="text-muted-foreground text-sm">
                Un sito accogliente che trasmette l'atmosfera unica della tua struttura.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border text-center">
              <h3 className="text-xl font-semibold mb-2">Resort & Spa</h3>
              <p className="text-muted-foreground text-sm">
                Gallerie immersive, presentazione servizi wellness, prenotazione esperienze.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-ha-brand/20 to-ha-brand-soft border border-ha-brand/20">
            <Globe className="h-12 w-12 text-ha-brand mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Crea il sito del tuo hotel oggi</h2>
            <p className="text-muted-foreground mb-8">Inizia con una demo gratuita. Nessuna carta di credito richiesta.</p>
            <Link href="/request-access">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <PlatformFooter />
    </div>
  )
}
