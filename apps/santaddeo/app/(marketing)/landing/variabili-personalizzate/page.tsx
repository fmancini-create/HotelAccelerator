import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Sliders,
  Sparkles,
  CalendarDays,
  TrendingUp,
  Users,
  CloudRain,
  Trophy,
  Settings,
  CheckCircle2,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Variabili Personalizzate: l'RMS su Misura | SANTADDEO",
  description:
    "Stagioni, occupanza, lead time, weekend, eventi, meteo: configura ogni variabile come vuoi. SANTADDEO non impone una formula, la costruisci tu.",
  alternates: { canonical: "https://www.santaddeo.com/landing/variabili-personalizzate" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Variabili Personalizzate per il tuo RMS | SANTADDEO",
    description:
      "Configura stagioni, eventi, occupanza, lead time. SANTADDEO si adatta alla tua strategia, non viceversa.",
    url: "https://www.santaddeo.com/landing/variabili-personalizzate",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "L'RMS davvero personalizzabile | SANTADDEO",
    description: "Variabili pricing su misura: stagioni, occupanza, lead time, eventi, meteo.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function VariabiliLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Variabili personalizzate","path":"/landing/variabili-personalizzate"}])} id="ld-breadcrumb" />
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-28">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300">
                <Sliders className="h-4 w-4" />
                L&apos;unico RMS davvero su misura
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                Il tuo hotel
                <br />
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  non e&apos; come gli altri.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Stagioni, eventi, lead time, occupanza, meteo, weekend.
                <strong className="text-white"> Le configuri tu, come vuoi tu.</strong> Niente
                formula magica imposta dall&apos;alto.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-amber-500 px-8 text-lg font-bold text-slate-900 hover:bg-amber-400 shadow-2xl shadow-amber-500/30">
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
                Ogni variabile editabile &middot; Zero black box &middot; Logica trasparente
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Tutti gli altri RMS funzionano cosi&apos;:
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Una scatola nera che ti dice &quot;il prezzo giusto e&apos; X&quot;. Tu non sai
                <strong> perche&apos;</strong> e non puoi cambiarlo.
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-red-700">
                    RMS tradizionale
                  </div>
                  <h3 className="mb-4 text-xl font-bold text-slate-900">Black box rigido</h3>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      Algoritmo proprietario inaccessibile
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      &quot;Boutique hotel&quot; e &quot;3 stelle business&quot; trattati uguale
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      Niente customizzazione su eventi locali
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      Sai il risultato, non il processo
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-6">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700">
                    SANTADDEO
                  </div>
                  <h3 className="mb-4 text-xl font-bold text-slate-900">Logica trasparente, su misura</h3>
                  <ul className="space-y-3 text-sm text-slate-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      Vedi ogni variabile e ogni adjustment
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      Configuri stagioni, eventi, weekend come vuoi tu
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      Aggiungi eventi locali (fiere, sagre, concerti)
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      Per ogni prezzo, sai esattamente perche&apos;
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VARIABILI */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                  <Settings className="h-4 w-4" />
                  Le variabili che governano il prezzo
                </div>
                <h2 className="mb-4 text-4xl font-bold text-slate-900 text-balance">
                  9 variabili native + le tue custom illimitate.
                </h2>
                <p className="text-lg text-slate-600">
                  Ogni hotel ha la sua formula. Ti diamo i mattoncini base e puoi crearne quanti
                  ne servono per la tua struttura. Niente schemi imposti.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: CalendarDays,
                    title: "Stagionalita'",
                    // FIX 30/04/2026: nelle stringhe JS (vs JSX text content)
                    // gli HTML entity NON vengono decodificati. Uso virgolette
                    // caporali italiane direttamente.
                    text: "Definisci alta, media, bassa con date e moltiplicatori personalizzati. Stagione «ponte» del 1 maggio? Esiste solo per te? Aggiungila.",
                    color: "amber",
                  },
                  {
                    icon: TrendingUp,
                    title: "Occupanza (occupancy bands)",
                    text: "0-30% = -10%, 31-60% = base, 61-85% = +15%, 86-100% = +30%. Le bande le decidi tu.",
                    color: "blue",
                  },
                  {
                    icon: Users,
                    title: "Lead time",
                    text: "Quanto in anticipo accetti uno sconto? Quanto last-minute alzi il prezzo? Curva personalizzabile giorno per giorno.",
                    color: "emerald",
                  },
                  {
                    icon: CalendarDays,
                    title: "Giorni della settimana",
                    text: "Weekend +20%, infrasettimanale -5%? Domenica come sabato? Tutto configurabile per ogni weekday.",
                    color: "purple",
                  },
                  {
                    icon: Trophy,
                    title: "Eventi locali",
                    text: "Fiera del Mobile, Salone del Gusto, concerti, sagre. Aggiungi date + impatto (low/medium/high) e il prezzo si alza in automatico.",
                    color: "red",
                  },
                  {
                    icon: CalendarDays,
                    title: "Festivita'",
                    text: "Italia, Germania, Paesi Bassi, ovunque siano i tuoi ospiti. Importazione automatica + override manuale.",
                    color: "indigo",
                  },
                  {
                    icon: CloudRain,
                    title: "Meteo (beta)",
                    text: "Pioggia in arrivo? Il sistema considera l'impatto sulla domanda last-minute per le strutture estive.",
                    color: "sky",
                  },
                  {
                    icon: Sparkles,
                    title: "Length of stay",
                    text: "Bonus per stay >= 3 notti, malus per stay = 1 notte. O viceversa, se preferisci max rotation.",
                    color: "pink",
                  },
                  {
                    icon: Zap,
                    title: "Tariffe e occupanze",
                    text: "B&B, HB, FB, Not Refundable: ogni tariffa ha la sua formula. Per pax 1, 2, 3, 4: prezzi indipendenti.",
                    color: "orange",
                  },
                  {
                    // 10a card: messaggio chiave - non solo le 9 native, puoi
                    // creare TUE variabili custom illimitate specifiche per la
                    // tua struttura. E' la USP forte vs RMS rigidi.
                    icon: Sparkles,
                    title: "+ N variabili custom",
                    text: "Hai una variabile speciale che governa il tuo pricing? Stagione del cuoco, evento privato ricorrente, sagra di paese, weekend lungo locale: creale tu, illimitate, configurabili come le native.",
                    color: "amber",
                  },
                ].map((v, i) => {
                  const Icon = v.icon
                  // Map esplicito per Tailwind JIT: classi dinamiche
                  // template-literal NON vengono generate al build,
                  // quindi mappo a classi statiche.
                  const colorClasses: Record<string, { bg: string; text: string }> = {
                    amber: { bg: "bg-amber-50", text: "text-amber-700" },
                    blue: { bg: "bg-blue-50", text: "text-blue-700" },
                    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
                    purple: { bg: "bg-purple-50", text: "text-purple-700" },
                    red: { bg: "bg-red-50", text: "text-red-700" },
                    indigo: { bg: "bg-indigo-50", text: "text-indigo-700" },
                    sky: { bg: "bg-sky-50", text: "text-sky-700" },
                    pink: { bg: "bg-pink-50", text: "text-pink-700" },
                    orange: { bg: "bg-orange-50", text: "text-orange-700" },
                  }
                  const c = colorClasses[v.color] ?? colorClasses.amber
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-amber-300 hover:shadow-md transition-all"
                    >
                      <div className={`mb-4 inline-flex rounded-xl ${c.bg} p-3`}>
                        <Icon className={`h-5 w-5 ${c.text}`} />
                      </div>
                      <h3 className="mb-2 text-base font-bold text-slate-900">{v.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{v.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* PRICING FORMULA EXAMPLE */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Sai sempre perche&apos; il prezzo e&apos; quello.
              </h2>

              <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 md:p-8 shadow-lg">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Esempio: Doppia Comfort - Sabato 14 marzo 2026
                    </div>
                    <div className="mt-1 text-3xl font-bold text-slate-900">147 EUR</div>
                  </div>
                  <div className="rounded-full bg-amber-100 px-4 py-2 text-xs font-bold text-amber-800">
                    Prezzo finale calcolato
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Prezzo base camera</span>
                    <span className="font-mono font-medium text-slate-900">100.00 EUR</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">+ Stagione media (mar-mag)</span>
                    <span className="font-mono font-medium text-emerald-700">+5.00 (+5%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">+ Sabato (weekend)</span>
                    <span className="font-mono font-medium text-emerald-700">+15.75 (+15%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">+ Occupanza 78% (banda 60-85)</span>
                    <span className="font-mono font-medium text-emerald-700">+18.10 (+15%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">+ Evento &quot;Salone del Mobile&quot;</span>
                    <span className="font-mono font-medium text-emerald-700">+13.85 (+10%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">- Lead time 60 giorni (early bird)</span>
                    <span className="font-mono font-medium text-red-700">-5.70 (-3%)</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-bold">
                    <span className="text-slate-900">Totale</span>
                    <span className="font-mono text-slate-900">147.00 EUR</span>
                  </div>
                </div>

                <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm text-slate-800">
                    <strong>Ogni adjustment e&apos; tracciato</strong>. Cambi una variabile, vedi l&apos;impatto in
                    tempo reale. Niente magia, solo logica.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* USE CASES */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Per chi e&apos; pensato
              </h2>

              <div className="space-y-6">
                {[
                  {
                    title: "Boutique hotel di citta'",
                    text: "La fiera del mobile per te vale +30%, per un hotel di mare zero. La domenica sera per te e' vuota, per un altro e' piena. Ogni variabile la decidi tu.",
                  },
                  {
                    title: "Resort stagionali",
                    text: "Stagione di 5 mesi, lead time corto, occupanza che esplode in luglio-agosto. La curva la disegni tu, non l'algoritmo standard.",
                  },
                  {
                    title: "Strutture business",
                    text: "Lun-gio occupanza alta, ven-dom morta. Inverti la logica weekend? Si', in 2 click.",
                  },
                  {
                    title: "Hotel con strategia particolare",
                    text: "Sconti early bird aggressivi? Last-minute al doppio? Pacchetti famiglia? Configura le tue regole, SANTADDEO le esegue ogni giorno.",
                  },
                ].map((u, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                    <h3 className="mb-2 text-lg font-bold text-slate-900">{u.title}</h3>
                    <p className="text-slate-700 leading-relaxed">{u.text}</p>
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
                Ogni feature e&apos; un&apos;arma in piu&apos; nel tuo arsenale.
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
                  <p className="text-sm text-slate-600">Mismatch prezzi OTA in tempo reale.</p>
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
                  <p className="text-sm text-slate-600">Booking vs il tuo PMS.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Vedi performance <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/landing/recensioni"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-purple-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                    Reputazione AI
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Recensioni</h3>
                  <p className="text-sm text-slate-600">Insight AI da tutte le OTA.</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-purple-600 group-hover:gap-2 transition-all">
                    Vedi recensioni <ArrowRight className="h-4 w-4" />
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
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINALE */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="mb-6 text-4xl font-black md:text-5xl text-balance">
                Smetti di adattarti al software.
                <br />
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  Adatta il software a te.
                </span>
              </h2>
              <p className="mb-10 text-xl text-slate-300 leading-relaxed">
                Configurabile per ogni hotel. Trasparente per ogni prezzo. Pensato per chi conosce il
                proprio business meglio di un algoritmo.
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-amber-500 px-8 text-lg font-bold text-slate-900 hover:bg-amber-400 shadow-2xl shadow-amber-500/30">
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
