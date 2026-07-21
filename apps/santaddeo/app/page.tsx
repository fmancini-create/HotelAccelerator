import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart3, TrendingUp, Zap, Clock, ArrowRight, CheckCircle, Play, CalendarCheck } from "lucide-react"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import type { Metadata } from "next"
// Audit landing 13/05/2026: componenti aggiunti per coprire i 9 punti del
// feedback. Sostituiscili / modifica i placeholder nei singoli file per
// adeguarli ai dati reali dei clienti.
import { SocialProofSection } from "@/components/marketing/social-proof-section"
import { ProductScreenshots } from "@/components/marketing/product-screenshots"
import { ComparisonTable } from "@/components/marketing/comparison-table"
import { LandingFAQ } from "@/components/marketing/landing-faq"
import { StickyCTA } from "@/components/marketing/sticky-cta"
import { TrustBadgesRow } from "@/components/marketing/trust-badges-row"

export const metadata: Metadata = {
  // SEO 06/05/2026: title <60ch e description <160ch per evitare troncamento
  // SERP. Keyword principale "Revenue Management System per Hotel" mantenuta
  // in posizione iniziale.
  title: "Revenue Management System per Hotel | SANTADDEO",
  description:
    "Revenue Management System italiano per hotel, agriturismi, B&B. Dashboard KPI gratuita, pricing dinamico, integrazione PMS. 70+ strutture in Italia.",
  alternates: { canonical: "https://www.santaddeo.com" },
  openGraph: {
    title: "SANTADDEO - Revenue Management System per Strutture Ricettive",
    description: "Il Revenue Management System italiano con pricing dinamico, dashboard KPI e integrazione PMS. Per hotel, agriturismi, campeggi, glamping e B&B.",
    url: "https://www.santaddeo.com",
    type: "website",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "SANTADDEO - Revenue Management System",
    description: "Dashboard KPI gratuita e pricing dinamico per strutture ricettive italiane.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* HERO - Clean, minimal, focused on FREE */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-emerald-50/30" />
        
        <div className="container relative mx-auto px-6 py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            {/* Promo banner - link to high-impact landing */}
            <Link href="/landing/vendita" className="group mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition-all hover:border-amber-300 hover:bg-amber-100">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Aumenta il fatturato del 20% in 30 giorni
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            {/* Free badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Gratis per sempre
            </div>

            {/* Main headline - SEO: include "Revenue Management System" */}
            <h1 className="mb-6 text-4xl font-black tracking-tight text-gray-900 md:text-6xl lg:text-7xl">
              <span className="block text-2xl md:text-3xl font-bold text-emerald-600 mb-2">Revenue Management System</span>
              I tuoi KPI.
              <br />
              <span className="text-emerald-600">I benchmark del mercato.</span>
            </h1>

            {/* Subheadline - SEO: ripeti keyword */}
            <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600 md:text-2xl leading-relaxed">
              Il <strong className="text-gray-900">Revenue Management System</strong> italiano per hotel, agriturismi, campeggi e B&B.
              Registrati gratis, collega il PMS e ottieni una dashboard con{" "}
              <strong className="text-gray-900">Occupazione, ADR, RevPAR</strong> e semafori benchmark.
            </p>

            {/* CTA */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/auth/sign-up">
                <Button size="lg" className="h-14 gap-2 rounded-full bg-gray-900 px-8 text-lg font-semibold hover:bg-gray-800">
                  Inizia gratis
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <a
                href="https://calendar.google.com/calendar/appointments/schedules/AcZssZ1RFQzgy0TK0UScNGWRtIfT9PxQsV9UlXsMB9tszlB6d6Urt0P2oQbDSGsLt4W2PoN7a3YXfO-K"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" variant="outline" className="h-14 gap-2 rounded-full border-emerald-600 px-8 text-lg font-semibold text-emerald-700 hover:bg-emerald-50">
                  <CalendarCheck className="h-5 w-5" />
                  Prenota una demo
                </Button>
              </a>
              <Link href="#demo">
                <Button size="lg" variant="ghost" className="h-14 gap-2 rounded-full px-8 text-lg text-gray-600 hover:text-gray-900">
                  <Play className="h-5 w-5" />
                  Vedi come funziona
                </Button>
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                Nessuna carta di credito
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                Setup in 2 minuti
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                70+ strutture attive
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW - Visual proof */}
      <section id="demo" className="border-y bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-5xl">
            {/* Mock dashboard preview */}
            <div className="overflow-hidden rounded-2xl border bg-white shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b bg-gray-100 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 flex-1 rounded-md bg-white px-3 py-1 text-xs text-gray-400">
                  app.santaddeo.com/dashboard
                </div>
              </div>
              
              {/* Dashboard content */}
              <div className="p-6 md:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Dashboard KPI</h3>
                    <p className="text-sm text-gray-500">Marzo 2026 vs Marzo 2025</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    Dati in tempo reale
                  </span>
                </div>
                
                {/* KPI Cards with traffic lights */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Occupazione</span>
                        <span className="flex h-3 w-3 rounded-full bg-emerald-500" title="Sopra benchmark" />
                      </div>
                      <div className="mt-1 text-2xl font-bold">78%</div>
                      <div className="text-xs text-emerald-600">+12% vs anno prec.</div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">ADR</span>
                        <span className="flex h-3 w-3 rounded-full bg-emerald-500" title="Sopra benchmark" />
                      </div>
                      <div className="mt-1 text-2xl font-bold">142</div>
                      <div className="text-xs text-emerald-600">+8% vs anno prec.</div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-l-4 border-l-yellow-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">RevPAR</span>
                        <span className="flex h-3 w-3 rounded-full bg-yellow-500" title="In linea con benchmark" />
                      </div>
                      <div className="mt-1 text-2xl font-bold">110</div>
                      <div className="text-xs text-yellow-600">+5% vs anno prec.</div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Cancellazioni</span>
                        <span className="flex h-3 w-3 rounded-full bg-red-500" title="Sotto benchmark" />
                      </div>
                      <div className="mt-1 text-2xl font-bold">18%</div>
                      <div className="text-xs text-red-600">+3% vs anno prec.</div>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Legend */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-6 rounded-lg bg-gray-50 p-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="text-gray-600">Sopra il benchmark di settore</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-yellow-500" />
                    <span className="text-gray-600">In linea con il benchmark</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-gray-600">Sotto il benchmark - Attenzione</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF - Logo strutture + testimonial (audit punto 1).
          I dati sono placeholder strutturali da sostituire con clienti reali. */}
      <SocialProofSection />

      {/* PRODUCT SCREENSHOTS - 3 mock UI annotati: pricing, guard, autopilot
          (audit punto 3). Tutto costruito con Card/Tailwind, zero immagini. */}
      <ProductScreenshots />

      {/* WHAT YOU GET - FREE features */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">
              Cosa ottieni gratis
            </h2>
            <p className="mb-12 text-xl text-gray-600">
              Una dashboard completa per monitorare le performance della tua struttura e confrontarle con i benchmark di mercato.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <BarChart3 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Dashboard KPI</h3>
              <p className="text-sm text-gray-600">
                Occupazione, ADR, RevPAR, cancellazioni in un colpo d'occhio
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <TrendingUp className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Benchmark</h3>
              <p className="text-sm text-gray-600">
                Semafori colorati per capire come performi rispetto al mercato
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <Clock className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Confronto Storico</h3>
              <p className="text-sm text-gray-600">
                Paragona con lo stesso periodo dell'anno precedente
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                <Zap className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Integrazione PMS</h3>
              <p className="text-sm text-gray-600">
                Collega il tuo gestionale in un click, dati sempre aggiornati
              </p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link href="/auth/sign-up">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-600 px-8 text-lg font-semibold hover:bg-emerald-700">
                Ottieni la dashboard gratis
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF - Stats */}
      <section className="border-y bg-gray-900 py-16 text-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            <div>
              <div className="text-4xl font-bold md:text-5xl">70+</div>
              <div className="mt-1 text-sm text-gray-400">Strutture attive</div>
            </div>
            <div>
              <div className="text-4xl font-bold md:text-5xl">24</div>
              <div className="mt-1 text-sm text-gray-400">Anni di esperienza</div>
            </div>
            <div>
              <div className="text-4xl font-bold md:text-5xl">+75%</div>
              <div className="mt-1 text-sm text-gray-400">Revenue medio</div>
            </div>
            <div>
              <div className="text-4xl font-bold md:text-5xl">24/7</div>
              <div className="mt-1 text-sm text-gray-400">Monitoraggio</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING - Free vs Paid */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">
              Inizia gratis, scala quando vuoi
            </h2>
            <p className="mb-12 text-xl text-gray-600">
              La dashboard KPI e' completamente gratuita. Attiva il pricing automatico solo se ne hai bisogno.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            {/* Free tier */}
            <Card className="relative overflow-hidden border-2 border-emerald-500">
              <div className="absolute right-0 top-0 rounded-bl-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white">
                GRATIS
              </div>
              <CardContent className="p-8">
                <h3 className="mb-2 text-2xl font-bold text-gray-900">Dashboard KPI</h3>
                <div className="mb-6">
                  <span className="text-5xl font-black text-emerald-600">0</span>
                  <span className="text-gray-500">/mese</span>
                </div>
                <p className="mb-6 text-gray-600">
                  Tutto quello che serve per monitorare le performance della tua struttura.
                </p>
                <ul className="mb-8 space-y-3">
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>Dashboard KPI completa</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>Semafori benchmark di settore</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>Confronto anno precedente</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>Integrazione PMS</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    <span>Nessun limite di tempo</span>
                  </li>
                </ul>
                <Link href="/auth/sign-up" className="block">
                  <Button className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700" size="lg">
                    Inizia gratis
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Paid tier - audit punto 4: pricing opaco. Mostriamo una fascia
                indicativa "da X EUR/mese" per dare credibilita' senza vincolare.
                TODO: sostituire 49 con il pricing reale concordato con il Sales. */}
            <Card className="border-2">
              <CardContent className="p-8">
                <h3 className="mb-2 text-2xl font-bold text-gray-900">Hotel Accelerator</h3>
                <div className="mb-2">
                  <span className="text-lg text-gray-500">Da </span>
                  <span className="text-5xl font-black text-gray-900">€49</span>
                  <span className="text-gray-500">/mese</span>
                </div>
                <p className="mb-6 text-sm text-gray-500">
                  Per strutture fino a 20 camere. Pricing dedicato per strutture più grandi.
                </p>
                <p className="mb-6 text-gray-600">
                  Lascia che il nostro algoritmo ottimizzi le tariffe automaticamente.
                </p>
                <ul className="mb-8 space-y-3">
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                    <span>Tutto del piano gratuito</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                    <span>Algoritmo pricing dinamico</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                    <span>Push automatico al PMS</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                    <span>Alert intelligenti</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-gray-400" />
                    <span>Supporto revenue manager</span>
                  </li>
                </ul>
                <Link href="/upgrade/hotel-accelerator" className="block">
                  <Button variant="outline" className="w-full rounded-full" size="lg">
                    Scopri i piani
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE - SANTADDEO vs Excel vs RMS esteri (audit punto 8).
          Aiuta l'utente a posizionare il prodotto rispetto alle alternative
          piu' comuni del mercato italiano. */}
      <ComparisonTable />

      {/* LANDING PAGES NAVIGATION - Crosslinking SEO */}
      <section className="border-t bg-white py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-3 text-center text-3xl font-bold text-gray-900">
              Trova la soluzione giusta per te
            </h2>
            <p className="mb-12 text-center text-lg text-gray-600">
              Scopri come SANTADDEO si adatta alle tue esigenze
            </p>
            {/*
              Grid 4 colonne (8 card totali = 2 righe pulite su desktop).
              Guard resta in prima posizione: USP piu' forte. Le 3 card
              nuove (Performance OTA, Recensioni, Variabili Personalizzate)
              chiudono la prima riga (insieme a +20%) e la seconda completa
              i restanti 3 (AutoPilot, Agriturismi, Recupera Prenotazioni).
            */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/*
                Guard come prima card: e' la USP piu' forte (monitoraggio OTA)
                e dove vogliamo spingere il traffico dalla home.
              */}
              <Link href="/landing/guard" className="group rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-6 hover:border-red-400 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  Stop OTA Furbe
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Le OTA ti vendono sotto-prezzo?</h3>
                <p className="text-sm text-gray-600">Guard ti dice quando Booking, Expedia &amp; co. fanno mismatch. Recupera 3-7% di RevPAR.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                  Scopri Guard <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/vendita" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Risultati Garantiti
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">+20% fatturato in 30 giorni</h3>
                <p className="text-sm text-gray-600">Sistema automatico di pricing dinamico per hotel.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                  Scopri come <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/autopilot" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Risparmia Tempo
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Pricing in automatico 24/7</h3>
                <p className="text-sm text-gray-600">Recupera 10 ore a settimana con AutoPilot.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                  Scopri AutoPilot <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              {/*
                Card "Dashboard Gratuita" (sostituisce la vecchia card
                "Agriturismi e B&B" su richiesta utente). La pagina
                /landing/agriturismi resta accessibile dal footer ma non
                e' piu' promossa dalla home.
                FIX 30/04/2026: il link punta a /landing/dashboard-gratuita
                (landing dedicata) e NON a /auth/sign-up. Coerente con le
                altre card della grid che linkano sempre a una landing.
              */}
              <Link
                href="/landing/dashboard-gratuita"
                className="group rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 hover:border-emerald-400 hover:shadow-lg transition-all"
              >
                <div className="mb-3 inline-flex rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  100% Gratis
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Dashboard KPI Gratuita</h3>
                <p className="text-sm text-gray-600">
                  Occupazione, ADR, RevPAR e benchmark di settore senza costi. Setup in 30 secondi.
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                  Inizia gratis <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/recupera-prenotazioni" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-red-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                  Audit Gratuito
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Quanto stai perdendo?</h3>
                <p className="text-sm text-gray-600">Recupera il 15-25% di fatturato camere.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                  Calcola perdite <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/performance-ota" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Analytics OTA
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Booking dice una cosa, il PMS un&apos;altra</h3>
                <p className="text-sm text-gray-600">Confronta KPI Extranet con dati reali del tuo PMS.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                  Vedi performance <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/recensioni" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-purple-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                  Reputazione AI
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">Recensioni con insight AI</h3>
                <p className="text-sm text-gray-600">Aggreghiamo Booking, Google, TripAdvisor. L&apos;AI ti dice cosa migliorare.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-purple-600 group-hover:gap-2 transition-all">
                  Scopri recensioni <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link href="/landing/variabili-personalizzate" className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all">
                <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  RMS su misura
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">L&apos;RMS che si adatta a te</h3>
                <p className="text-sm text-gray-600">9 variabili native + N custom illimitate: stagioni, eventi, occupanza, lead time. Le crei tu.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 group-hover:gap-2 transition-all">
                  Scopri variabili <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* SEO CONTENT SECTION - Rich text for search engines */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-4xl prose prose-gray">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              La piattaforma di revenue per le strutture ricettive italiane
            </h2>
            <p className="text-gray-600 mb-4">
              <strong>SANTADDEO</strong> e&apos; il <strong>Revenue Management System</strong> (RMS) sviluppato da 4 BID S.r.l.,
              azienda italiana con oltre 24 anni di esperienza nel settore hospitality. La piattaforma e&apos;
              progettata specificamente per le esigenze delle strutture ricettive italiane:
              hotel, agriturismi, campeggi, glamping, villaggi turistici, B&amp;B e resort.
            </p>
            <p className="text-gray-600 mb-4">
              A differenza degli strumenti generici di <strong>ottimizzazione tariffaria</strong>, SANTADDEO offre una
              <strong> dashboard KPI completamente gratuita</strong> che permette di monitorare Occupazione, ADR (Average Daily Rate),
              RevPAR (Revenue Per Available Room) e altri indicatori chiave. I nostri algoritmi di <strong>pricing dinamico</strong>
              analizzano domanda, stagionalita e benchmark di mercato per suggerire le tariffe ottimali.
            </p>
            <p className="text-gray-600 mb-4">
              La piattaforma si integra nativamente con i principali PMS (Property Management System)
              come Scidoo, Bedzzle, 5stelle, Cloudbeds e molti altri. L&apos;integrazione permette di ricevere i dati di prenotazione
              in tempo reale e, con la funzione AutoPilot, di inviare automaticamente le tariffe ottimizzate al gestionale.
            </p>
            <h3 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
              Perche&apos; scegliere SANTADDEO per ottimizzare le tue tariffe
            </h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-6">
              <li><strong>Dashboard gratuita per sempre</strong> - Nessun costo per monitorare i KPI della tua struttura</li>
              <li><strong>Pricing dinamico avanzato</strong> - Algoritmi che considerano occupazione, eventi e competitor</li>
              <li><strong>Made in Italy</strong> - Sviluppato da revenue manager italiani per il mercato italiano</li>
              <li><strong>Integrazione PMS nativa</strong> - Collegamento diretto con i principali gestionali alberghieri</li>
              <li><strong>Supporto in italiano</strong> - Assistenza tecnica e consulenza revenue management</li>
              <li><strong>70+ strutture attive</strong> - Utilizzato da hotel e agriturismi in Toscana e Centro Italia</li>
            </ul>
            <p className="text-gray-600">
              Che tu gestisca un piccolo B&amp;B o un grande resort, lo <strong>strumento di pricing dinamico</strong>
              si adatta alle tue esigenze. Inizia gratis oggi stesso e scopri come ottimizzare le tariffe della tua struttura ricettiva.
            </p>
          </div>
        </div>
      </section>

      {/* SEO CONTENT HUB - Guide e contenuti informazionali.
          Sezione additiva (richiesta utente): linka l'articolo pillar
          /blog/software-revenue-management-hotel-italia + 5 articoli che
          coprono i cluster principali del blog (RMS, Pricing, OTA, KPI,
          Distribuzione). Anchor text SEO-friendly nei titoli H3 (no
          "clicca qui"). Riusa Card/CardContent gia' importati: zero
          componenti nuovi, zero design tokens nuovi, coerente col resto
          della home.

          SEO 13/05/2026 (punto 9 audit GSC): espanso da 3 a 6 card per
          dare a Google segnali contestuali su piu' query di cluster
          diversi e disinnescare il "rilevata ma non indicizzata" su un
          campione piu' ampio di articoli blog. Le 5 card secondarie sono
          tutte tra le 15 URL bloccate dalla GSC. */}
      <section className="border-t bg-white py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-bold text-gray-900 md:text-4xl">
                Guide sul Revenue Management
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-gray-600">
                Scopri come aumentare il fatturato del tuo hotel con strategie di pricing e strumenti avanzati.
              </p>
            </div>

            {/* Card pillar a tutta larghezza in cima */}
            <Link
              href="/blog/software-revenue-management-hotel-italia"
              className="group mb-6 block rounded-2xl"
              aria-label="Leggi la guida completa sui software di revenue management per hotel in Italia"
            >
              <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white transition-all hover:border-emerald-400 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Guida completa
                    </span>
                    <span className="text-xs text-gray-500">8 maggio 2026 · 12 min</span>
                  </div>
                  <h3 className="mb-2 text-xl font-bold leading-snug text-gray-900 md:text-2xl">
                    Software Revenue Management Hotel Italia: guida completa
                  </h3>
                  <p className="text-sm text-gray-600 md:text-base">
                    Confronto degli RMS sul mercato italiano, criteri di scelta e caso reale con KPI prima/dopo.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 transition-all group-hover:gap-2">
                    Leggi la guida <ArrowRight className="h-4 w-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>

            {/* 5 card secondarie: 1 per cluster (RMS, KPI/Pricing, Pricing,
                OTA, Distribuzione). Layout 2 col su md, 3 col su lg per
                visualizzare al meglio 5 elementi. La 5a card occupa
                automaticamente la riga sotto grazie al grid-flow. */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/blog/cose-un-rms-hotel"
                className="group block rounded-2xl"
                aria-label="Leggi cos'è un Revenue Management System per hotel"
              >
                <Card className="h-full border border-gray-200 bg-white transition-all hover:border-emerald-300 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        RMS
                      </span>
                      <span className="text-xs text-gray-500">2 maggio 2026 · 7 min</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                      Cos&apos;e&apos; un RMS hotel
                    </h3>
                    <p className="text-sm text-gray-600">
                      Definizione, KPI principali e perche un RMS conviene anche alle strutture piccole.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 transition-all group-hover:gap-2">
                      Approfondisci <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/blog/come-aumentare-adr-hotel"
                className="group block rounded-2xl"
                aria-label="Leggi come aumentare l'ADR del tuo hotel"
              >
                <Card className="h-full border border-gray-200 bg-white transition-all hover:border-blue-300 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        KPI
                      </span>
                      <span className="text-xs text-gray-500">28 aprile 2026 · 9 min</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                      Come aumentare ADR hotel
                    </h3>
                    <p className="text-sm text-gray-600">
                      Tecniche concrete per alzare la tariffa media giornaliera senza perdere occupazione.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-all group-hover:gap-2">
                      Scopri le tecniche <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/blog/pricing-dinamico-hotel"
                className="group block rounded-2xl"
                aria-label="Leggi come funziona il pricing dinamico negli hotel"
              >
                <Card className="h-full border border-gray-200 bg-white transition-all hover:border-amber-300 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        Pricing
                      </span>
                      <span className="text-xs text-gray-500">25 aprile 2026 · 10 min</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                      Pricing dinamico hotel: come funziona
                    </h3>
                    <p className="text-sm text-gray-600">
                      Da tariffa fissa a tariffa che si adatta alla domanda: principi, esempi e ROI atteso.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-600 transition-all group-hover:gap-2">
                      Approfondisci <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/blog/come-aumentare-visibilita-booking"
                className="group block rounded-2xl"
                aria-label="Leggi come aumentare la visibilita' su Booking.com"
              >
                <Card className="h-full border border-gray-200 bg-white transition-all hover:border-sky-300 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                        OTA
                      </span>
                      <span className="text-xs text-gray-500">21 aprile 2026 · 8 min</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                      Visibilita&apos; su Booking: come aumentarla
                    </h3>
                    <p className="text-sm text-gray-600">
                      I 7 fattori del ranking Booking.com e cosa puoi fare per spingere il tuo hotel.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-600 transition-all group-hover:gap-2">
                      Leggi i 7 fattori <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>

              <Link
                href="/blog/overbooking-come-evitarlo"
                className="group block rounded-2xl"
                aria-label="Leggi come evitare l'overbooking in hotel"
              >
                <Card className="h-full border border-gray-200 bg-white transition-all hover:border-rose-300 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        Distribuzione
                      </span>
                      <span className="text-xs text-gray-500">18 aprile 2026 · 6 min</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                      Overbooking: come evitarlo
                    </h3>
                    <p className="text-sm text-gray-600">
                      Sincronizzazione canali, rate parity e regole interne per non vendere camere fantasma.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-rose-600 transition-all group-hover:gap-2">
                      Leggi le best practice <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 transition-colors hover:text-emerald-700"
              >
                Vedi tutte le guide del blog <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ - Risposte alle obiezioni piu' comuni (audit punto 9).
          Usa <details>/<summary> nativo: niente client component, SEO-friendly. */}
      <LandingFAQ />

      {/* TRUST BADGES - SSL, GDPR, backup + PMS integrati.
          Posizionato subito prima del CTA finale per disinnescare le obiezioni
          di sicurezza nel momento decisionale. */}
      <TrustBadgesRow />

      {/* FINAL CTA */}
      <section className="bg-gray-900 py-20 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-4 text-4xl font-bold md:text-5xl">
            Pronto a ottimizzare il tuo revenue?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-gray-400">
            Registrati in 30 secondi e accedi subito al Revenue Management System gratuito con dashboard KPI e benchmark di settore.
          </p>

          {/* Reassurance pills - audit feedback "garanzia/rischio zero".
              Mostriamo 4 promesse concrete sopra il bottone CTA per ridurre
              l'attrito decisionale all'ultimo step. */}
          <div className="mx-auto mb-8 flex max-w-3xl flex-wrap items-center justify-center gap-2 md:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-100 ring-1 ring-white/20 md:text-sm">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              Nessuna carta di credito
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-100 ring-1 ring-white/20 md:text-sm">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              Annulla quando vuoi
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-100 ring-1 ring-white/20 md:text-sm">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              Setup in 30 secondi
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-gray-100 ring-1 ring-white/20 md:text-sm">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              GDPR compliant
            </span>
          </div>

          <Link href="/auth/sign-up">
            <Button
              size="lg"
              className="h-16 gap-2 rounded-full bg-emerald-500 px-10 text-xl font-bold text-white shadow-xl shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/30"
            >
              Inizia gratis ora
              <ArrowRight className="h-6 w-6" />
            </Button>
          </Link>
          <p className="mt-6 text-sm text-gray-500">
            Dashboard KPI gratuita per sempre · Già usato da oltre 70 strutture italiane
          </p>
        </div>
      </section>

      <Footer />

      {/* Sticky CTA - appare dopo il primo fold, dismissable per sessione.
          (audit punto 2: CTA debole / mancante dopo le sezioni). */}
      <StickyCTA />
    </div>
  )
}
