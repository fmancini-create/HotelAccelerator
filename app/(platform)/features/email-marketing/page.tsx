import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Mail, ArrowRight, Send, BarChart3, Clock, Sparkles, FileText, Target, Building2, Zap } from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"

export const metadata: Metadata = {
  title: "Email Marketing per Hotel - Campagne Automatizzate | HotelAccelerator",
  description:
    "Email marketing professionale per hotel. Campagne automatizzate pre e post soggiorno, template professionali, A/B testing, analytics dettagliati. 2x engagement rate. Aumenta le prenotazioni dirette.",
  keywords: [
    "email marketing hotel",
    "newsletter hotel",
    "campagne email hotel",
    "automazione email hotel",
    "marketing automation hotel",
    "template email hotel",
    "email pre soggiorno",
    "email post soggiorno",
  ],
  openGraph: {
    title: "Email Marketing per Hotel - Automatizza e Converti | HotelAccelerator",
    description: "Email marketing professionale per hotel. Campagne automatizzate, A/B testing, 2x engagement rate.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/features/email-marketing",
  },
}

const features = [
  {
    icon: Sparkles,
    title: "Automazioni Pre-Soggiorno",
    description:
      "Email di benvenuto, informazioni utili, upselling servizi. Tutto automatico basato sulla data di arrivo.",
  },
  {
    icon: Send,
    title: "Campagne Post-Soggiorno",
    description: "Richiesta recensioni, offerte per il ritorno, newsletter stagionali. Mantieni viva la relazione.",
  },
  {
    icon: FileText,
    title: "Template Professionali",
    description: "Decine di template pronti per hotel. Personalizzabili, responsive, ottimizzati per le conversioni.",
  },
  {
    icon: Target,
    title: "A/B Testing",
    description: "Testa oggetti, contenuti, orari di invio. Scopri cosa funziona meglio con il tuo pubblico.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dettagliati",
    description: "Open rate, click rate, conversioni, revenue generato. Report chiari per ogni campagna.",
  },
  {
    icon: Clock,
    title: "Invio Ottimizzato",
    description: "Machine learning per l'orario migliore di invio. Massimizza l'apertura delle email.",
  },
]

const automations = [
  { name: "Welcome Email", trigger: "Dopo prenotazione", openRate: "65%" },
  { name: "Pre-Arrival", trigger: "3 giorni prima", openRate: "72%" },
  { name: "Post-Stay", trigger: "1 giorno dopo", openRate: "45%" },
  { name: "Win-Back", trigger: "6 mesi dopo", openRate: "28%" },
]

export default function EmailMarketingLandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator Email Marketing",
            applicationCategory: "BusinessApplication",
            description: "Email marketing professionale per hotel con automazioni",
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400 mb-8">
              <Mail className="h-4 w-4" />
              Email Marketing
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-balance">
              Email che trasformano ospiti in clienti fedeli
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              Campagne automatizzate <strong>pre e post soggiorno</strong> che aumentano le prenotazioni dirette. 2x
              engagement rate rispetto alla media di settore.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/request-access">
                <Button size="lg" className="bg-amber-500 text-black hover:bg-amber-600 gap-2">
                  Inizia con l'Email Marketing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-12 border-y border-white/10">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-400 mb-1">2x</div>
              <div className="text-sm text-gray-500">Engagement rate</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-400 mb-1">65%</div>
              <div className="text-sm text-gray-500">Open rate medio</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-400 mb-1">+35%</div>
              <div className="text-sm text-gray-500">Prenotazioni dirette</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-400 mb-1">∞</div>
              <div className="text-sm text-gray-500">Automazioni</div>
            </div>
          </div>
        </div>
      </section>

      {/* Automations Table */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Automazioni che lavorano per te 24/7</h2>
            <p className="text-gray-400">Imposta una volta, converti per sempre</p>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Automazione</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-400">Trigger</th>
                  <th className="text-right p-4 text-sm font-medium text-gray-400">Open Rate</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((auto, i) => (
                  <tr key={auto.name} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                    <td className="p-4 font-medium">{auto.name}</td>
                    <td className="p-4 text-gray-400">{auto.trigger}</td>
                    <td className="p-4 text-right text-amber-400 font-semibold">{auto.openRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 bg-white/[0.02]">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Strumenti professionali per email che convertono</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <article key={feature.title} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-amber-400" />
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
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-amber-500/20 to-amber-500/5 border border-amber-500/20">
            <Zap className="h-12 w-12 text-amber-400 mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Inizia a convertire con le email</h2>
            <p className="text-gray-400 mb-8">Prova gratuita di 14 giorni. Template inclusi, setup assistito.</p>
            <Link href="/request-access">
              <Button size="lg" className="bg-amber-500 text-black hover:bg-amber-600 gap-2">
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
