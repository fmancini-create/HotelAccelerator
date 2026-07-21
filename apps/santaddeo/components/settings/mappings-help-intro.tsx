"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, BookOpen, Star, Tag, Lightbulb } from "lucide-react"

/**
 * Spiegazione "per un bambino di 6 anni" del modello di mappatura tariffe
 * di Santaddeo. Si apre/chiude con un click. Default APERTO la prima volta
 * cosi' chi entra non si perde, ma puo' essere chiuso e resta chiuso per
 * il resto della sessione (no localStorage: vogliamo che ricompaia ai
 * nuovi accessi finche' non riconosciamo l'utente "esperto").
 *
 * Metafora scelta: il MENU' DEL RISTORANTE.
 *   - La pizza margherita = tariffa di riferimento (BAR)
 *   - Le varianti (con mozzarella di bufala, senza pomodoro, ecc.) =
 *     tariffe figlie con uno sconto/aumento daily.
 *   - Il PMS sa solo dire "Ho venduto la pizza margherita". Noi qui
 *     traduciamo in "linguaggio Santaddeo" perche' l'algoritmo capisca.
 */
export function MappingsHelpIntro() {
  const [open, setOpen] = useState(true)

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-blue-100/50 transition-colors rounded-t-lg"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <BookOpen className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h2 className="font-semibold text-blue-900">
                Come funziona la mappatura? (in 1 minuto)
              </h2>
              <p className="text-sm text-blue-700/80">
                Spiegato come a un bambino di 6 anni. Clicca per{" "}
                {open ? "nascondere" : "aprire"}.
              </p>
            </div>
          </div>
          {open ? (
            <ChevronUp className="h-5 w-5 text-blue-700 shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-blue-700 shrink-0" />
          )}
        </button>

        {open && (
          <div className="px-4 pb-4 space-y-4 border-t border-blue-200">
            {/* Metafora */}
            <div className="pt-4">
              <p className="text-sm leading-relaxed text-blue-950">
                <strong>Pensa al menu&apos; di una pizzeria.</strong> C&apos;e&apos; la
                pizza margherita (la pizza &quot;base&quot;), e poi tante varianti:
                margherita con mozzarella di bufala, margherita senza pomodoro,
                margherita doppia farcitura. Tutte partono dalla margherita ma
                hanno un piccolo sovrapprezzo o sconto.
              </p>
              <p className="text-sm leading-relaxed text-blue-950 mt-2">
                Le tariffe del tuo hotel funzionano <strong>uguale</strong>.
              </p>
            </div>

            {/* Step 1: tariffa di riferimento */}
            <div className="rounded-lg bg-white border border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 shrink-0">
                  <Star className="h-4 w-4 text-amber-600 fill-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">
                    1. Scegli la &quot;tariffa principale&quot; (la margherita)
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    E&apos; la tariffa che vendi piu&apos; spesso, quella di
                    listino. Tipicamente si chiama <em>BAR</em>,{" "}
                    <em>Standard</em> o <em>B&amp;B</em>. Cliccala come tariffa
                    di riferimento (la stellina) qui sotto.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    L&apos;algoritmo calcolera&apos; <strong>solo</strong>{" "}
                    questa tariffa. Tutte le altre seguiranno automaticamente.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2: tariffe figlie */}
            <div className="rounded-lg bg-white border border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 shrink-0">
                  <Tag className="h-4 w-4 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">
                    2. Le altre tariffe sono &quot;varianti&quot;
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Per ogni altra tariffa (Non Rimborsabile, Promo Estate,
                    pacchetto Romantico, ecc.) ti basta dire{" "}
                    <strong>&quot;questa e&apos; figlia di X&quot;</strong> e{" "}
                    <strong>che tipo e&apos;</strong> (NR, Promo, Pacchetto,
                    ecc.). Stop. Non serve scrivere lo sconto qui.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Una stessa madre puo&apos; avere tante figlie. Esempio: BAR
                    →{" "}
                    <em>BAR Non Rimborsabile</em>,{" "}
                    <em>BAR con colazione inclusa</em>,{" "}
                    <em>BAR Promo Weekend</em>.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: gli sconti si fissano in pricing */}
            <div className="rounded-lg bg-white border border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 shrink-0">
                  <Lightbulb className="h-4 w-4 text-violet-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">
                    3. Gli sconti li decidi giorno per giorno (altrove)
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Lo sconto della Non Rimborsabile (es. -10%, -15%) lo
                    imposti nella pagina{" "}
                    <strong>Accelerator → Prezzi</strong>, dove decidi anche
                    se cambia in alta stagione, nel weekend, o in un periodo
                    speciale.
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Qui in Mappature dici solo <em>chi e&apos; figlio di
                      chi</em>. Niente numeri. Cosi&apos; non sbagli.
                  </p>
                </div>
              </div>
            </div>

            {/* Esempio concreto */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <h3 className="font-semibold text-amber-900 mb-2 text-sm">
                Esempio concreto
              </h3>
              <ul className="text-sm text-amber-900 space-y-1.5 leading-relaxed">
                <li>
                  <strong>BAR Standard</strong> = tariffa di riferimento ⭐
                  (cliccata come madre)
                </li>
                <li>
                  <strong>BAR Non Rimborsabile</strong> → tipo{" "}
                  <em>Non rimborsabile</em>, madre <em>BAR Standard</em>
                </li>
                <li>
                  <strong>Promo Estate</strong> → tipo <em>Promozione</em>,
                  madre <em>BAR Standard</em>
                </li>
                <li>
                  <strong>Pacchetto Romantico</strong> → tipo{" "}
                  <em>Pacchetto</em>, madre <em>BAR Standard</em>
                </li>
              </ul>
              <p className="text-xs text-amber-800/80 mt-3">
                Hai mappato 4 tariffe in meno di 30 secondi. Tutto il resto
                (occupanze, sconti giornalieri, prezzi) lo gestisci dalle altre
                pagine.
              </p>
            </div>

            {/* Pulsante chiudi */}
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              >
                Ho capito, chiudi
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
