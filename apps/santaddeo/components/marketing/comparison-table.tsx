import { ArrowRight, Check, Minus, X } from "lucide-react"
import Link from "next/link"

/**
 * Comparison Table - audit punto 8 (priorita' BASSA, impatto ALTO).
 *
 * Confronta SANTADDEO con:
 *  - Excel/Fogli manuali (status quo per molti hotel italiani)
 *  - RMS esteri (Duetto, RoomPriceGenie, IDeaS, ecc.)
 *
 * Mantiene tono FAIR: dichiara i punti dove i competitor sono ok, non li
 * demolisce. La forza di SANTADDEO emerge dal mix prezzo + italiano + freemium.
 *
 * NOTA: i nomi competitor sono generici per evitare cause legali. Se vuoi
 * citarli direttamente (Duetto, RoomPriceGenie), assicurati che i claim siano
 * pubblicamente verificabili sui loro siti.
 */
export function ComparisonTable() {
  type CellValue = "yes" | "no" | "partial"
  // Tipo riga "testo": permette di mostrare valori concreti (prezzi, tempi)
  // invece dei classici check/X. Mantiene la stessa larghezza colonne.
  interface IconRow {
    type: "icon"
    label: string
    santaddeo: CellValue
    excel: CellValue
    foreign: CellValue
  }
  interface TextRow {
    type: "text"
    label: string
    santaddeo: string
    santaddeoHighlight?: boolean
    excel: string
    foreign: string
  }
  type Row = IconRow | TextRow

  // Audit feedback 13/05/2026: la tabella esisteva ma "appariva vuota" perche'
  // tutte le righe erano icone. Aggiunte 3 righe TESTO in cima con numeri
  // concreti (costo, setup, lingua) che danno il colpo d'occhio immediato.
  const rows: Row[] = [
    {
      type: "text",
      label: "Costo mensile",
      santaddeo: "Da €49/mese",
      santaddeoHighlight: true,
      excel: "Gratis",
      foreign: "€300-500/mese",
    },
    {
      type: "text",
      label: "Tempo di setup",
      santaddeo: "30 secondi",
      santaddeoHighlight: true,
      excel: "Continuo (manuale)",
      foreign: "2-3 settimane",
    },
    {
      type: "text",
      label: "Lingua interfaccia e supporto",
      santaddeo: "Italiano + supporto locale",
      santaddeoHighlight: true,
      excel: "Italiano (tu stesso)",
      foreign: "Solo inglese",
    },
    { type: "icon", label: "Dashboard KPI gratuita per sempre", santaddeo: "yes", excel: "no", foreign: "no" },
    { type: "icon", label: "Pricing dinamico automatico", santaddeo: "yes", excel: "no", foreign: "yes" },
    { type: "icon", label: "Integrazione PMS italiani (Scidoo, 5stelle, Bedzzle)", santaddeo: "yes", excel: "no", foreign: "partial" },
    { type: "icon", label: "Benchmark mercato italiano", santaddeo: "yes", excel: "no", foreign: "partial" },
    { type: "icon", label: "Adatto a strutture 5-30 camere", santaddeo: "yes", excel: "yes", foreign: "no" },
    { type: "icon", label: "Costi prevedibili (no consulenza obbligatoria)", santaddeo: "yes", excel: "yes", foreign: "no" },
  ]

  const renderCell = (value: CellValue) => {
    if (value === "yes")
      return (
        <div className="flex items-center justify-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      )
    if (value === "no")
      return (
        <div className="flex items-center justify-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50">
            <X className="h-4 w-4 text-red-400" />
          </div>
        </div>
      )
    return (
      <div className="flex items-center justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50">
          <Minus className="h-4 w-4 text-amber-600" />
        </div>
      </div>
    )
  }

  return (
    <section className="py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-4xl font-bold text-gray-900">
            Come ci confrontiamo con le alternative
          </h2>
          <p className="mb-12 text-xl text-gray-600">
            Cosa cambia tra SANTADDEO, gestire le tariffe in Excel, e usare un RMS estero pensato per i grandi gruppi.
          </p>
        </div>

        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-sm">
          {/* Header columns */}
          <div className="grid grid-cols-[1.6fr_repeat(3,1fr)] items-center gap-2 border-b bg-gray-50 p-4 md:gap-4 md:p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 md:text-sm">
              Funzionalità
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-emerald-700 md:text-base">SANTADDEO</div>
              <div className="text-[10px] text-emerald-600 md:text-xs">Italiano · Da €49/mese</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-gray-700 md:text-base">Excel / Manuale</div>
              <div className="text-[10px] text-gray-500 md:text-xs">Gratis · Time-consuming</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-gray-700 md:text-base">RMS Esteri</div>
              <div className="text-[10px] text-gray-500 md:text-xs">$$$ · Inglese</div>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, idx) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1.6fr_repeat(3,1fr)] items-center gap-2 border-b border-gray-100 p-4 md:gap-4 md:p-5 ${
                idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"
              }`}
            >
              <div className="text-sm font-medium text-gray-900 md:text-base">{row.label}</div>
              {row.type === "text" ? (
                <>
                  <div
                    className={`text-center text-xs leading-snug md:text-sm ${
                      row.santaddeoHighlight
                        ? "font-bold text-emerald-700"
                        : "font-medium text-gray-900"
                    }`}
                  >
                    {row.santaddeo}
                  </div>
                  <div className="text-center text-xs leading-snug text-gray-600 md:text-sm">
                    {row.excel}
                  </div>
                  <div className="text-center text-xs leading-snug text-gray-600 md:text-sm">
                    {row.foreign}
                  </div>
                </>
              ) : (
                <>
                  <div>{renderCell(row.santaddeo)}</div>
                  <div>{renderCell(row.excel)}</div>
                  <div>{renderCell(row.foreign)}</div>
                </>
              )}
            </div>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 border-t bg-gray-50 p-4 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Incluso
            </div>
            <div className="flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5 text-amber-600" /> Parziale / a pagamento
            </div>
            <div className="flex items-center gap-1.5">
              <X className="h-3.5 w-3.5 text-red-400" /> Non incluso / non disponibile
            </div>
          </div>
        </div>

        {/* CTA sotto la tabella - audit feedback: chiudere il pattern
            "vedi confronto -> agisci adesso". */}
        <div className="mt-10 flex flex-col items-center justify-center gap-2">
          <Link
            href="/auth/sign-up"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-7 text-base font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg"
          >
            Provala gratis sulla tua struttura
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="text-xs text-gray-500">
            Nessuna carta di credito · Dashboard KPI gratuita per sempre
          </p>
        </div>
      </div>
    </section>
  )
}
