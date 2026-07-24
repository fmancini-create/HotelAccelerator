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
  Star,
} from "lucide-react"
import type { Metadata } from "next"
import { PlatformFooter } from "@/components/platform-footer"
import DevButtons from "@/components/dev-buttons"

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

// Stile Santaddeo: un solo accento identitario (verde), niente icone
// SaaS multicolori casuali. Le chiavi restano per non toccare l'array features.
const brandIcon = { bg: "bg-ha-brand-soft", text: "text-ha-brand-soft-foreground" }
const colorClasses = {
  emerald: brandIcon,
  blue: brandIcon,
  amber: brandIcon,
  purple: brandIcon,
  cyan: brandIcon,
  pink: brandIcon,
}

function PlatformLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav
          className="container mx-auto flex h-16 items-center justify-between px-4"
          aria-label="Navigazione principale"
        >
          <Link href="/" className="flex items-center gap-2" aria-label="HotelAccelerator Homepage">
            <Building2 className="h-7 w-7 text-ha-brand" aria-hidden="true" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Funzionalità
            </Link>
            <Link href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Recensioni
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Prezzi
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-ha-brand text-ha-brand-foreground hover:bg-ha-brand/90">
                Richiedi Demo
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section - Semantic H1 */}
      <section className="pt-32 pb-20 px-4" aria-labelledby="hero-title">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ha-brand-soft border border-ha-brand/20 text-sm text-ha-brand-soft-foreground mb-8">
            <Sparkles className="h-4 w-4 text-ha-brand" aria-hidden="true" />
            <span>Piattaforma SaaS per strutture ricettive</span>
          </div>
          <h1 id="hero-title" className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance">
            Il software gestionale
            <br />
            <span className="text-muted-foreground">completo per hotel</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            <strong>CMS, CRM, Email Marketing, Inbox Omnicanale e AI</strong> in un'unica soluzione. Aumenta le
            prenotazioni dirette fino al 35% e riduci le commissioni OTA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/request-access">
              <Button size="lg" className="bg-ha-brand text-ha-brand-foreground hover:bg-ha-brand/90 gap-2">
                Richiedi Demo Gratuita
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
            {/* Removed video link button */}
          </div>
        </div>
      </section>

      {/* Trust Signals - Stats */}
      <section className="py-16 border-y border-border bg-secondary/50" aria-label="Risultati dei nostri clienti">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-ha-brand mb-2">+35%</div>
              <div className="text-sm text-muted-foreground">Prenotazioni dirette</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-ha-brand mb-2">-50%</div>
              <div className="text-sm text-muted-foreground">Tempo di risposta</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-ha-brand mb-2">2x</div>
              <div className="text-sm text-muted-foreground">Engagement email</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-ha-brand mb-2">150+</div>
              <div className="text-sm text-muted-foreground">Hotel soddisfatti</div>
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
            <p className="text-muted-foreground max-w-2xl mx-auto">
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
                  className="group p-6 rounded-2xl bg-card border border-border hover:border-ha-brand/40 transition-all hover:shadow-sm"
                >
                  <article>
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4`}>
                      <feature.icon className={`h-6 w-6 ${colors.text}`} aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-foreground transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-4">{feature.description}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${colors.text}`}>{feature.stats}</span>
                      <ArrowRight
                        className="h-4 w-4 text-muted-foreground group-hover:text-ha-brand group-hover:translate-x-1 transition-all"
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
      <section id="testimonials" className="py-24 px-4 bg-secondary" aria-labelledby="testimonials-title">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 id="testimonials-title" className="text-3xl md:text-4xl font-bold mb-4">
              Cosa dicono i nostri clienti
            </h2>
            <p className="text-muted-foreground">Hotel e strutture che hanno già scelto HotelAccelerator</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <article key={i} className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex gap-1 mb-4" aria-label={`Valutazione: ${testimonial.rating} stelle su 5`}>
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="text-foreground/80 text-sm mb-4">"{testimonial.content}"</blockquote>
                <footer>
                  <div className="font-medium text-foreground">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
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
            <p className="text-muted-foreground">Nessun costo nascosto. Scala con la tua struttura.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Starter */}
            <article className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="text-sm text-muted-foreground mb-2">Starter</h3>
              <div className="text-3xl font-bold mb-1">
                €99<span className="text-lg font-normal text-muted-foreground">/mese</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Fino a 20 camere</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  CMS + Sito web
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  CRM base
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  1.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Chat widget
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-transparent">
                Inizia Gratis
              </Button>
            </article>

            {/* Professional */}
            <article className="p-6 rounded-2xl bg-card border-2 border-ha-brand relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-ha-brand text-ha-brand-foreground text-xs font-medium rounded-full">
                Più popolare
              </div>
              <h3 className="text-sm text-muted-foreground mb-2">Professional</h3>
              <div className="text-3xl font-bold mb-1">
                €249<span className="text-lg font-normal text-muted-foreground">/mese</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Fino a 50 camere</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Tutto di Starter
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Inbox omnicanale
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  10.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  AI Assistant
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Dominio personalizzato
                </li>
              </ul>
              <Button className="w-full bg-ha-brand text-ha-brand-foreground hover:bg-ha-brand/90">Inizia Ora</Button>
            </article>

            {/* Enterprise */}
            <article className="p-6 rounded-2xl bg-card border border-border">
              <h3 className="text-sm text-muted-foreground mb-2">Enterprise</h3>
              <div className="text-3xl font-bold mb-1">Custom</div>
              <p className="text-sm text-muted-foreground mb-6">Camere illimitate</p>
              <ul className="space-y-3 mb-6" aria-label="Funzionalità incluse">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Tutto di Professional
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Multi-property
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  Email illimitate
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  API access
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-ha-success" aria-hidden="true" />
                  SLA dedicato
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-transparent">
                Contattaci
              </Button>
            </article>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4" aria-labelledby="cta-title">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-secondary border border-border">
            <Zap className="h-12 w-12 text-ha-brand mx-auto mb-6" aria-hidden="true" />
            <h2 id="cta-title" className="text-2xl md:text-3xl font-bold mb-4">
              Pronto a far crescere il tuo hotel?
            </h2>
            <p className="text-muted-foreground mb-8">
              Unisciti a oltre 150 strutture che hanno già scelto HotelAccelerator per aumentare le prenotazioni
              dirette.
            </p>
            <Link href="/request-access">
              <Button size="lg" className="bg-ha-brand text-ha-brand-foreground hover:bg-ha-brand/90 gap-2">
                Richiedi una Demo Gratuita
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Dev/Preview Buttons - Only visible in dev/preview */}
      <DevButtons />

      {/* Footer with semantic HTML */}
      <PlatformFooter />

      {/* Schema.org structured data (rendered last to avoid first-child
          hydration mismatch caused by React 19 hoisting <script> tags) */}
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
    </div>
  )
}

export { PlatformLanding }
export default PlatformLanding
