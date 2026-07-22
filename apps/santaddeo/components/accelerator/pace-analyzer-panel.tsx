"use client"

import { AlertTriangle, TrendingUp, TrendingDown, Minus, Activity, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AnalyzedMonth, Anomaly, AnomalySeverity } from "@/lib/pace/analyzer"

interface PaceAnalyzerPanelProps {
  months: AnalyzedMonth[]
  anomalies: Anomaly[]
  trajectoryLookbackDays: number
}

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
function monthLabel(month: string): string {
  const [y, m] = month.split("-")
  return `${MONTH_LABELS[Number(m) - 1] ?? month} ${y.slice(2)}`
}

// Mese in corso (fuso Europe/Rome) in formato "YYYY-MM". Il Pace conta solo le
// notti da OGGI in poi, quindi questo mese e' PARZIALE: la card mostra solo la
// coda residua, non l'intero mese (a differenza di Obiettivi/Produzione totale).
function currentMonthRome(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")?.value ?? ""
  const m = parts.find((p) => p.type === "month")?.value ?? ""
  return `${y}-${m}`
}

const eur = (n: number): string => `${n < 0 ? "-" : ""}€${Math.abs(Math.round(n)).toLocaleString("it-IT")}`
const pctLabel = (n: number | null): string => (n == null ? "n/d" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`)

const severityStyles: Record<AnomalySeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-border bg-muted/40 text-foreground",
}

function GapBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-xs text-muted-foreground">n/d</span>
  }
  const positive = pct >= 0
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        positive ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-700"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {pctLabel(pct)}
    </span>
  )
}

/**
 * Barra del revenue bridge: mostra l'equilibrio tra effetto VOLUME (camere) ed
 * effetto PREZZO (ADR) nel determinare il gap di ricavo YoY. Le due metà sono
 * proporzionate al peso assoluto di ciascun effetto.
 */
function BridgeBar({ volume, price }: { volume: number; price: number }) {
  const totalAbs = Math.abs(volume) + Math.abs(price)
  if (totalAbs === 0) {
    return <div className="h-2 w-full rounded-full bg-muted" />
  }
  const volPct = (Math.abs(volume) / totalAbs) * 100
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={volume >= 0 ? "bg-teal-500" : "bg-red-500"} style={{ width: `${volPct}%` }} aria-hidden="true" />
      <div className={price >= 0 ? "bg-teal-600" : "bg-red-600"} style={{ width: `${100 - volPct}%` }} aria-hidden="true" />
    </div>
  )
}

/**
 * Riga di un singolo fattore (camere o prezzo) tradotta in linguaggio comune:
 * "ti porta" (verde, contributo positivo) o "ti costa" (rosso, negativo).
 */
function FactorLine({
  label,
  changePct,
  euro,
}: {
  label: string
  changePct: number | null
  euro: number
}) {
  const positive = euro >= 0
  const colorDot = positive ? "bg-teal-500" : "bg-red-500"
  const colorText = positive ? "text-teal-700" : "text-red-700"
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorDot}`} aria-hidden="true" />
        <span className="font-medium">{label}</span>
        {changePct != null && <span className="text-muted-foreground">({pctLabel(changePct)})</span>}
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={`font-semibold tabular-nums ${colorText}`}>{eur(euro)}</span>
        <span className="text-xs text-muted-foreground">{positive ? "ti porta" : "ti costa"}</span>
      </span>
    </div>
  )
}

/**
 * Verdetto in UNA frase, in italiano comune, su cosa sta succedendo nel mese.
 * Basato sui SEGNI reali dei due effetti (chi aiuta, chi penalizza) così la
 * frase non contraddice mai i numeri mostrati sotto.
 */
function monthVerdict(m: AnalyzedMonth): string {
  const gap = m.revenueGapPct ?? 0
  const vol = m.bridge.volumeEffect // >0 = le camere aiutano, <0 = penalizzano
  const price = m.bridge.priceEffect // >0 = il prezzo aiuta, <0 = penalizza

  if (gap >= 0) {
    // Incassi MEGLIO dell'anno scorso
    if (vol > 0 && price > 0) return "Stai incassando più dell'anno scorso: vendi più camere e a prezzi più alti."
    if (vol > 0 && price <= 0) return "Stai incassando più dell'anno scorso grazie alle camere in più, nonostante tariffe più basse."
    if (vol <= 0 && price > 0) return "Stai incassando più dell'anno scorso grazie a prezzi più alti, che compensano le camere in meno."
    return "Stai incassando più dell'anno scorso."
  }

  // Incassi PEGGIO dell'anno scorso: spieghiamo chi penalizza e chi (eventualmente) aiuta
  if (vol < 0 && price >= 0) {
    return "Il problema sono le camere: ne vendi meno dell'anno scorso e il prezzo più alto non basta a colmare il calo."
  }
  if (vol >= 0 && price < 0) {
    return "Il problema è il prezzo: vendi le camere, ma a tariffe più basse dell'anno scorso."
  }
  // Entrambi penalizzano: diciamo quale pesa di più
  if (Math.abs(vol) >= Math.abs(price)) {
    return "Incassi meno dell'anno scorso: pesano soprattutto le camere in meno, e anche le tariffe più basse."
  }
  return "Incassi meno dell'anno scorso: pesano soprattutto le tariffe più basse, e anche le camere in meno."
}

