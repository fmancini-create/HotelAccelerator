import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Check, TrendingUp, Clock, Zap, Shield, Star, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList, buildService } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Aumenta il Fatturato Camere del 20% in 30 Giorni | SANTADDEO",
  description: "Sistema automatico di pricing dinamico per hotel, agriturismi e B&B. Algoritmi che ottimizzano le tariffe in tempo reale. Demo gratuita.",
  alternates: { canonical: "https://www.santaddeo.com/landing/vendita" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Aumenta il Fatturato del 20% in 30 Giorni | SANTADDEO",
    description: "Sistema automatico di pricing per hotel. Algoritmi che ottimizzano le tariffe. Demo gratuita.",
    url: "https://www.santaddeo.com/landing/vendita",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "+20% Fatturato in 30 Giorni | SANTADDEO",
    description: "Pricing dinamico automatico per strutture ricettive.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

const testimonials = [
  {
    quote: "In 3 mesi abbiamo aumentato il RevPAR del 18%. Il sistema suggerisce tariffe che da solo non avrei mai osato applicare, e funzionano.",
    author: "Marco B.",
    role: "Direttore, Hotel 4 stelle Toscana",
    result: "+18% RevPAR",
  },
  {
    quote: "Finalmente non passo piu ore a controllare Booking e modificare i prezzi. L'AutoPilot fa tutto in automatico e i risultati si vedono.",
    author: "Lucia T.",
    role: "Titolare, Agriturismo Chianti",
    result: "+23% Fatturato",
  },
  {
    quote: "Ero scettico sui software di revenue, ma i numeri parlano chiaro. In alta stagione abbiamo fatto +31% rispetto all'anno scorso.",
    author: "Giovanni R.",
    role: "Proprietario, B&B Firenze",
    result: "+31% in Alta Stagione",
  },
]

const stats = [
  { value: "+20%", label: "Aumento medio fatturato", sublabel: "nei primi 90 giorni" },
  { value: "70+", label: "Strutture attive", sublabel: "in Toscana e Centro Italia" },
  { value: "24", label: "Anni di esperienza", sublabel: "nel revenue management" },
  { value: "15min", label: "Setup completo", sublabel: "collegamento PMS incluso" },
]

const painPoints = [
  {
    problem: "Passi ore a controllare i competitor su Booking?",
    solution: "Il nostro algoritmo monitora il mercato 24/7 e ti suggerisce la tariffa ottimale in tempo reale.",
  },
  {
    problem: "Non sai mai se stai vendendo troppo basso o troppo alto?",
    solution: "Dashboard con semafori che ti dicono subito se sei sopra o sotto il benchmark di mercato.",
  },
  {
    problem: "I fogli Excel per il revenue sono un incubo?",
    solution: "Tutto automatico: dal PMS ai suggerimenti tariffari, con un click invii i prezzi al gestionale.",
  },
  {
    problem: "Ti manca il tempo per fare revenue management come si deve?",
    solution: "AutoPilot: imposti le regole una volta, il sistema aggiorna i prezzi automaticamente.",
  },
]

export default function LandingVenditaPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Aumenta il fatturato camere","path":"/landing/vendita"}])} id="ld-breadcrumb" />
      <JsonLd
        id="ld-service"
        data={buildService({
          name: "Santaddeo Revenue Management",
          description:
            "Sistema di revenue management per strutture ricettive italiane: pricing dinamico, dashboard KPI, integrazione PMS e channel manager per aumentare il fatturato camere fino al 20% in 30 giorni.",
          url: "/landing/vendita",
          features: [
            "Pricing dinamico automatico",
            "Dashboard KPI in tempo reale",
            "Integrazione con i principali PMS italiani",
            "Monitoraggio RevPAR e ADR",
            "Suggerimenti tariffari basati su occupazione",
          ],
        })}
      />
      <Header />
      {/* URGENCY BAR */}
      <div className="bg-emerald-600 py-2 px-4 text-center">
        <p className="text-sm font-medium text-white">
          Offerta limitata: <strong>30 giorni gratis</strong> per le prime 10 strutture che si registrano questo mese
          <Link href="/request-info" className="ml-2 underline underline-offset-2 hover:no-underline">
            Richiedi info <ChevronRight className="inline h-3 w-3" />
          </Link>
        </p>
      </div>

      {/* HEADER MINIMAL */}
      <header className="border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={42} />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Accedi
            </Link>
            <Link href="/request-info">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6">
                Richiedi Demo
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO - MASSIMO IMPATTO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            {/* Social proof micro */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              <div className="flex -space-x-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-6 w-6 rounded-full bg-emerald-200 border-2 border-white" />
                ))}
              </div>
              <span>Usato da <strong>70+ strutture</strong> in Italia</span>
            </div>

            {/* HEADLINE PRINCIPALE */}
            <h1 className="mb-6 text-4xl font-black tracking-tight text-gray-900 md:text-6xl lg:text-7xl">
              Aumenta il fatturato camere del{" "}
              <span className="relative">
                <span className="text-emerald-600">20%</span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M2 8C50 2 150 2 198 8" stroke="#059669" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>{" "}
              in 30 giorni
            </h1>

            {/* SUBHEADLINE */}
            <p className="mb-10 text-xl text-gray-600 md:text-2xl">
              Sistema automatico di pricing per hotel, agriturismi e B&B.
              <br className="hidden md:block" />
              <strong className="text-gray-900">Collega il PMS, attiva l&apos;AutoPilot, guarda crescere il RevPAR.</strong>
            </p>

            {/* CTA PRINCIPALE */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/request-info">
                <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-600 px-8 text-lg font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 transition-all">
                  Richiedi Demo Gratuita
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/features">
                <Button size="lg" variant="outline" className="h-14 rounded-full px-8 text-lg font-semibold">
                  Scopri come funziona
                </Button>
              </Link>
            </div>

            {/* TRUST SIGNALS */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4 text-emerald-600" />
                Nessuna carta richiesta
              </span>
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4 text-emerald-600" />
                Setup in 15 minuti
              </span>
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4 text-emerald-600" />
                Supporto italiano
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="border-y border-gray-200 bg-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-black text-emerald-600 md:text-4xl">{stat.value}</div>
                <div className="mt-1 font-semibold text-gray-900">{stat.label}</div>
                <div className="text-sm text-gray-500">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PAIN POINTS / AGITATE */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl mb-4">
              Ti riconosci in queste situazioni?
            </h2>
            <p className="text-lg text-gray-600">
              Se gestisci una struttura ricettiva, probabilmente hai gia vissuto questi problemi.
            </p>
          </div>
          
          <div className="mx-auto max-w-4xl grid gap-6 md:grid-cols-2">
            {painPoints.map((item, i) => (
              <div key={i} className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-full bg-red-100 p-2">
                    <Clock className="h-5 w-5 text-red-600" />
                  </div>
                  <p className="font-semibold text-gray-900">{item.problem}</p>
                </div>
                <div className="flex items-start gap-3 pl-11">
                  <ArrowRight className="h-4 w-4 text-emerald-600 mt-1 flex-shrink-0" />
                  <p className="text-gray-600">{item.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl mb-4">
              Come funziona in 3 step
            </h2>
            <p className="text-lg text-gray-600">
              Dal collegamento PMS ai primi risultati in meno di una settimana.
            </p>
          </div>

          <div className="mx-auto max-w-5xl grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                icon: Zap,
                title: "Collega il PMS",
                desc: "Connessione PMS guidata. Setup in 15 minuti, senza competenze tecniche.",
              },
              {
                step: "2",
                icon: TrendingUp,
                title: "Attiva l'algoritmo",
                desc: "Il nostro sistema analizza storico, occupazione, eventi e competitor per calcolare la tariffa ottimale ogni giorno.",
              },
              {
                step: "3",
                icon: Shield,
                title: "Guarda crescere il revenue",
                desc: "Con AutoPilot i prezzi si aggiornano automaticamente. Tu controlli dalla dashboard, il sistema lavora per te.",
              },
            ].map((item, i) => (
              <div key={i} className="relative text-center">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
                  <item.icon className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="absolute -top-2 -left-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                  {item.step}
                </div>
                <h3 className="mb-3 text-xl font-bold text-gray-900">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-bold md:text-4xl mb-4">
              Cosa dicono i nostri clienti
            </h2>
            <p className="text-lg text-gray-400">
              Risultati reali da strutture come la tua.
            </p>
          </div>

          <div className="mx-auto max-w-6xl grid gap-8 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl bg-gray-800 p-6">
                <div className="mb-4 flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="mb-6 text-gray-300 italic">&quot;{t.quote}&quot;</p>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{t.author}</div>
                    <div className="text-sm text-gray-500">{t.role}</div>
                  </div>
                  <div className="rounded-full bg-emerald-600/20 px-3 py-1 text-sm font-semibold text-emerald-400">
                    {t.result}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-emerald-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white md:text-5xl">
            Pronto a far crescere il tuo fatturato?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-emerald-100">
            Richiedi una demo gratuita e scopri quanto puoi guadagnare con SANTADDEO.
            <br />
            <strong className="text-white">Nessun impegno, nessuna carta di credito.</strong>
          </p>
          <Link href="/request-info">
            <Button size="lg" className="h-14 gap-2 rounded-full bg-white px-10 text-lg font-semibold text-emerald-700 shadow-lg hover:bg-gray-100 transition-all">
              Richiedi Demo Gratuita
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <p className="mt-6 text-sm text-emerald-200">
            Risposta entro 24 ore lavorative
          </p>
        </div>
      </section>

      {/* SEO CONTENT */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl prose prose-gray">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Software di Revenue Management per aumentare il fatturato del tuo hotel
            </h2>
            <p className="text-gray-600 mb-4">
              SANTADDEO e' il <strong>sistema di pricing dinamico</strong> che aiuta hotel, agriturismi, campeggi e B&B 
              ad aumentare il fatturato camere attraverso algoritmi di <strong>revenue management automatizzato</strong>.
              Il nostro software analizza in tempo reale occupazione, domanda, eventi locali e tariffe dei competitor 
              per suggerirti sempre il prezzo ottimale.
            </p>
            <p className="text-gray-600">
              A differenza dei consulenti tradizionali, SANTADDEO lavora 24/7: monitora il mercato, calcola le tariffe 
              e con la funzione AutoPilot le invia direttamente al tuo PMS. Il risultato medio dei nostri clienti? 
              <strong> +20% di fatturato camere nei primi 90 giorni</strong>. Provalo gratis e misura tu stesso i risultati.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
