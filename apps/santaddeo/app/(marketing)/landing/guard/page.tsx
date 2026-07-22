import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  ArrowRight,
  AlertTriangle,
  Clock,
  Eye,
  TrendingDown,
  Check,
  X,
  FileText,
  BarChart3,
  Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/layout/footer"
import { JsonLd, buildBreadcrumbList, buildService } from "@/components/seo/json-ld"

export const metadata: Metadata = {
  title: "Guard: Smetti di Farti Fregare dalle OTA | SANTADDEO",
  description:
    "Booking, Expedia e altre OTA a volte vendono camere al prezzo sbagliato. Guard segnala i sotto-prezzo in tempo reale. Recupera 3-7% di RevPAR.",
  alternates: { canonical: "https://www.santaddeo.com/landing/guard" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Guard: scopri quando le OTA ti vendono al prezzo sbagliato | SANTADDEO",
    description:
      "Confronto automatico tra prezzo vendita e prezzo atteso. Mismatch in tempo reale. Recupera 3-7% di RevPAR.",
    url: "https://www.santaddeo.com/landing/guard",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Le OTA ti fregano? Guard te lo dimostra | SANTADDEO",
    description: "Mismatch in tempo reale. Recupera 3-7% di RevPAR.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default function GuardLandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <JsonLd data={buildBreadcrumbList([{"name":"Guard - protezione prezzi","path":"/landing/guard"}])} id="ld-breadcrumb" />
      <JsonLd
        id="ld-service"
        data={buildService({
          name: "Santaddeo Guard",
          description:
            "Servizio di protezione prezzi per strutture ricettive: confronto automatico tra prezzo di vendita OTA e prezzo atteso, alert in tempo reale sui mismatch, recovery medio 3-7% di RevPAR.",
          url: "/landing/guard",
          features: [
            "Confronto only-same-rate OTA vs prezzo atteso",
            "Alert mismatch in tempo reale",
            "Export CSV per contestare commissioni",
            "Storico fino a 90 giorni rianalizzabili",
            "Integrazione con qualsiasi PMS supportato",
          ],
        })}
      />
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-500/20 via-transparent to-transparent" />
          <div className="container relative mx-auto px-6 py-20 md:py-32">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-medium text-red-300">
                <Shield className="h-4 w-4" />
                Guard: il primo OTA-watchdog per hotel italiani
              </div>

              <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl text-balance">
                Le OTA ti vendono camere
                <br />
                <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
                  al prezzo sbagliato.
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-xl text-slate-300 md:text-2xl leading-relaxed">
                Booking, Expedia, Hotelbeds. Quando applicano sconti non autorizzati o cachano tariffe vecchie,{" "}
                <strong className="text-white">tu paghi commissioni su un prezzo piu&apos; alto</strong> di quello incassato.
                Guard ti mostra esattamente quanto.
              </p>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link href="/request-info">
                  <Button
                    size="lg"
                    className="h-14 gap-2 rounded-full bg-red-500 px-8 text-lg font-bold text-white hover:bg-red-600 shadow-2xl shadow-red-500/30"
                  >
                    Richiedi Demo Gratuita
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/auth/sign-up">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-14 gap-2 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5"
                  >
                    Prova gratis
                  </Button>
                </Link>
              </div>

              <p className="mt-8 text-sm text-slate-400">
                Setup in 15 minuti &middot; Funziona con il tuo PMS &middot; Recovery medio 3-7% di RevPAR
              </p>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Quanto stai perdendo senza saperlo?
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Tre scenari reali in cui le OTA fanno le furbe.
              </p>

              <div className="space-y-6">
                <ProblemCard
                  icon={<Clock className="h-6 w-6" />}
                  title="Prezzo cachato"
                  description='Hai alzato il prezzo a 180 EUR alle 9:00. Booking continua a venderlo a 145 EUR fino alle 14:00. Cinque ore di "cachato" con cinque prenotazioni perse a 35 EUR ciascuna.'
                  loss="-175 EUR in mezza giornata"
                />
                <ProblemCard
                  icon={<TrendingDown className="h-6 w-6" />}
                  title="Sconto non autorizzato"
                  description='Booking applica un Genius Discount del 10% senza che tu lo abbia mai abilitato per quella tariffa. Tu vedi 200 EUR sul booking ma la tariffa che avevi caricato era 220 EUR. Pochi euro a prenotazione che diventano migliaia all anno.'
                  loss="-3.000 EUR/anno"
                />
                <ProblemCard
                  icon={<AlertTriangle className="h-6 w-6" />}
                  title="Mappatura tariffe sbagliata"
                  description="Vendi la Doppia Standard come Doppia Deluxe. Il PMS riceve il prezzo corretto ma sulla camera sbagliata. Risultato: la camera buona viene venduta sotto-prezzo per settimane prima che tu te ne accorga."
                  loss="-€8.000/anno tipici"
                />
              </div>

              <div className="mt-10 rounded-2xl bg-slate-900 p-8 text-center text-white">
                <p className="text-sm uppercase tracking-wider text-slate-400 mb-2">Recovery medio Guard</p>
                <p className="text-5xl md:text-6xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  3-7% RevPAR
                </p>
                <p className="mt-3 text-slate-300 max-w-md mx-auto">
                  Su un hotel da 1M EUR di fatturato camera sono 30.000-70.000 EUR all anno che oggi non vedi nemmeno.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-slate-900 text-balance">
                Come funziona Guard
              </h2>
              <p className="mb-16 text-center text-lg text-slate-600 max-w-2xl mx-auto">
                Tre operazioni automatiche, ogni volta che arriva una prenotazione.
              </p>

              <div className="grid gap-8 md:grid-cols-3">
                <HowItWorksStep
                  number="1"
                  icon={<Bell className="h-6 w-6" />}
                  title="Cattura"
                  description="Ogni nuova prenotazione viene letta dal tuo PMS in tempo reale, con prezzo, tariffa, camera e ora di ricevimento."
                />
                <HowItWorksStep
                  number="2"
                  icon={<BarChart3 className="h-6 w-6" />}
                  title="Confronta"
                  description="Guard recupera l'ultimo prezzo che ti aveva inviato per quella esatta camera, tariffa e occupazione al momento della prenotazione."
                />
                <HowItWorksStep
                  number="3"
                  icon={<AlertTriangle className="h-6 w-6" />}
                  title="Segnala"
                  description="Se il prezzo incassato e' inferiore a quello atteso oltre la tolleranza, lampeggia rosso. Sopra-prezzi sono verdi: niente falsi allarmi."
                />
              </div>

              <div className="mt-16 rounded-3xl bg-slate-50 border border-slate-200 p-8 md:p-10">
                <h3 className="text-2xl font-bold text-slate-900 mb-6">Confronto only-same-rate</h3>
                <p className="text-slate-700 leading-relaxed mb-6">
                  Una prenotazione su tariffa <strong>B&amp;B Not Refundable</strong> non viene mai confrontata con il
                  prezzo della <strong>B&amp;B Standard</strong>. Le tariffe hanno politiche di prezzo diverse e
                  confrontarle darebbe falsi mismatch. Guard usa la stessa tariffa esatta o ti dice che non e&apos;
                  confrontabile.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-xl bg-white border border-emerald-200 p-4">
                    <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">Stessa tariffa</p>
                      <p className="text-xs text-slate-600">Confronto valido, mismatch reali</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-white border border-red-200 p-4">
                    <X className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">Tariffe diverse</p>
                      <p className="text-xs text-slate-600">Mai confrontate (no falsi mismatch)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DASHBOARD PREVIEW */}
        <section className="bg-slate-900 py-20 text-white">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4 text-balance">Una dashboard chirurgica</h2>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                  Vedi a colpo d&apos;occhio quante prenotazioni sono OK, quante sotto-prezzo e di quanto.
                </p>
              </div>

              {/* Mock dashboard */}
              <div className="rounded-3xl bg-slate-800 border border-slate-700 p-6 md:p-8 shadow-2xl">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <KpiBox label="OK" value="142" color="text-emerald-400" />
                  <KpiBox label="Warning" value="8" color="text-amber-400" />
                  <KpiBox label="Sotto-prezzo" value="11" color="text-red-400" />
                </div>

                <div className="space-y-2 text-sm">
                  <MockRow status="mismatch" channel="Booking.com" rate="B&B Standard" booked="145 EUR" expected="180 EUR" diff="-19,4%" />
                  <MockRow status="ok" channel="Expedia" rate="Not Refundable" booked="220 EUR" expected="200 EUR" diff="+10,0%" />
                  <MockRow status="mismatch" channel="Booking.com" rate="B&B Standard" booked="155 EUR" expected="180 EUR" diff="-13,9%" />
                  <MockRow status="warning" channel="Hotelbeds" rate="HB Standard" booked="172 EUR" expected="180 EUR" diff="-4,4%" />
                  <MockRow status="ok" channel="Diretto" rate="B&B Flex" booked="195 EUR" expected="180 EUR" diff="+8,3%" />
                </div>
              </div>

              <p className="text-center text-sm text-slate-500 mt-6">
                Ogni riga ha l&apos;ora esatta della prenotazione e l&apos;ora dell&apos;ultimo invio prezzo. Click per dettagli.
              </p>
            </div>
          </div>
        </section>

        {/* OUTCOMES */}
        <section className="bg-white py-20">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-12 text-center text-4xl font-bold text-slate-900 text-balance">
                Cosa cambia in pratica
              </h2>

              <div className="grid gap-6 md:grid-cols-3">
                <OutcomeCard
                  icon={<FileText className="h-6 w-6" />}
                  title="Prove documentate"
                  description="Esporti i mismatch in CSV con timestamp, tariffa, camera e differenza per contestare le commissioni con le OTA."
                />
                <OutcomeCard
                  icon={<Eye className="h-6 w-6" />}
                  title="Visibilita totale"
                  description="Vedi ora di prenotazione e ora invio prezzo. Identifichi i pattern di latenza per ogni canale."
                />
                <OutcomeCard
                  icon={<TrendingDown className="h-6 w-6" />}
                  title="Stop alle perdite"
                  description="Identifichi mappature tariffe sbagliate, prezzi cachati, sconti non autorizzati. Recovery 3-7% RevPAR."
                />
              </div>
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
                <FaqItem
                  question="Devo cambiare PMS?"
                  answer="No. Guard si integra con il PMS che usi gia tramite la nostra Connessione PMS guidata. Il setup richiede 15 minuti."
                />
                <FaqItem
                  question="Cosa succede se non ho prezzi inviati al PMS?"
                  answer='Guard ha bisogno che tu invii i prezzi via SANTADDEO (manualmente o tramite AutoPilot). Per le prenotazioni su tariffe non monitorate ti diciamo "non confrontabile" senza generare falsi mismatch.'
                />
                <FaqItem
                  question="Quanti giorni di storico posso analizzare?"
                  answer="Da 7 a 90 giorni a scelta. Lo scan e ricalcolabile in qualsiasi momento."
                />
                <FaqItem
                  question="Funziona anche per i piccoli hotel?"
                  answer="Si. Strutture da 5 a 200 camere. Il valore aggiunto e proporzionale al volume di prenotazioni OTA: piu venduti, piu mismatch potenziali da intercettare."
                />
              </div>
            </div>
          </div>
        </section>

        {/*
          Cross-link verso le altre landing.
          Boost SEO interno e aumento dwell-time: chi atterra su Guard
          puo' scoprire AutoPilot, soluzioni per agriturismi, ecc.
        */}
        <section className="border-t bg-white py-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-3 text-center text-3xl font-bold text-slate-900">
                Scopri tutte le soluzioni SANTADDEO
              </h2>
              <p className="mb-12 text-center text-lg text-slate-600">
                Guard non e&apos; l&apos;unico modo in cui ti aiutiamo a guadagnare di piu&apos;.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Link
                  href="/landing/vendita"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Risultati Garantiti
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    +20% fatturato in 30 giorni
                  </h3>
                  <p className="text-sm text-slate-600">
                    Pricing dinamico automatico per hotel.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                    Scopri come <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/autopilot"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Risparmia Tempo
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Pricing in automatico 24/7
                  </h3>
                  <p className="text-sm text-slate-600">
                    Recupera 10 ore a settimana con AutoPilot.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Scopri AutoPilot <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/agriturismi"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    Per Piccole Strutture
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Agriturismi e B&amp;B
                  </h3>
                  <p className="text-sm text-slate-600">
                    RMS pensato per chi gestisce 5-25 camere.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 group-hover:gap-2 transition-all">
                    Vedi soluzione <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/recupera-prenotazioni"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-red-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    Audit Gratuito
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Quanto stai perdendo?
                  </h3>
                  <p className="text-sm text-slate-600">
                    Recupera il 15-25% di fatturato camere.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-red-600 group-hover:gap-2 transition-all">
                    Calcola perdite <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/performance-ota"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Analytics OTA
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Performance OTA
                  </h3>
                  <p className="text-sm text-slate-600">
                    Confronta KPI Booking col tuo PMS reale.
                  </p>
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
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Recensioni con insight AI
                  </h3>
                  <p className="text-sm text-slate-600">
                    Aggreghiamo Booking, Google, TripAdvisor.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-purple-600 group-hover:gap-2 transition-all">
                    Scopri recensioni <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/landing/variabili-personalizzate"
                  className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-lg transition-all"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    RMS su misura
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">
                    Variabili personalizzate
                  </h3>
                  <p className="text-sm text-slate-600">
                    9 variabili native + N custom illimitate. L&apos;RMS davvero su misura.
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
          <div className="container mx-auto px-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-6 text-red-400" />
            <h2 className="text-4xl md:text-5xl font-black mb-4 text-balance">
              Inizia a recuperare i tuoi soldi.
            </h2>
            <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
              15 minuti di setup, e Guard inizia a monitorare ogni prenotazione automaticamente.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/request-info">
                <Button
                  size="lg"
                  className="h-14 gap-2 rounded-full bg-red-500 px-8 text-lg font-bold text-white hover:bg-red-600 shadow-2xl shadow-red-500/30"
                >
                  Richiedi Demo Gratuita
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-14 gap-2 rounded-full px-8 text-lg text-slate-300 hover:text-white hover:bg-white/5"
                >
                  Prova gratis
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function ProblemCard({
  icon,
  title,
  description,
  loss,
}: {
  icon: React.ReactNode
  title: string
  description: string
  loss: string
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-slate-700 leading-relaxed mb-3">{description}</p>
          <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-sm font-bold text-red-700">
            <TrendingDown className="h-3.5 w-3.5" />
            {loss}
          </div>
        </div>
      </div>
    </div>
  )
}

function HowItWorksStep({
  number,
  icon,
  title,
  description,
}: {
  number: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="text-center">
      <div className="relative inline-flex mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white">
          {icon}
        </div>
        <div className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white text-sm font-black">
          {number}
        </div>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-700 p-4 text-center">
      <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
    </div>
  )
}

function MockRow({
  status,
  channel,
  rate,
  booked,
  expected,
  diff,
}: {
  status: "ok" | "warning" | "mismatch"
  channel: string
  rate: string
  booked: string
  expected: string
  diff: string
}) {
  const cfg = {
    ok: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "OK" },
    warning: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "WARN" },
    mismatch: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "MISMATCH" },
  }[status]
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${cfg.bg}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${cfg.text} bg-slate-900/50`}>
          {cfg.label}
        </span>
        <span className="text-slate-300 text-xs whitespace-nowrap">{channel}</span>
        <span className="text-slate-500 text-xs truncate">{rate}</span>
      </div>
      <div className="flex items-center gap-3 text-xs whitespace-nowrap">
        <span className="text-slate-400">{booked}</span>
        <span className="text-slate-600">vs</span>
        <span className="text-slate-400">{expected}</span>
        <span className={`font-bold tabular-nums ${cfg.text}`}>{diff}</span>
      </div>
    </div>
  )
}

function OutcomeCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed text-sm">{description}</p>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-2xl bg-white border border-slate-200 p-5 cursor-pointer hover:border-slate-300 transition-colors">
      <summary className="flex items-center justify-between text-lg font-semibold text-slate-900 list-none">
        {question}
        <span className="ml-4 text-slate-400 group-open:rotate-45 transition-transform text-2xl leading-none">+</span>
      </summary>
      <p className="mt-4 text-slate-600 leading-relaxed">{answer}</p>
    </details>
  )
}
