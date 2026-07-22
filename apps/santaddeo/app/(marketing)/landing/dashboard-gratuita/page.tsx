import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Gauge,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Calendar,
  Users,
  Lock,
  Zap,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Dashboard Hotel Gratuita: Occupazione, ADR, RevPAR | SANTADDEO",
  description:
    "La dashboard KPI per il tuo hotel, gratis per sempre. Occupazione, ADR, RevPAR, pickup e benchmark di settore. Setup in 30 secondi, nessuna carta richiesta.",
  alternates: { canonical: "https://www.santaddeo.com/landing/dashboard-gratuita" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Dashboard Hotel Gratuita | SANTADDEO",
    description:
      "Occupazione, ADR, RevPAR, pickup e benchmark di settore. Gratis per sempre.",
    url: "https://www.santaddeo.com/landing/dashboard-gratuita",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dashboard KPI Hotel Gratis | SANTADDEO",
    description: "I tuoi numeri chiave aggiornati ogni giorno. Senza costi, senza carta.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function DashboardGratuitaLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Dashboard gratuita","path":"/landing/dashboard-gratuita"}])} id="ld-breadcrumb" />
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={42} />
          </Link>
          <Link href="/auth/sign-up">
            <Button>Crea Account Gratis</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-28">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300">
                <Sparkles className="h-4 w-4" />
                100% gratis. Per sempre. Nessuna carta richiesta.
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                I tuoi numeri.
                <br />
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Tutti insieme. Gratis.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Occupazione, ADR, RevPAR, pickup, benchmark di settore. La dashboard KPI del tuo
                hotel <strong className="text-white">aggiornata ogni giorno</strong>, senza costi e
                senza fronzoli.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/auth/sign-up">
                  <Button
                    size="lg"
                    className="h-14 gap-2 rounded-full bg-emerald-500 px-8 text-lg font-bold text-white hover:bg-emerald-600 shadow-2xl shadow-emerald-500/30"
                  >
                    Crea Account Gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/request-info">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-14 gap-2 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    Richiedi Demo
                  </Button>
                </Link>
              </div>

              <p className="mt-8 text-sm text-slate-400">
                Setup in 30 secondi &middot; Nessuna carta richiesta &middot; Connessione PMS guidata
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Apri 5 schede del browser ogni mattina, vero?
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 inline-flex rounded-xl bg-red-50 p-3">
                    <Clock className="h-5 w-5 text-red-700" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">PMS</h3>
                  <p className="text-sm text-slate-600">
                    Per vedere check-in di oggi, occupazione, fatturato del mese.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 inline-flex rounded-xl bg-red-50 p-3">
                    <Clock className="h-5 w-5 text-red-700" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Booking Extranet</h3>
                  <p className="text-sm text-slate-600">
                    Per vedere arrivi, cancellazioni, recensioni, ranking.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 inline-flex rounded-xl bg-red-50 p-3">
                    <Clock className="h-5 w-5 text-red-700" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Excel + Mail</h3>
                  <p className="text-sm text-slate-600">
                    Per calcolare ADR, RevPAR, confrontare con l&apos;anno scorso, fare report.
                  </p>
                </div>
              </div>
              <p className="mt-10 text-center text-lg text-slate-600 leading-relaxed">
                Ogni mattina ci perdi <strong className="text-slate-900">30-45 minuti</strong>. Ogni
                anno fa <strong className="text-slate-900">175 ore</strong>. Quasi un mese di
                lavoro.
              </p>
            </div>
          </div>
        </section>

        {/* COSA TROVI NELLA DASHBOARD GRATIS */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-14 text-center">
                <h2 className="mb-4 text-4xl font-bold text-slate-900 text-balance">
                  Cosa trovi nella dashboard gratuita
                </h2>
                <p className="text-lg text-slate-600">
                  Tutto quello che ti serve per capire come va l&apos;hotel a colpo d&apos;occhio.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: Gauge,
                    title: "Occupazione real-time",
                    text: "Camere occupate / disponibili oggi, domani, prossimi 30 giorni. Aggiornata in automatico dal PMS.",
                  },
                  {
                    icon: TrendingUp,
                    title: "ADR e RevPAR",
                    text: "Average Daily Rate e Revenue Per Available Room calcolati ogni giorno. Niente formule manuali su Excel.",
                  },
                  {
                    icon: Calendar,
                    title: "Calendario produzione",
                    text: "Quanto produce ogni giorno l'hotel: camere vendute e fatturato. Vedi subito le date deboli.",
                  },
                  {
                    icon: BarChart3,
                    title: "Confronto con anno scorso",
                    text: "Stesso periodo, stesso giorno della settimana: come stai andando rispetto al passato? Year-over-year automatico.",
                  },
                  {
                    icon: Users,
                    title: "Movimenti del giorno",
                    text: "Arrivi, partenze, in-house. Sai sempre quante camere stai movimentando e quanti ospiti hai dentro.",
                  },
                  {
                    icon: Sparkles,
                    title: "Benchmark di settore",
                    text: "Come va il tuo hotel rispetto alla media della tua zona/categoria? Insight aggregati, anonimi e gratuiti.",
                  },
                ].map((f, i) => {
                  const Icon = f.icon
                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
                    >
                      <div className="mb-4 inline-flex rounded-xl bg-emerald-50 p-3">
                        <Icon className="h-5 w-5 text-emerald-700" />
                      </div>
                      <h3 className="mb-2 text-base font-bold text-slate-900">{f.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{f.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SETUP IN 30 SECONDI */}
        <section className="bg-emerald-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-14 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-800">
                  <Zap className="h-4 w-4" />
                  Setup in 30 secondi
                </div>
                <h2 className="mb-4 text-4xl font-bold text-slate-900 text-balance">
                  Tre passi e sei dentro
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-emerald-200">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white">
                    1
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Crea l&apos;account</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Email, password, nome dell&apos;hotel. Niente carta di credito, niente vincoli.
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-emerald-200">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white">
                    2
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Connessione PMS</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Ti guidiamo passo-passo nella connessione del tuo PMS. Bastano 2-3 minuti.
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-emerald-200">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white">
                    3
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Vedi i tuoi numeri</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Il primo sync popola la dashboard con dati storici. Da domani aggiornamento automatico ogni giorno.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COSA C'E' DENTRO E COSA NO */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Trasparenza totale: cosa e&apos; gratis e cosa non lo e&apos;
              </h2>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-emerald-500 p-2">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">Gratis per sempre</h3>
                  </div>
                  <ul className="space-y-3">
                    {[
                      "Dashboard KPI completa",
                      "Occupazione, ADR, RevPAR aggiornati ogni giorno",
                      "Calendario produzione e movimenti",
                      "Confronto Year-over-Year",
                      "Benchmark di settore",
                      "Connessione PMS guidata",
                      "Storico illimitato",
                      "Multi-utente (tu e il tuo team)",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="inline-flex rounded-xl bg-amber-500 p-2">
                      <Lock className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">A pagamento (Accelerator)</h3>
                  </div>
                  <p className="mb-4 text-sm text-slate-600">
                    Il modulo Accelerator aggiunge gli automatismi che fanno guadagnare di piu&apos;:
                  </p>
                  <ul className="space-y-3">
                    {[
                      "Guard - monitoraggio OTA furbe (recupera 3-7% RevPAR)",
                      "AutoPilot - pricing automatico 24/7 verso il PMS",
                      "Pagina Obiettivi con target mensili e tracking",
                      "Produzione per canali e analisi tariffe",
                      "Disponibilita' avanzata e overbooking control",
                      "Log invio prezzi e rate matching strict",
                      "9 variabili native + N custom illimitate",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <Lock className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/upgrade" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:gap-2 transition-all">
                    Scopri Accelerator <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <p className="mt-10 text-center text-base text-slate-600 leading-relaxed">
                <strong className="text-slate-900">Iniziare e&apos; gratis e resta gratis.</strong>{" "}
                Quando i tuoi numeri crescono e vuoi automatizzare, sai dove trovarci.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Domande frequenti
              </h2>
              <div className="space-y-4">
                {[
                  {
                    q: "E' davvero gratis? Qual e' il trucco?",
                    a: "Niente trucco. Crediamo che ogni hotel debba avere accesso ai propri KPI senza pagare. La dashboard e' la nostra porta d'ingresso: se ti trovi bene e vuoi automatizzare pricing e monitoraggio OTA, puoi attivare il modulo Accelerator. Ma la dashboard resta gratis comunque.",
                  },
                  {
                    q: "Devo inserire la carta di credito?",
                    a: "No. Email + password e sei dentro. Nessuna carta richiesta neanche per la prova. Quando (e se) deciderai di attivare Accelerator, allora ti chiederemo i dati di pagamento.",
                  },
                  {
                    q: "Quanto tempo ci metto a connettere il PMS?",
                    a: "La Connessione PMS guidata richiede 2-3 minuti seguendo il wizard. Se hai un PMS che non gestiamo ancora, scrivici e lo aggiungiamo in coda alle integrazioni in arrivo.",
                  },
                  {
                    q: "I miei dati sono al sicuro?",
                    a: "Sono criptati in transito (HTTPS) e a riposo (database EU, GDPR-compliant). Solo tu e il tuo team vedete i tuoi numeri. Il benchmark di settore e' aggregato e anonimo: nessuno vede i tuoi dati per nome.",
                  },
                  {
                    q: "Posso aggiungere il mio team?",
                    a: "Si', anche nel piano gratuito. Puoi invitare il tuo revenue manager, il direttore, il consulente. Ognuno con email e password sue.",
                  },
                  {
                    q: "Posso cancellare l'account quando voglio?",
                    a: "Si', con un click dalle impostazioni. Cancelliamo tutti i tuoi dati. Niente vincoli, niente penali.",
                  },
                ].map((faq, i) => (
                  <details
                    key={i}
                    className="group rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm"
                  >
                    <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-900">
                      {faq.q}
                      <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-3 text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                  </details>
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
                Quando sei pronto per il prossimo step
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                La dashboard ti dice cosa succede. Accelerator ti aiuta a farlo succedere.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Link
                  href="/landing/guard"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-red-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                    Stop OTA Furbe
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Guard</h3>
                  <p className="text-sm text-slate-600">
                    Monitora i mismatch sulle OTA. Recupera 3-7% di RevPAR.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                    Scopri Guard <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/autopilot"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Risparmia Tempo
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">AutoPilot</h3>
                  <p className="text-sm text-slate-600">
                    Pricing automatico 24/7. Recupera 10 ore a settimana.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Scopri AutoPilot <ArrowRight className="h-4 w-4" />
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
                  <p className="text-sm text-slate-600">
                    Confronta KPI Booking col tuo PMS reale.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Vedi performance <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/variabili-personalizzate"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    RMS su misura
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">Variabili personalizzate</h3>
                  <p className="text-sm text-slate-600">
                    9 variabili native + N custom illimitate.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 group-hover:gap-2 transition-all">
                    Scopri variabili <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="mb-6 text-4xl font-bold md:text-5xl text-balance">
                I tuoi numeri ti aspettano.
              </h2>
              <p className="mb-10 text-xl text-slate-300 leading-relaxed">
                30 secondi per crearti l&apos;account. Zero secondi per pentirtene: e&apos; gratis.
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/auth/sign-up">
                  <Button
                    size="lg"
                    className="h-14 gap-2 rounded-full bg-emerald-500 px-8 text-lg font-bold text-white hover:bg-emerald-600 shadow-2xl shadow-emerald-500/30"
                  >
                    Crea Account Gratis
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/request-info">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-14 gap-2 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    Parla prima con noi
                  </Button>
                </Link>
              </div>
              <p className="mt-8 text-sm text-slate-400">
                Setup in 30 secondi &middot; Nessuna carta richiesta &middot; Cancellazione con un click
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
