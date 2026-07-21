import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Eye,
  BarChart3,
  Target,
  Zap,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  // SEO 06/05/2026: title 68→47ch
  title: "Performance OTA: KPI Booking vs PMS | SANTADDEO",
  description:
    "Booking ti dice una cosa, il PMS un'altra. SANTADDEO mostra dove perdi visibilita', conversione e fatturato sui canali OTA in un'unica dashboard.",
  alternates: { canonical: "https://www.santaddeo.com/landing/performance-ota" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Performance OTA: confronta Booking col tuo PMS | SANTADDEO",
    description:
      "Visite, click, conversioni Booking confrontate con prenotazioni reali del tuo PMS. Scopri dove stai perdendo soldi sulle OTA.",
    url: "https://www.santaddeo.com/landing/performance-ota",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Performance OTA in tempo reale | SANTADDEO",
    description: "Confronta i KPI dell'Extranet Booking con i dati reali del PMS.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function PerformanceOtaLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Performance OTA","path":"/landing/performance-ota"}])} id="ld-breadcrumb" />
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={42} />
          </Link>
          <Link href="/request-info">
            <Button>Richiedi Demo</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-28">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300">
                <BarChart3 className="h-4 w-4" />
                Performance OTA: cosa dice davvero Booking
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                Booking dice una cosa,
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  il tuo PMS un&apos;altra.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Visualizzazioni, click, conversioni dell&apos;Extranet
                <strong className="text-white"> confrontate con le prenotazioni reali</strong> del tuo PMS.
                Scopri dove stai bruciando margine sulle OTA.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-blue-500 px-8 text-lg font-bold text-white hover:bg-blue-600 shadow-2xl shadow-blue-500/30">
                    Richiedi Demo Gratuita
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/auth/sign-up">
                  <Button size="lg" variant="ghost" className="h-14 gap-2 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5">
                    Prova gratis
                  </Button>
                </Link>
              </div>

              <p className="mt-8 text-sm text-slate-400">
                Compatibile con Booking.com Extranet &middot; Dati PMS in tempo reale &middot; Setup in 10 minuti
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Stai guardando i numeri sbagliati?
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Senza confronto incrociato, non puoi capire <strong>dove</strong> stai perdendo prenotazioni.
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                {[
                  {
                    icon: Eye,
                    title: "10.000 visite, 8 prenotazioni",
                    text: "Sei visibile ma non converti. Problema di prezzo, foto o policy. Senza il confronto non sai quale.",
                  },
                  {
                    icon: TrendingDown,
                    title: "ADR Booking diverso dall'ADR PMS",
                    text: "Booking dice 120 EUR, il tuo PMS dice 95 EUR. Commissioni nascoste, pacchetti, last-minute? Devi saperlo.",
                  },
                  {
                    icon: AlertCircle,
                    title: "Mix canale fuori controllo",
                    text: "L'80% del fatturato passa da Booking ma paghi 17% di commissioni. Quanto del fatturato netto resta in cassa?",
                  },
                  {
                    icon: Target,
                    title: "Cancellazioni che bruciano notti",
                    text: "Booking gonfia le statistiche con prenotazioni cancellate. Il PMS ti dice quante vere notti hai venduto.",
                  },
                ].map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-4 inline-flex rounded-xl bg-red-100 p-3">
                        <Icon className="h-5 w-5 text-red-600" />
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-slate-900">{item.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SOLUTION */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                  <Zap className="h-4 w-4" />
                  La soluzione SANTADDEO
                </div>
                <h2 className="mb-4 text-4xl font-bold text-slate-900 text-balance">
                  Una dashboard, due fonti, zero dubbi.
                </h2>
                <p className="text-lg text-slate-600">
                  Inserisci i KPI dell&apos;Extranet una volta a settimana. Noi li incrociamo con il tuo PMS.
                </p>
              </div>

              {/* KPI Mock dashboard */}
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-6 md:p-8 shadow-lg">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Performance Booking.com vs PMS</h3>
                  <span className="text-xs text-slate-500">Ottobre 2026</span>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl bg-white p-5 border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Visite Extranet</div>
                    <div className="mt-1 text-3xl font-bold text-slate-900">12.430</div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                      <TrendingUp className="h-3 w-3" /> +8% vs settembre
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-5 border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Conversion Rate</div>
                    <div className="mt-1 text-3xl font-bold text-slate-900">2.1%</div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                      <TrendingDown className="h-3 w-3" /> -0.4 pt vs media settore
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-5 border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Mix canale</div>
                    <div className="mt-1 text-3xl font-bold text-slate-900">62%</div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                      Booking sul totale fatturato
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-blue-900">Insight automatico</div>
                      <p className="mt-1 text-sm text-blue-800">
                        Il tuo conversion rate e&apos; sotto la media del 16%. Suggerimento: rivedi le foto della
                        camera Doppia Comfort (visita media 4.2 secondi vs 12 secondi competitor).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Cosa monitora SANTADDEO
              </h2>

              <div className="grid gap-6 md:grid-cols-2">
                {[
                  {
                    title: "KPI Booking.com Extranet",
                    items: [
                      "Visualizzazioni pagina hotel",
                      "Click sulla scheda",
                      "Conversion rate (visite -> prenotazioni)",
                      "Posizione media sulla SERP Booking",
                      "Score qualita' contenuti",
                    ],
                  },
                  {
                    title: "Dati reali dal PMS",
                    items: [
                      "Prenotazioni effettive per canale",
                      "Notti vendute (al netto cancellazioni)",
                      "ADR e RevPAR per canale",
                      "Lead time medio per canale",
                      "Tasso di cancellazione per canale",
                    ],
                  },
                  {
                    title: "Confronti automatici",
                    items: [
                      "ADR Extranet vs ADR PMS (gap commissioni)",
                      "Notti dichiarate Booking vs notti effettive",
                      "Mix canale: % Booking, Expedia, diretto",
                      "Trend mensile e YoY",
                    ],
                  },
                  {
                    title: "Allarmi intelligenti",
                    items: [
                      "Drop visibilita' improvviso",
                      "Conversion rate sotto soglia",
                      "Cancellation rate fuori controllo",
                      "Squilibrio mix canale (rischio dipendenza)",
                    ],
                  },
                ].map((sec, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-bold text-slate-900">{sec.title}</h3>
                    <ul className="space-y-2">
                      {sec.items.map((it, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CASI D'USO */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Le 3 domande a cui rispondiamo
              </h2>

              <div className="space-y-6">
                {[
                  {
                    q: "Booking sta perdendo visibilita' o solo conversione?",
                    a: "Confronto visite Extranet vs prenotazioni PMS: se le visite calano, problema di posizionamento. Se restano alte ma le prenotazioni scendono, problema di prezzo/foto/policy.",
                  },
                  {
                    q: "Quanto del mio fatturato lordo Booking finisce davvero in cassa?",
                    a: "Calcoliamo il fatturato netto (lordo PMS - commissioni dichiarate Extranet) e il rapporto netto/lordo per ogni canale. Cosi' sai quanto guadagni davvero.",
                  },
                  {
                    q: "Sto diventando troppo dipendente da Booking?",
                    a: "Mix canale mensile e trend. Se Booking supera il 70% del fatturato sei a rischio. Ti diciamo come rimettere in equilibrio diretto + Expedia + altri.",
                  },
                ].map((item, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <h3 className="mb-2 text-lg font-bold text-slate-900">{item.q}</h3>
                    <p className="text-slate-700 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CROSS-LINK */}
        <section className="border-t bg-slate-50 py-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-3 text-center text-3xl font-bold text-slate-900">
                Scopri tutte le soluzioni SANTADDEO
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Performance OTA e&apos; solo l&apos;inizio. Ecco cosa puoi fare di piu&apos;.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Link
                  href="/landing/guard"
                  className="group rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-6 hover:border-red-400 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    Stop OTA Furbe
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Le OTA ti vendono sotto-prezzo?</h3>
                  <p className="text-sm text-slate-600">Guard intercetta i mismatch in tempo reale.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                    Scopri Guard <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/recensioni"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-purple-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                    Reputazione AI
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Le recensioni che fanno la differenza</h3>
                  <p className="text-sm text-slate-600">Insight AI da tutte le OTA in un colpo d&apos;occhio.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-purple-600 group-hover:gap-2 transition-all">
                    Vedi recensioni <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/autopilot"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Risparmia Tempo
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Pricing in automatico 24/7</h3>
                  <p className="text-sm text-slate-600">Recupera 10 ore a settimana con AutoPilot.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                    Scopri AutoPilot <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/variabili-personalizzate"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    RMS su misura
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Variabili personalizzabili</h3>
                  <p className="text-sm text-slate-600">9 variabili native + N custom illimitate. L&apos;RMS davvero su misura.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 group-hover:gap-2 transition-all">
                    Scopri tutto <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINALE */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="mb-6 text-4xl font-black md:text-5xl text-balance">
                Smetti di volare alla cieca sulle OTA.
              </h2>
              <p className="mb-10 text-xl text-slate-300 leading-relaxed">
                Capisci dove vai bene e dove perdi soldi sui canali. Decisione consapevole, non istinto.
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-blue-500 px-8 text-lg font-bold text-white hover:bg-blue-600 shadow-2xl shadow-blue-500/30">
                    Richiedi Demo
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/auth/sign-up">
                  <Button size="lg" variant="ghost" className="h-14 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5">
                    Prova gratis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
