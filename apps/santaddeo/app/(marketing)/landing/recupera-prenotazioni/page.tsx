import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, AlertTriangle, TrendingDown, Eye, Target, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Recupera le Prenotazioni Perse del Tuo Hotel | SANTADDEO",
  description: "Quanto stai perdendo con tariffe non ottimizzate? Scopri come SANTADDEO recupera il 15-25% di fatturato camere con il pricing dinamico.",
  alternates: { canonical: "https://www.santaddeo.com/landing/recupera-prenotazioni" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Recupera le Prenotazioni Perse del tuo Hotel | SANTADDEO",
    description: "Quanto stai perdendo con tariffe non ottimizzate? Calcolo gratuito e demo personalizzata.",
    url: "https://www.santaddeo.com/landing/recupera-prenotazioni",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stai Lasciando Soldi sul Tavolo | SANTADDEO",
    description: "Recupera il 15-25% di fatturato camere con il pricing dinamico.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function RecuperaPrenotazioniLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Recupera prenotazioni","path":"/landing/recupera-prenotazioni"}])} id="ld-breadcrumb" />
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={42} />
          </Link>
          <Link href="/request-info">
            <Button>Calcola Quanto Perdi</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* HERO - Drammatico */}
        <section className="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-orange-50 py-20 md:py-28">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Lo stai facendo anche tu, senza saperlo
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight text-gray-900 md:text-7xl text-balance">
                Stai lasciando
                <br />
                <span className="text-red-600">decine di migliaia di euro</span>
                <br />
                sul tavolo.
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-600 md:text-2xl leading-relaxed">
                Tariffe non ottimizzate, last-minute mancati, weekend sottoperformanti.
                Ogni notte che passa, <strong className="text-gray-900">il fatturato perso non torna piu.</strong>
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-gray-900 px-8 text-lg font-bold hover:bg-gray-800">
                    Scopri Quanto Stai Perdendo
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>

              <p className="mt-6 text-sm text-gray-500">
                Audit gratuito 30 minuti. Nessun impegno.
              </p>
            </div>
          </div>
        </section>

        {/* THE PROBLEM */}
        <section className="bg-gray-900 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-balance">
                3 errori che costano migliaia di euro al mese
              </h2>

              <div className="space-y-6">
                {[
                  {
                    icon: TrendingDown,
                    error: "Vendi troppo basso quando la domanda e alta",
                    desc: "Quando un evento riempie la citta, mantieni le tariffe standard. Stai regalando soldi.",
                    cost: "€800-2.500 a evento",
                  },
                  {
                    icon: Eye,
                    error: "Non vedi i segnali del mercato in tempo reale",
                    desc: "Booking aggiorna i benchmark ogni ora. Tu li controlli quando ricordi.",
                    cost: "€1.200/mese in opportunita perse",
                  },
                  {
                    icon: Target,
                    error: "Last-minute reattivo invece che strategico",
                    desc: "Sconti tardivi che svalutano la struttura. Il timing giusto cambia tutto.",
                    cost: "€500-1.500/mese in margine eroso",
                  },
                ].map((item, i) => (
                  <div key={i} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
                      <item.icon className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold">{item.error}</h3>
                      <p className="text-gray-400">{item.desc}</p>
                    </div>
                    <div className="rounded-xl bg-red-500/10 px-4 py-2 text-center md:text-right">
                      <p className="text-xs uppercase tracking-wider text-red-400">Ti costa</p>
                      <p className="font-bold text-red-300">{item.cost}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 rounded-3xl bg-gradient-to-r from-red-600 to-orange-600 p-8 text-center">
                <p className="text-2xl font-medium">Totale stimato di mancato fatturato annuo</p>
                <p className="mt-2 text-6xl font-black">€20.000 - €50.000</p>
                <p className="mt-3 text-red-100">Per una struttura di 20 camere</p>
              </div>
            </div>
          </div>
        </section>

        {/* THE SOLUTION */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
                  La soluzione
                </div>
                <h2 className="text-4xl font-bold text-gray-900 text-balance">
                  Recupera il 15-25% di fatturato.
                  <br />
                  Senza alzare un dito.
                </h2>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="rounded-3xl bg-emerald-50 p-8 border border-emerald-200">
                  <h3 className="mb-4 text-2xl font-bold text-emerald-900">Pricing Intelligence</h3>
                  <p className="mb-6 text-emerald-800 leading-relaxed">
                    Algoritmi che monitorano domanda, eventi locali, competitor e occupazione 24/7.
                    Ti suggeriscono la tariffa giusta per ogni camera, ogni notte.
                  </p>
                  <ul className="space-y-2 text-sm text-emerald-700">
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Aggiornamenti tariffari ogni ora</li>
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Riconoscimento eventi automatico</li>
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Alert in tempo reale</li>
                  </ul>
                </div>

                <div className="rounded-3xl bg-blue-50 p-8 border border-blue-200">
                  <h3 className="mb-4 text-2xl font-bold text-blue-900">AutoPilot</h3>
                  <p className="mb-6 text-blue-800 leading-relaxed">
                    Lascia che il sistema gestisca i prezzi in autonomia. Tu definisci la strategia,
                    AutoPilot esegue. Ricevi solo report e notifiche importanti.
                  </p>
                  <ul className="space-y-2 text-sm text-blue-700">
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Push automatico al PMS</li>
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Limiti di sicurezza configurabili</li>
                    <li className="flex gap-2"><ChevronRight className="h-5 w-5 shrink-0" />Risparmi 10 ore/settimana</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROOF */}
        <section className="bg-gray-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-gray-900 text-balance">
                Risultati reali, hotel reali
              </h2>

              <div className="grid gap-6 md:grid-cols-3">
                {[
                  { metric: "+€34.000", desc: "Fatturato extra in 12 mesi", source: "Hotel 4* Toscana, 35 camere" },
                  { metric: "+18%", desc: "RevPAR vs anno precedente", source: "Boutique hotel, 18 camere" },
                  { metric: "+€2.100", desc: "Per evento Pitti Immagine", source: "Hotel 3* Firenze centro" },
                ].map((item, i) => (
                  <div key={i} className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                    <p className="text-4xl font-black text-emerald-600">{item.metric}</p>
                    <p className="mt-3 font-semibold text-gray-900">{item.desc}</p>
                    <p className="mt-2 text-sm text-gray-500">{item.source}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gray-900 py-20 text-white">
          <div className="container mx-auto px-6 text-center">
            <h2 className="mb-4 text-4xl font-black md:text-5xl text-balance">
              Smetti di perdere soldi.
              <br />
              <span className="text-emerald-400">Inizia oggi.</span>
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-400">
              Audit gratuito di 30 minuti. Ti mostriamo quanto stai perdendo e come recuperarlo.
              Nessun obbligo, nessuna pressione.
            </p>
            <Link href="/request-info">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-500 px-10 text-lg font-bold hover:bg-emerald-600">
                Richiedi Audit Gratuito
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
