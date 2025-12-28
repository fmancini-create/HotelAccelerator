import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Mail,
  MessageSquare,
  BarChart3,
  Globe,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Zap,
  Users,
  Play,
  Star,
} from "lucide-react"
import type { Metadata } from "next"
import { PlatformFooter } from "@/components/platform-footer"

export const platformMetadata: Metadata = {
  title: "HotelAccelerator - Software Gestionale per Hotel e Strutture Ricettive | CRM, CMS, Email Marketing",
  description:
    "La piattaforma SaaS all-in-one per hotel: CMS per siti web, CRM per gestione clienti, Email Marketing automatizzato, Inbox Omnicanale, Analytics avanzati e AI Assistant. Aumenta le prenotazioni dirette fino al 35%.",
  keywords: [
    "software gestionale hotel",
    "crm hotel",
    "cms hotel",
    "email marketing hotel",
    "inbox omnicanale hotel",
    "software prenotazioni hotel",
    "gestionale strutture ricettive",
    "saas hotel",
    "intelligenza artificiale hotel",
    "marketing automation hotel",
    "chatbot hotel",
    "analytics hotel",
  ],
  openGraph: {
    title: "HotelAccelerator - La Piattaforma Completa per Hotel",
    description:
      "CMS, CRM, Email Marketing, Inbox Omnicanale e AI in un'unica soluzione. Aumenta le prenotazioni dirette.",
    type: "website",
    locale: "it_IT",
    siteName: "HotelAccelerator",
  },
  twitter: {
    card: "summary_large_image",
    title: "HotelAccelerator - Software Gestionale per Hotel",
    description: "La piattaforma SaaS all-in-one per strutture ricettive. CRM, CMS, Email Marketing, AI e molto altro.",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com",
  },
}

const features = [
  {
    icon: Globe,
    title: "CMS per Hotel",
    description:
      "Sito web professionale con SEO ottimizzato. Multilingua, mobile-first, veloce. Gestisci contenuti senza competenze tecniche.",
    href: "/features/cms",
    color: "emerald",
    stats: "+300% visibilità organica",
  },
  {
    icon: Users,
    title: "CRM Alberghiero",
    description:
      "Gestione contatti centralizzata, segmentazione avanzata, tracking prenotazioni e lead scoring automatico.",
    href: "/features/crm",
    color: "blue",
    stats: "+45% retention ospiti",
  },
  {
    icon: Mail,
    title: "Email Marketing",
    description:
      "Campagne automatizzate pre e post soggiorno, template professionali, A/B testing e analytics dettagliati.",
    href: "/features/email-marketing",
    color: "amber",
    stats: "2x engagement rate",
  },
  {
    icon: MessageSquare,
    title: "Inbox Omnicanale",
    description:
      "Email, WhatsApp, Telegram e Chat in un'unica inbox. Rispondi da un solo posto, mai più messaggi persi.",
    href: "/features/inbox-omnicanale",
    color: "purple",
    stats: "-50% tempo risposta",
  },
  {
    icon: BarChart3,
    title: "Analytics Avanzati",
    description: "Dashboard in tempo reale, tracking eventi, attribution model e insight per decisioni data-driven.",
    href: "/features/analytics",
    color: "cyan",
    stats: "+25% conversioni",
  },
  {
    icon: Sparkles,
    title: "AI Assistant",
    description: "Risposte automatiche intelligenti 24/7, suggerimenti personalizzati, analisi intento ospiti.",
    href: "/features/ai-assistant",
    color: "pink",
    stats: "24/7 disponibilità",
  },
]

const testimonials = [
  {
    name: "Marco Rossi",
    role: "Direttore, Hotel Belvedere",
    content:
      "Da quando usiamo HotelAccelerator, le prenotazioni dirette sono aumentate del 40%. L'inbox omnicanale ci ha cambiato la vita.",
    rating: 5,
  },
  {
    name: "Giulia Bianchi",
    role: "Revenue Manager, Resort Toscana",
    content:
      "L'AI Assistant risponde agli ospiti anche di notte. Il CRM ci permette di conoscere davvero i nostri clienti.",
    rating: 5,
  },
  {
    name: "Alessandro Conti",
    role: "Proprietario, B&B Firenze",
    content: "Finalmente un software pensato per chi gestisce un hotel. Semplice da usare ma potentissimo.",
    rating: 5,
  },
]

const colorClasses = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-400" },
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-400" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-400" },
}

