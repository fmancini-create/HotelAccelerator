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
  Shield,
  Users,
} from "lucide-react"

export function PlatformLanding() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-white" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">
              Funzionalità
            </Link>
            <Link href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Prezzi
            </Link>
            <Link href="#demo" className="text-sm text-gray-400 hover:text-white transition-colors">
              Demo
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                Accedi
              </Button>
            </Link>
            <Link href="/request-access">
              <Button size="sm" className="bg-white text-black hover:bg-gray-200">
                Richiedi Accesso
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-8">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Piattaforma SaaS per strutture ricettive
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-balance">
            La piattaforma completa
            <br />
            <span className="text-gray-500">per il tuo hotel</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            CMS, CRM, Email Marketing, Inbox Omnicanale e AI in un'unica soluzione. Aumenta le prenotazioni dirette e
            riduci le commissioni OTA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/request-access">
              <Button size="lg" className="bg-white text-black hover:bg-gray-200 gap-2">
                Inizia Ora
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#demo">
              <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 bg-transparent">
                Guarda la Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-y border-white/10">
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
              <div className="text-3xl md:text-4xl font-bold text-white mb-2">24/7</div>
              <div className="text-sm text-gray-500">AI Assistant</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Tutto quello che ti serve</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Una suite completa di strumenti progettati specificamente per le strutture ricettive
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* CMS */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <Globe className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">CMS</h3>
              <p className="text-gray-400 text-sm">
                Sito web professionale con SEO ottimizzato. Multilingua, mobile-first, veloce.
              </p>
            </div>

            {/* CRM */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">CRM</h3>
              <p className="text-gray-400 text-sm">
                Gestione contatti, segmentazione avanzata, tracking prenotazioni e lead scoring.
              </p>
            </div>

            {/* Email Marketing */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Email Marketing</h3>
              <p className="text-gray-400 text-sm">
                Campagne automatizzate, template professionali, analytics dettagliati.
              </p>
            </div>

            {/* Inbox */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Inbox Omnicanale</h3>
              <p className="text-gray-400 text-sm">
                Email, WhatsApp, Telegram e Chat in un'unica inbox. Mai più messaggi persi.
              </p>
            </div>

            {/* Analytics */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-cyan-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Analytics</h3>
              <p className="text-gray-400 text-sm">
                Dashboard in tempo reale, tracking eventi, insight per decisioni data-driven.
              </p>
            </div>

            {/* AI */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-pink-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Assistant</h3>
              <p className="text-gray-400 text-sm">
                Risposte automatiche intelligenti, suggerimenti, analisi intento ospiti.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 bg-white/[0.02]">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Prezzi trasparenti</h2>
            <p className="text-gray-400">Nessun costo nascosto. Scala con la tua struttura.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Starter */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm text-gray-400 mb-2">Starter</div>
              <div className="text-3xl font-bold mb-1">
                €99<span className="text-lg font-normal text-gray-500">/mese</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Fino a 20 camere</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  CMS + Sito web
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  CRM base
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  1.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  Chat widget
                </li>
              </ul>
              <Button variant="outline" className="w-full border-white/20 hover:bg-white/5 bg-transparent">
                Inizia Gratis
              </Button>
            </div>

            {/* Professional */}
            <div className="p-6 rounded-2xl bg-white border border-white/20 text-black relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                Più popolare
              </div>
              <div className="text-sm text-gray-600 mb-2">Professional</div>
              <div className="text-3xl font-bold mb-1">
                €249<span className="text-lg font-normal text-gray-500">/mese</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Fino a 50 camere</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Tutto di Starter
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Inbox omnicanale
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  10.000 email/mese
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  AI Assistant
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Dominio personalizzato
                </li>
              </ul>
              <Button className="w-full bg-black text-white hover:bg-gray-800">Inizia Ora</Button>
            </div>

            {/* Enterprise */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-sm text-gray-400 mb-2">Enterprise</div>
              <div className="text-3xl font-bold mb-1">Custom</div>
              <p className="text-sm text-gray-500 mb-6">Camere illimitate</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  Tutto di Professional
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  Multi-property
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  Email illimitate
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  API access
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  SLA dedicato
                </li>
              </ul>
              <Button variant="outline" className="w-full border-white/20 hover:bg-white/5 bg-transparent">
                Contattaci
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10">
            <Zap className="h-12 w-12 text-yellow-400 mx-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Pronto a far crescere il tuo hotel?</h2>
            <p className="text-gray-400 mb-8">
              Unisciti alle strutture che hanno già scelto HotelAccelerator per aumentare le prenotazioni dirette.
            </p>
            <Link href="/request-access">
              <Button size="lg" className="bg-white text-black hover:bg-gray-200 gap-2">
                Richiedi una Demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-500" />
              <span className="text-sm text-gray-500">HotelAccelerator</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Termini
              </Link>
              <Link href="/super-admin/login" className="hover:text-white transition-colors flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Platform
              </Link>
            </div>
            <div className="text-sm text-gray-500">© 2025 HotelAccelerator. Tutti i diritti riservati.</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
