import { AlertTriangle, ArrowRight, Bot, CheckCircle, Sparkles, TrendingUp } from "lucide-react"

/**
 * Product Screenshots - audit punto 3 (priorita' ALTA).
 *
 * Mostra 3 finte "schermate" annotate del prodotto:
 *  1. Pricing dinamico (calendario tariffe)
 *  2. Guard alert (mismatch OTA)
 *  3. AutoPilot status (suggerimento attivo)
 *
 * NOTE: i numeri sono PLACEHOLDER realistici, sostituibili facilmente.
 * Costruito tutto via Card/Tailwind: zero immagini esterne, niente da generare.
 */
export function ProductScreenshots() {
  return (
    <section id="vedi-come-funziona" className="py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Vedi come funziona
          </div>
          <h2 className="mb-4 text-4xl font-bold text-gray-900">
            Tre strumenti, una sola dashboard
          </h2>
          <p className="text-xl text-gray-600">
            Pricing dinamico, alert OTA e ottimizzazione automatica. Sotto puoi vedere come si presentano nella pratica.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
          {/* Screenshot 1: Pricing dinamico */}
          <div className="group">
            <div className="overflow-hidden rounded-2xl border bg-white shadow-lg transition-all group-hover:shadow-xl">
              {/* Header browser-like */}
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-gray-700">Pricing</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Aggiornato 5 min fa
                </span>
              </div>
              {/* Content: mini calendar */}
              <div className="space-y-3 p-5">
                <div className="text-xs font-medium text-gray-500">Settimana 18-24 mag 2026</div>
                <div className="grid grid-cols-7 gap-1.5">
                  {[
                    { d: "Lun", p: "120", color: "bg-gray-50" },
                    { d: "Mar", p: "120", color: "bg-gray-50" },
                    { d: "Mer", p: "135", color: "bg-emerald-50" },
                    { d: "Gio", p: "145", color: "bg-emerald-50" },
                    { d: "Ven", p: "185", color: "bg-amber-50" },
                    { d: "Sab", p: "195", color: "bg-amber-50" },
                    { d: "Dom", p: "165", color: "bg-emerald-50" },
                  ].map((day) => (
                    <div
                      key={day.d}
                      className={`flex flex-col items-center rounded-md ${day.color} p-1.5`}
                    >
                      <div className="text-[9px] font-medium text-gray-500">{day.d}</div>
                      <div className="text-sm font-bold text-gray-900">€{day.p}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <p className="text-xs leading-snug text-emerald-900">
                      <strong>+€340</strong> ricavi previsti questo weekend grazie al rialzo automatico
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              1. Tariffe ottimizzate giorno per giorno
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Il calendario mostra la tariffa suggerita per ogni giorno, evidenziando i weekend
              ad alta domanda dove puoi spingere il prezzo.
            </p>
          </div>

          {/* Screenshot 2: Guard alert */}
          <div className="group">
            <div className="overflow-hidden rounded-2xl border bg-white shadow-lg transition-all group-hover:shadow-xl">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-semibold text-gray-700">Guard OTA</span>
                </div>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  3 alert attivi
                </span>
              </div>
              <div className="space-y-2.5 p-5">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-900">Booking.com</span>
                    <span className="rounded bg-red-200 px-1.5 py-0.5 text-[9px] font-bold text-red-900">
                      -€18
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-red-800">
                    Camera Doppia 18 mag: €152 vs €170 sul sito diretto
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-900">Expedia</span>
                    <span className="rounded bg-red-200 px-1.5 py-0.5 text-[9px] font-bold text-red-900">
                      -€12
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-red-800">
                    Suite 19-20 mag: prezzo sotto la parity rate
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-900">Airbnb</span>
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                      Stop Sale
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-amber-800">
                    Disponibilità non sincronizzata su 2 date
                  </p>
                </div>
              </div>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              2. Sai subito quando le OTA ti rubano marginalità
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Guard confronta in tempo reale i prezzi pubblicati sui canali esterni con la
              tua parity rate. Recupera 3-7% di RevPAR.
            </p>
          </div>

          {/* Screenshot 3: AutoPilot */}
          <div className="group">
            <div className="overflow-hidden rounded-2xl border bg-white shadow-lg transition-all group-hover:shadow-xl">
              <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-700">AutoPilot</span>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Attivo
                </span>
              </div>
              <div className="space-y-3 p-5">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Ultima ottimizzazione
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    18 mag - tariffe aggiornate
                  </div>
                  <div className="mt-1 text-xs text-gray-600">23 date modificate, push al PMS</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Occupazione +30gg</span>
                    <span className="font-semibold text-emerald-600">68%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full w-2/3 rounded-full bg-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Pickup ultime 24h</span>
                    <span className="font-semibold text-blue-600">+7 prenotazioni</span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-blue-50 p-2.5">
                  <span className="text-xs font-medium text-blue-900">Prossima esecuzione</span>
                  <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-900">
                    03:00
                  </span>
                </div>
              </div>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              3. Pricing automatico ogni notte, anche quando dormi
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              AutoPilot analizza la domanda, ricalcola le tariffe e le invia al PMS
              automaticamente. Tu controlli solo gli alert.
            </p>
          </div>
        </div>

        {/* CTA after screenshots */}
        <div className="mt-12 flex justify-center">
          <a
            href="/auth/sign-up"
            className="group inline-flex h-14 items-center gap-2 rounded-full bg-emerald-600 px-8 text-lg font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg"
          >
            Provala gratis sulla tua struttura
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </section>
  )
}