function PlatformLanding() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Schema.org structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "HotelAccelerator",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Piattaforma SaaS all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI",
            offers: {
              "@type": "Offer",
              price: "99",
              priceCurrency: "EUR",
              priceValidUntil: "2025-12-31",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.9",
              ratingCount: "127",
            },
            provider: {
              "@type": "Organization",
              name: "HotelAccelerator",
              url: "https://hotelaccelerator.com",
            },
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <nav
          className="container mx-auto flex h-16 items-center justify-between px-4"
          aria-label="Navigazione principale"
        >
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator Homepage">
            <Building2 className="h-7 w-7 text-white" aria-hidden="true" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">
              Funzionalità
            </Link>
            <Link href="#testimonials" className="text-sm text-gray-400 hover:text-white transition-colors">
              Recensioni
            </Link>
            <Link href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Prezzi
            </Link>
          </div>
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

      {/* Hero Section - Semantic H1 */}
      <section className="pt-32 pb-20 px-4" aria-labelledby="hero-title">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-8">
            <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>Piattaforma SaaS per strutture ricettive</span>
          </div>
          <h1 id="hero-title" className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance">
            Il software gestionale
            <br />
            <span className="text-gray-500">completo per hotel</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            <strong>CMS, CRM, Email Marketing, Inbox Omnicanale e AI</strong> in un'unica soluzione. Aumenta le
            prenotazioni dirette fino al 35% e riduci le commissioni OTA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/request-access">
              <Button size="lg" className="bg-white text-black hover:bg-gray-200 gap-2">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 bg-transparent gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                Guarda il Video
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Signals - Stats */}
      <section className="py-16 border-y border-white/10" aria-label="Risultati dei nostri clienti">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-white mb-2">+35%</div>
              <div className="text-sm text-gray-500">Prenotazioni dirette</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-white mb-2">-50%</div>
              <div className="text-sm text-gray-500">Tempo di risposta</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-white mb-2">2x</div>
              <div className="text-sm text-gray-500">Engagement email</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-white mb-2">150+</div>
              <div className="text-sm text-gray-500">Hotel soddisfatti</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - H2 with semantic structure */}
      <section id="features" className="py-24 px-4" aria-labelledby="features-title">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 id="features-title" className="text-3xl md:text-4xl font-bold mb-4">
              Tutto quello che serve al tuo hotel
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Una suite completa di strumenti progettati specificamente per le strutture ricettive italiane
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const colors = colorClasses[feature.color as keyof typeof colorClasses]
              return (
                <Link
                  key={feature.href}
                  href={feature.href}
                  className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all hover:bg-white/[0.07]"
                >
                  <article>
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4`}>
                      <feature.icon className={`h-6 w-6 ${colors.text}`} aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-white transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">{feature.description}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${colors.text}`}>{feature.stats}</span>
                      <ArrowRight
                        className="h-4 w-4 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all"
                        aria-hidden="true"
                      />
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4 bg-white/[0.02]" aria-labelledby="testimonials-title">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 id="testimonials-title" className="text-3xl md:text-4xl font-bold mb-4">
              Cosa dicono i nostri clienti
            </h2>
            <p className="text-gray-400">Hotel e strutture che hanno già scelto HotelAccelerator</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <article key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex gap-1 mb-4" aria-label={`Valutazione: ${testimonial.rating} stelle su 5`}>
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="text-gray-300 text-sm mb-4">"{testimonial.content}"</blockquote>
                <footer>
                  <div className="font-medium text-white">{testimonial.name}</div>
                  <div className="text-sm text-gray-500">{testimonial.role}</div>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4" aria-labelledby="pricing-title">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 id="pricing-title" className="text-3xl md:text-4xl font-bold mb-4">
              Prezzi trasparenti
            </h2>
            <p className="text-gray-400">Nessun costo nascosto. Scala con la tua struttura.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Starter */}
            <article className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h3 className="text-sm text-gray-400 mb-2">Starter</h3>
              <div className="text-3xl font-bold mb-1">
                €99<span className="text-lg font-normal text-gray-500">/mese</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Fino a 20 camere</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  CMS + Sito web
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  CRM base
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  1.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Chat widget
                </li>
              </ul>
              <Button variant="outline" className="w-full border-white/20 hover:bg-white/5 bg-transparent">
                Inizia Gratis
              </Button>
            </article>

            {/* Professional */}
            <article className="p-6 rounded-2xl bg-white border border-white/20 text-black relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                Più popolare
              </div>
              <h3 className="text-sm text-gray-600 mb-2">Professional</h3>
              <div className="text-3xl font-bold mb-1">
                €249<span className="text-lg font-normal text-gray-500">/mese</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Fino a 50 camere</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  Tutto di Starter
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  Inbox omnicanale
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  10.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  AI Assistant
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  Dominio personalizzato
                </li>
              </ul>
              <Button className="w-full bg-black text-white hover:bg-gray-800">Inizia Ora</Button>
            </article>

            {/* Enterprise */}
            <article className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h3 className="text-sm text-gray-400 mb-2">Enterprise</h3>
              <div className="text-3xl font-bold mb-1">Custom</div>
              <p className="text-sm text-gray-500 mb-6">Camere illimitate</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Tutto di Professional
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Multi-property
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Email illimitate
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  API access
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  SLA dedicato
                </li>
              </ul>
              <Button variant="outline" className="w-full border-white/20 hover:bg-white/5 bg-transparent">
                Contattaci
              </Button>
            </article>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4" aria-labelledby="cta-title">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10">
            <Zap className="h-12 w-12 text-yellow-400 mx-auto mb-6" aria-hidden="true" />
            <h2 id="cta-title" className="text-2xl md:text-3xl font-bold mb-4">
              Pronto a far crescere il tuo hotel?
            </h2>
            <p className="text-gray-400 mb-8">
              Unisciti a oltre 150 strutture che hanno già scelto HotelAccelerator per aumentare le prenotazioni
              dirette.
            </p>
            <Link href="/request-access">
              <Button size="lg" className="bg-white text-black hover:bg-gray-200 gap-2">
                Richiedi una Demo Gratuita
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer with semantic HTML */}
      <PlatformFooter />
    </div>
  )
}

export { PlatformLanding }
export default PlatformLanding
