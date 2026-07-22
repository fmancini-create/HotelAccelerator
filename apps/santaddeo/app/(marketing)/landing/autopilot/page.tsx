import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Check, Clock, Zap, Bell, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList, buildService } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  // SEO 06/05/2026: title 75→60ch
  title: "Pricing in Automatico per il Tuo Hotel | SANTADDEO AutoPilot",
  description: "Basta ore davanti a Booking. Il pilota automatico SANTADDEO aggiorna i prezzi della tua struttura 24/7. Risparmia 10 ore a settimana.",
  alternates: { canonical: "https://www.santaddeo.com/landing/autopilot" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Pricing in Automatico per il Tuo Hotel | SANTADDEO AutoPilot",
    description: "Basta lavoro manuale. Il pilota automatico aggiorna i prezzi 24/7. Risparmia 10 ore a settimana.",
    url: "https://www.santaddeo.com/landing/autopilot",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing Automatico 24/7 | SANTADDEO",
    description: "Basta lavoro manuale. Risparmia 10 ore a settimana.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function AutopilotLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Autopilot - pricing automatico","path":"/landing/autopilot"}])} id="ld-breadcrumb" />
      <JsonLd
        id="ld-service"
        data={buildService({
          name: "Santaddeo Autopilot",
          description:
            "Pricing automatico 24/7 per strutture ricettive: l'algoritmo Santaddeo aggiorna le tariffe sul PMS in base a occupazione, eventi e mercato senza intervento manuale, facendo risparmiare in media 10 ore di lavoro a settimana.",
          url: "/landing/autopilot",
          features: [
            "Pricing dinamico 24/7",
            "Push automatico al PMS",
            "Algoritmi differenziati per stagionalita'",
            "Override manuale per eventi speciali",
            "Log completo delle variazioni di prezzo",
          ],
        })}
      />
      {/* Top bar minimal */}
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-32">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300">
                <Sparkles className="h-4 w-4" />
                AutoPilot: il primo RMS che lavora mentre dormi
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                Smetti di guardare
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Booking ogni giorno.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Il <strong className="text-white">pilota automatico</strong> aggiorna i prezzi della tua struttura 24/7.
                Tu decidi la strategia, lui esegue. <strong className="text-white">Risparmi 10 ore a settimana.</strong>
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button size="lg" className="h-14 gap-2 rounded-full bg-emerald-500 px-8 text-lg font-bold text-white hover:bg-emerald-600 shadow-2xl shadow-emerald-500/30">
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
                Setup in 15 minuti  &middot;  Funziona con il tuo PMS  &middot;  Cancellazione in qualsiasi momento
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM SECTION */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Quante ore butti via ogni settimana?
              </h2>

              <div className="space-y-4">
                {[
                  { time: "2h", task: "Controllare i prezzi su Booking.com e Expedia" },
                  { time: "1h", task: "Confrontare le tariffe dei competitor" },
                  { time: "3h", task: "Aggiornare i prezzi sul PMS per ogni canale" },
                  { time: "2h", task: "Analizzare le prenotazioni e calcolare KPI" },
                  { time: "2h", task: "Decidere strategia tariffaria per il weekend" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-6 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-2xl font-black text-red-600">
                      {item.time}
                    </div>
                    <p className="text-lg text-slate-700">{item.task}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl bg-slate-900 p-8 text-center text-white">
                <p className="text-3xl font-bold">= 10 ore a settimana</p>
                <p className="mt-2 text-slate-300">520 ore all&apos;anno. 65 giorni lavorativi.</p>
                <p className="mt-4 text-xl text-emerald-400 font-semibold">
                  AutoPilot fa tutto questo per te.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Come funziona AutoPilot
              </h2>
              <p className="mb-16 text-center text-xl text-slate-600">
                3 passi e il sistema lavora per te
              </p>

              <div className="grid gap-8 md:grid-cols-3">
                {[
                  {
                    icon: Zap,
                    step: "01",
                    title: "Colleghi il PMS",
                    description: "Connessione PMS guidata. Setup in 15 minuti, senza competenze tecniche.",
                  },
                  {
                    icon: Sparkles,
                    step: "02",
                    title: "Imposti la strategia",
                    description: "Definisci limiti minimi/massimi, regole last-minute, eventi locali. Tu mantieni il controllo.",
                  },
                  {
                    icon: Clock,
                    step: "03",
                    title: "AutoPilot lavora 24/7",
                    description: "Aggiorna i prezzi in tempo reale, analizza domanda e occupazione. Tu ricevi solo i report.",
                  },
                ].map((item, i) => (
                  <div key={i} className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="absolute -top-4 left-8 rounded-full bg-slate-900 px-4 py-1 text-xs font-mono font-bold text-white">
                      {item.step}
                    </div>
                    <item.icon className="mb-4 h-10 w-10 text-emerald-600" />
                    <h3 className="mb-2 text-xl font-bold text-slate-900">{item.title}</h3>
                    <p className="text-slate-600 leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES BENTO */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Tutto quello che AutoPilot fa per te
              </h2>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { icon: Bell, title: "Alert intelligenti", desc: "Notifiche solo quando serve la tua attenzione" },
                  { icon: Zap, title: "Pricing dinamico", desc: "Aggiornamenti automatici ogni ora basati sulla domanda" },
                  { icon: Clock, title: "Last-minute auto", desc: "Sconti automatici quando la disponibilita resta alta" },
                  { icon: Sparkles, title: "Eventi locali", desc: "Riconosce concerti, fiere, eventi e adatta i prezzi" },
                  { icon: Check, title: "Push al PMS", desc: "Invia direttamente le tariffe al tuo gestionale" },
                  { icon: ArrowRight, title: "Report settimanali", desc: "Ricevi via email cosa ha fatto AutoPilot" },
                ].map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white p-6 border border-slate-200 hover:border-emerald-300 transition-colors">
                    <f.icon className="mb-3 h-8 w-8 text-emerald-600" />
                    <h3 className="mb-2 font-bold text-slate-900">{f.title}</h3>
                    <p className="text-sm text-slate-600">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="bg-gradient-to-br from-emerald-600 to-emerald-800 py-20 text-white">
          <div className="container mx-auto px-6 text-center">
            <h2 className="mb-4 text-5xl font-black md:text-6xl text-balance">
              Pronto a recuperare
              <br />
              10 ore a settimana?
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-xl text-emerald-100">
              Richiedi una demo gratuita di 30 minuti. Ti mostriamo AutoPilot su dati reali della tua struttura.
            </p>
            <Link href="/request-info">
              <Button size="lg" className="h-14 gap-2 rounded-full bg-white px-10 text-lg font-bold text-emerald-700 hover:bg-emerald-50 shadow-2xl">
                Richiedi Demo Gratuita
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
