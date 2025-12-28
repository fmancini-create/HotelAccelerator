import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  BarChart3,
  ArrowRight,
  TrendingUp,
  PieChart,
  Activity,
  Target,
  Eye,
  Layers,
  Building2,
  LineChart,
} from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"

export const metadata: Metadata = {
  title: "Analytics per Hotel - Dashboard e Report in Tempo Reale | HotelAccelerator",
  description:
    "Analytics avanzati per hotel e strutture ricettive. Dashboard in tempo reale, tracking eventi, attribution model, report automatici. Decisioni data-driven per aumentare conversioni del 25%.",
  keywords: [
    "analytics hotel",
    "dashboard hotel",
    "report hotel",
    "tracking prenotazioni",
    "metriche hotel",
    "kpi hotel",
    "business intelligence hotel",
    "data analytics hospitality",
  ],
  openGraph: {
    title: "Analytics per Hotel - Decisioni Data-Driven | HotelAccelerator",
    description: "Dashboard in tempo reale, tracking eventi, attribution model. +25% conversioni.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/analytics",
  },
}

const features = [
  {
    icon: Activity,
    title: "Dashboard Real-Time",
    description: "Visualizza visitatori, conversioni, revenue in tempo reale. Metriche aggiornate al secondo.",
  },
  {
    icon: Eye,
    title: "Tracking Eventi",
    description: "Traccia ogni interazione: ricerche, click, form compilati, prenotazioni. Funnel completo.",
  },
  {
    icon: Target,
    title: "Attribution Model",
    description: "Scopri quali canali portano prenotazioni. First-touch, last-touch, multi-touch attribution.",
  },
  {
    icon: PieChart,
    title: "Segmentazione Traffico",
    description: "Analizza per sorgente, paese, device, comportamento. Conosci il tuo pubblico.",
  },
  {
    icon: LineChart,
    title: "Trend e Previsioni",
    description: "Confronta periodi, identifica trend stagionali. Forecast basato su dati storici.",
  },
  {
    icon: Layers,
    title: "Report Automatici",
    description: "Report settimanali e mensili via email. Export in PDF, Excel, Google Sheets.",
  },
]

const metrics = [
  { name: "Visitatori Unici", value: "12,847", change: "+23%" },
  { name: "Tasso di Conversione", value: "3.2%", change: "+0.8%" },
  { name: "Revenue Diretto", value: "€45,230", change: "+18%" },
  { name: "Tempo Medio Sito", value: "4:32", change: "+45s" },
]

export default function AnalyticsLandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator Analytics",
            applicationCategory: "BusinessApplication",
            description: "Analytics avanzati per hotel con dashboard in tempo reale",
            operatingSystem: "Web",
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-white" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-white text-black hover:bg-gray-200">
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
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
              <ArrowRight className="h-4 w-4 rotate-180" />
              Torna alla home
            </Link>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-sm text-cyan-400 mb-8">
              <BarChart3 className="h-4 w-4" />
              Analytics Avanzati
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-balance">
              Decisioni basate sui dati, non sull'istinto
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              Dashboard in tempo reale, <strong>tracking completo, attribution model</strong>. Scopri cosa funziona e
              aumenta le conversioni del 25%.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="bg-cyan-500 text-black hover:bg-cyan-600 gap-2">
                  Vedi gli Analytics
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Mock Dashboard */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {metrics.map((metric) => (
                <div key={metric.name} className="p-4 rounded-xl bg-white/5">
                  <div className="text-sm text-gray-400 mb-1">{metric.name}</div>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  <div className="text-sm text-cyan-400">{metric.change}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Tutti i dati che ti servono, a portata di click</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <article key={feature.title} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20">
            <TrendingUp className="h-12 w-12 text-cyan-400 mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Inizia a misurare quello che conta</h2>
            <p className="text-gray-400 mb-8">Demo con dashboard popolata con dati di esempio.</p>
            <Link href="/request-access">
              <Button size="lg" className="bg-cyan-500 text-black hover:bg-cyan-600 gap-2">
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