export function PaceAnalyzerPanel({ months, anomalies, trajectoryLookbackDays }: PaceAnalyzerPanelProps) {
  // Mostriamo nel dettaglio solo i mesi con uno storico STLY significativo e un
  // gap di ricavo calcolabile, ordinati dal gap peggiore.
  const relevant = months
    .filter((m) => m.revenueGapPct != null && m.stlyRevenue > 0)
    .sort((a, b) => (a.revenueGapPct ?? 0) - (b.revenueGapPct ?? 0))

  // Mese in corso: la sua card e' parziale (solo notti residue da oggi).
  const currentMonth = currentMonthRome()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Analizzatore &amp; Anomalie
        </CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">
          Perché sei sopra o sotto l&apos;anno scorso, a parità di anticipo: scompone il gap di ricavo in effetto{" "}
          <span className="font-medium">volume</span> (camere) ed effetto <span className="font-medium">prezzo</span>{" "}
          (ADR), con la tendenza degli ultimi {trajectoryLookbackDays} giorni.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Guida alla lettura - breve e in linguaggio comune */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In parole semplici</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground text-pretty">
            Per ogni mese futuro confrontiamo quanto stai incassando con lo stesso momento di un anno fa (a parità di
            giorni dall&apos;arrivo). Poi spieghiamo il <span className="font-medium text-foreground">perché</span> con
            due voci:{" "}
            <span className="font-medium text-foreground">le camere</span> (ne stai vendendo di più o di meno?) e{" "}
            <span className="font-medium text-foreground">il prezzo</span> (la tariffa media è più alta o più bassa?).
            Gli euro dicono quanto ciascuna voce ti <span className="font-medium text-teal-700">porta</span> o ti{" "}
            <span className="font-medium text-red-700">costa</span> rispetto all&apos;anno scorso.
          </p>
        </div>
        {/* Anomalie */}
        {anomalies.length > 0 ? (
          <div className="flex flex-col gap-2">
            {anomalies.map((a, i) => (
              <div
                key={`${a.month}-${a.kind}-${i}`}
                className={`flex items-start gap-3 rounded-lg border p-3 ${severityStyles[a.severity]}`}
                role="status"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-pretty opacity-90">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-teal-900">
            <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-pretty">
              Nessuna anomalia rilevante: il ritmo di prenotazione è in linea o migliore rispetto all&apos;anno scorso
              sui mesi con storico sufficiente.
            </p>
          </div>
        )}

        {/* Dettaglio per mese: una scheda chiara per ciascun mese */}
        {relevant.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mese per mese: perché incassi di più o di meno
            </span>
            <div className="flex flex-col gap-3">
              {relevant.map((m) => {
                const net = m.bridge.totalDelta
                const traj = m.trajectory
                const showTraj = traj && traj.thenGapPct != null && traj.nowGapPct != null
                const isPartial = m.month === currentMonth
                return (
                  <div key={m.month} className="rounded-lg border border-border p-4">
                    {/* Intestazione: mese + esito complessivo */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{monthLabel(m.month)}</span>
                        {isPartial && (
                          <span
                            className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                            title="Mese in corso: conteggiamo solo le notti ancora da vendere, non l'intero mese"
                          >
                            mese in corso · solo notti residue
                          </span>
                        )}
                        <GapBadge pct={m.revenueGapPct} />
                        <span className="text-xs text-muted-foreground">sull&apos;incasso vs anno scorso</span>
                      </div>
                      {showTraj && (
                        <span
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                            traj!.inverted ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"
                          }`}
                          title={`Com'era ${trajectoryLookbackDays} giorni fa rispetto a oggi`}
                        >
                          <span className="hidden sm:inline">Tendenza {trajectoryLookbackDays}gg:</span>
                          <span className="tabular-nums">{pctLabel(traj!.thenGapPct)}</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          <span className="font-medium tabular-nums">{pctLabel(traj!.nowGapPct)}</span>
                        </span>
                      )}
                    </div>

                    {/* Verdetto in una frase */}
                    <p className="mt-2 text-sm leading-relaxed text-foreground text-pretty">{monthVerdict(m)}</p>

                    {/* Nota mese in corso: spiega perche' i numeri sono piccoli e
                        non coincidono con la Produzione totale di Obiettivi. */}
                    {isPartial && (
                      <p className="mt-1.5 text-xs leading-relaxed text-amber-800 text-pretty">
                        Riguarda <span className="font-medium">solo le notti ancora da vendere</span> di questo mese (da
                        oggi in poi), confrontate con lo stesso punto di un anno fa. Per il totale del mese intero,
                        comprese le notti già realizzate, vedi <span className="font-medium">Obiettivi → Produzione</span>.
                      </p>
                    )}

                    {/* Barra + due fattori */}
                    <div className="mt-3 flex flex-col gap-2.5">
                      <BridgeBar volume={m.bridge.volumeEffect} price={m.bridge.priceEffect} />
                      <FactorLine label="Camere" changePct={m.roomsGapPct} euro={m.bridge.volumeEffect} />
                      <FactorLine label="Prezzo medio" changePct={m.adrGapPct} euro={m.bridge.priceEffect} />
                    </div>

                    {/* Risultato netto */}
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-sm">
                      <span className="font-medium text-foreground">Risultato netto</span>
                      <span
                        className={`font-semibold tabular-nums ${net >= 0 ? "text-teal-700" : "text-red-700"}`}
                        title="Camere + Prezzo: l'effetto complessivo sull'incasso rispetto all'anno scorso"
                      >
                        {eur(net)} {net >= 0 ? "in più" : "in meno"} di un anno fa
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              La barra colorata mostra il peso dei due fattori: più una parte è larga, più quel fattore conta. La{" "}
              <span className="font-medium">tendenza {trajectoryLookbackDays}gg</span> in alto a destra confronta com&apos;era
              il mese {trajectoryLookbackDays} giorni fa con oggi; se passa da verde a{" "}
              <span className="font-medium text-amber-800">ambra</span> stai perdendo terreno.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
