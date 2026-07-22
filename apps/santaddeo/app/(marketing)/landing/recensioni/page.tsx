import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Star,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  Brain,
  Search,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Recensioni Hotel + Insight AI da Booking e Google | SANTADDEO",
  description:
    "Aggrega recensioni da Booking, Google, TripAdvisor ed Expedia. L'AI di SANTADDEO ti dice cosa migliorare per alzare punteggio e conversion rate.",
  alternates: { canonical: "https://www.santaddeo.com/landing/recensioni" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Recensioni Hotel + Insight AI | SANTADDEO",
    description:
      "Aggreghiamo le recensioni da tutte le OTA. L'AI ti dice cosa cambiare per alzare il punteggio.",
    url: "https://www.santaddeo.com/landing/recensioni",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reputazione Hotel + AI | SANTADDEO",
    description: "Recensioni da tutte le OTA in un'unica dashboard, con suggerimenti AI.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function RecensioniLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Recensioni","path":"/landing/recensioni"}])} id="ld-breadcrumb" />
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-28">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-purple-500/10 border border-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300">
                <Sparkles className="h-4 w-4" />
                Reputazione + AI: la coppia che fattura
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                Le recensioni
                <br />
                <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  ti dicono dove perdi soldi.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Migliaia di recensioni sparse su Booking, Google, TripAdvisor.
                <strong className="text-white"> Le aggrego, l&apos;AI le legge per te</strong> e ti dice cosa
                cambiare. Punteggio piu&apos; alto = piu&apos; prenotazioni.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-purple-500 px-8 text-lg font-bold text-white hover:bg-purple-600 shadow-2xl shadow-purple-500/30">
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
                Booking &middot; Google &middot; TripAdvisor &middot; Expedia &middot; in 5 minuti
              </p>
            </div>
          </div>
        </section>

        {/* STAT - LA RECENSIONE FA LA CONVERSIONE */}
        <section className="bg-purple-50 py-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <div className="grid gap-6 md:grid-cols-3 text-center">
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="text-4xl font-black text-purple-600">+0.5</div>
                  <p className="mt-2 text-sm text-slate-700">
                    di punteggio Booking = <strong>+9% di conversion rate</strong>
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="text-4xl font-black text-purple-600">93%</div>
                  <p className="mt-2 text-sm text-slate-700">
                    degli ospiti legge <strong>almeno 5 recensioni</strong> prima di prenotare
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="text-4xl font-black text-purple-600">3x</div>
                  <p className="mt-2 text-sm text-slate-700">
                    chi risponde alle recensioni ha <strong>3x probabilita&apos;</strong> di essere
                    prenotato
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Hai 800 recensioni. Le hai lette tutte?
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Senza un sistema, ogni recensione e&apos; un dato perso. Cosa stai perdendo?
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                {[
                  {
                    icon: Search,
                    title: "Recensioni su 5 piattaforme diverse",
                    text: "Booking, Google, TripAdvisor, Expedia, Trivago: ognuna ha il suo dashboard. Confrontarle a mano e' impossibile.",
                  },
                  {
                    icon: AlertTriangle,
                    title: "Problemi ricorrenti che non vedi",
                    text: "10 ospiti su 30 lamentano la colazione, ma su Booking e' segnale debole. L'AI lo trova in 5 secondi.",
                  },
                  {
                    icon: MessageSquare,
                    title: "Recensioni senza risposta",
                    text: "Booking penalizza chi non risponde. TripAdvisor pure. Tu rispondi solo alle peggiori e perdi punti.",
                  },
                  {
                    icon: TrendingUp,
                    title: "Punteggio che scende e non sai perche'",
                    text: "Il punteggio e' sceso da 8.7 a 8.4 in 2 mesi. Cos'e' cambiato? Senza analisi non capisci.",
                  },
                ].map((item, i) => {
                  const Icon = item.icon
                  return (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
                      <div className="mb-4 inline-flex rounded-xl bg-purple-100 p-3">
                        <Icon className="h-5 w-5 text-purple-700" />
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

        {/* SOLUTION - HOW IT WORKS */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700">
                  <Brain className="h-4 w-4" />
                  Come funziona
                </div>
                <h2 className="mb-4 text-4xl font-bold text-slate-900 text-balance">
                  Aggrega, analizza, agisci.
                </h2>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                {[
                  {
                    n: "1",
                    title: "Aggreghiamo",
                    text: "Connettiamo Booking, Google, TripAdvisor, Expedia. Tutte le recensioni in una dashboard, sempre aggiornate.",
                  },
                  {
                    n: "2",
                    title: "L'AI legge",
                    text: "Analizziamo ogni testo: temi ricorrenti, sentiment, problemi sottostanti. Trovi in 5 minuti cio' che a mano richiede una settimana.",
                  },
                  {
                    n: "3",
                    title: "Tu agisci",
                    text: "Suggerimenti concreti: 'rispondi a queste 5 negative', 'la colazione e' il problema #1', 'metti in evidenza queste 3 strenghts'.",
                  },
                ].map((step, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-xl font-black text-white">
                      {step.n}
                    </div>
                    <h3 className="mb-3 text-xl font-bold text-slate-900">{step.title}</h3>
                    <p className="text-slate-700 leading-relaxed">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* AI INSIGHT EXAMPLE */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Esempio reale di insight AI
              </h2>

              <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6 md:p-8 shadow-lg">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Insight AI - 247 recensioni analizzate</div>
                    <div className="text-xs text-slate-500">Aggiornato in tempo reale</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-xs font-bold uppercase tracking-wide text-red-700">
                        Problema critico
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">
                      <strong>Colazione menzionata negativamente in 38 recensioni</strong> negli ultimi 90 giorni
                      (15% del totale). Frasi ricorrenti: &quot;poca varieta&apos;&quot;, &quot;servizio lento&quot;,
                      &quot;caffe&apos; freddo&quot;. Impatto stimato sul punteggio: -0.3.
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-700" />
                      <span className="text-xs font-bold uppercase tracking-wide text-amber-800">
                        Azione consigliata
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">
                      Hai <strong>14 recensioni a 5 stelle senza risposta</strong> da oltre 30 giorni.
                      Rispondere costa 5 minuti e migliora la posizione SERP Booking.
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Star className="h-4 w-4 text-emerald-700" />
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                        Punto di forza da promuovere
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">
                      &quot;Posizione&quot; e &quot;cortesia staff&quot; sono i temi piu&apos; lodati (89% positivo).
                      Mettili in evidenza nelle foto e nella descrizione Booking per spingere la conversione.
                    </p>
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
                Tutto cio&apos; che ti serve sulla tua reputazione
              </h2>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { title: "Aggregazione multi-OTA", text: "Booking, Google, TripAdvisor, Expedia in un'unica vista" },
                  { title: "Trend punteggio", text: "Andamento score per OTA, mensile e YoY" },
                  { title: "Analisi sentiment AI", text: "Positivo, negativo, neutrale per ogni recensione" },
                  { title: "Temi ricorrenti", text: "Cosa apprezzano e cosa lamentano gli ospiti" },
                  { title: "Confronto competitor", text: "Il tuo score vs media zona e top 3 vicini" },
                  { title: "Risposte assistite", text: "L'AI ti suggerisce risposte personalizzate per ogni recensione" },
                ].map((item, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-purple-600" />
                    <h3 className="mb-2 text-base font-bold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CROSS-LINK */}
        <section className="border-t bg-white py-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-3 text-center text-3xl font-bold text-slate-900">
                Scopri tutte le soluzioni SANTADDEO
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Reputazione e&apos; un pezzo del puzzle. Ecco gli altri.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Link
                  href="/landing/guard"
                  className="group rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-6 hover:border-red-400 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    Stop OTA Furbe
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Guard</h3>
                  <p className="text-sm text-slate-600">Monitora i mismatch prezzo OTA in tempo reale.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                    Scopri Guard <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/performance-ota"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Analytics OTA
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Performance OTA</h3>
                  <p className="text-sm text-slate-600">Booking dice una cosa, il PMS un&apos;altra.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Vedi performance <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/autopilot"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Pricing 24/7
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">AutoPilot</h3>
                  <p className="text-sm text-slate-600">Aggiorna i prezzi in automatico.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                    Scopri AutoPilot <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/variabili-personalizzate"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    RMS Custom
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Variabili personalizzate</h3>
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
                Trasforma 800 recensioni in 5 azioni concrete.
              </h2>
              <p className="mb-10 text-xl text-slate-300 leading-relaxed">
                Reputazione piu&apos; alta, conversion rate piu&apos; alto, fatturato piu&apos; alto. In quest&apos;ordine.
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-purple-500 px-8 text-lg font-bold text-white hover:bg-purple-600 shadow-2xl shadow-purple-500/30">
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
