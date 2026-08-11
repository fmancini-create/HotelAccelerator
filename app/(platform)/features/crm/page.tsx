import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Users,
  ArrowRight,
  CheckCircle,
  UserPlus,
  Tags,
  TrendingUp,
  History,
  Mail,
  Target,
  Heart,
} from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

export const metadata: Metadata = {
  title: "CRM per Hotel - Gestione Clienti e Prenotazioni | HotelAccelerator",
  description:
    "CRM alberghiero professionale per gestire contatti, segmentare ospiti, tracciare prenotazioni e aumentare la fidelizzazione. Lead scoring automatico, storico completo, +45% retention rate.",
  keywords: [
    "crm hotel",
    "crm alberghiero",
    "gestione clienti hotel",
    "software prenotazioni hotel",
    "fidelizzazione ospiti",
    "lead scoring hotel",
    "customer relationship management hotel",
    "database clienti hotel",
  ],
  openGraph: {
    title: "CRM per Hotel - Conosci i Tuoi Ospiti | HotelAccelerator",
    description: "CRM alberghiero professionale. Gestione contatti, segmentazione, lead scoring. +45% retention rate.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/crm",
  },
}

const features = [
  {
    icon: UserPlus,
    title: "Database Centralizzato",
    description: "Tutti i contatti in un unico posto. Importa da Excel, PMS, booking engine. Deduplica automatica.",
  },
  {
    icon: Tags,
    title: "Segmentazione Avanzata",
    description: "Crea segmenti dinamici: famiglie, business, repeater, VIP. Filtra per comportamento e preferenze.",
  },
  {
    icon: TrendingUp,
    title: "Lead Scoring Automatico",
    description: "Identifica i contatti più promettenti. Score basato su engagement, storico, valore potenziale.",
  },
  {
    icon: History,
    title: "Storico Completo",
    description: "Ogni interazione registrata: email, chiamate, prenotazioni, preferenze. Timeline cronologica.",
  },
  {
    icon: Mail,
    title: "Comunicazione Integrata",
    description: "Invia email, WhatsApp, SMS direttamente dal CRM. Template personalizzati per ogni segmento.",
  },
  {
    icon: Target,
    title: "Tracking Conversioni",
    description: "Misura il ROI di ogni campagna. Attribution model per capire cosa funziona davvero.",
  },
]

const benefits = [
  { metric: "+45%", label: "Retention rate" },
  { metric: "360°", label: "Vista cliente" },
  { metric: "Auto", label: "Lead scoring" },
  { metric: "∞", label: "Contatti" },
]

export default function CRMLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator CRM",
            applicationCategory: "BusinessApplication",
            description: "CRM alberghiero per gestione clienti e prenotazioni",
            operatingSystem: "Web",
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
              <Users className="h-4 w-4" />
              CRM Alberghiero
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-balance">
              Conosci i tuoi ospiti come mai prima
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Un CRM progettato per hotel che ti permette di <strong>segmentare, personalizzare e fidelizzare</strong>.
              Aumenta la retention del 45% con comunicazioni mirate.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                  Prova il CRM
                  <ArrowRight className="h-4 w-4" />
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Il CRM che capisce l'hospitality</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Funzionalità pensate per chi gestisce hotel, B&B e strutture ricettive
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

      {/* Benefits */}
      <section className="py-24 px-4 bg-card/[0.02]">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Trasforma i dati in relazioni</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-ha-brand mt-0.5" />
                  <div>
                    <div className="font-medium">Riconosci gli ospiti di ritorno</div>
                    <div className="text-sm text-muted-foreground">Salutali per nome, conosci le loro preferenze.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-ha-brand mt-0.5" />
                  <div>
                    <div className="font-medium">Anticipa le loro esigenze</div>
                    <div className="text-sm text-muted-foreground">Camera preferita, allergie, orari di arrivo.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-ha-brand mt-0.5" />
                  <div>
                    <div className="font-medium">Comunica al momento giusto</div>
                    <div className="text-sm text-muted-foreground">Offerte personalizzate basate sul comportamento.</div>
                  </div>
                </li>
              </ul>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/50 border border-border">
              <Heart className="h-12 w-12 text-ha-brand mb-4" />
              <blockquote className="text-lg italic text-muted-foreground mb-4">
                "Da quando usiamo il CRM di HotelAccelerator, il 60% delle nostre prenotazioni viene da ospiti di
                ritorno."
              </blockquote>
              <div className="text-sm text-muted-foreground">- Hotel Belvedere, Firenze</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-ha-brand/20 to-ha-brand-soft border border-ha-brand/20">
            <Users className="h-12 w-12 text-ha-brand mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Inizia a conoscere i tuoi ospiti</h2>
            <p className="text-muted-foreground mb-8">Demo gratuita con i tuoi dati. Vedi subito il potenziale del CRM.</p>
            <Link href="/request-access">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-ha-brand px-8 text-lg font-semibold text-ha-brand-foreground hover:bg-ha-brand/90">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PlatformFooter />
    </div>
  )
}
