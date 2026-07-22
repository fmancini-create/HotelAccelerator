"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useHotel } from "@/lib/contexts/hotel-context"
import { PageHeader } from "@/components/layout/page-header"
import {
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  AlertCircle,
  History,
  GitCompareArrows,
  X,
  Trash2,
  Eye,
  Check,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ──────────────────────────────────────────────────────────────────────────
// Tipi del payload KPI (specchio dell'endpoint)
// ──────────────────────────────────────────────────────────────────────────

interface KpiPayload {
  hotelName: string
  range: { from: string; to: string; days: number; dateMode: "booking" | "stay" }
  compareLabel: string | null
  compareRequested?: boolean
  compareDataAvailable?: boolean
  kpis: {
    revenueTotal: number
    revenueDeltaPct: number | null
    roomNights: number
    roomNightsDeltaPct: number | null
    revpor: number
    revporDeltaPct: number | null
    leadTimeAvgDays: number | null
    leadTimeDeltaPct: number | null
    cancelRatePct: number
    cancelRateDeltaPp: number | null
  }
}

interface HistoryItem {
  id: string
  created_at: string
  range_from: string
  range_to: string
  date_mode: "booking" | "stay"
  compare_yoy: boolean
  compare_period_before: boolean
  hotel_name: string
  user_id: string | null
  kpi_summary: {
    compareLabel: string | null
    compareDataAvailable: boolean | null
    revenueTotal: number | null
    roomNights: number | null
    revpor: number | null
    revenueDeltaPct: number | null
    cancelRatePct: number | null
    days: number | null
  } | null
}

interface LoadedReport {
  id: string | null // null = report appena generato non ancora ricaricato
  kpi: KpiPayload
  text: string
  createdAt: string // ISO string
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers di formattazione
// ──────────────────────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
}
function formatNumber(n: number, dec = 0): string {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)
}
function formatDate(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
}
function formatDateTime(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

// ──────────────────────────────────────────────────────────────────────────
// Markdown renderer minimale (heading ###, paragrafi, bold, bullet -)
// ──────────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n")
  const out: React.ReactNode[] = []
  let buffer: string[] = []
  let listBuffer: string[] = []

  function flushParagraph(key: string) {
    if (buffer.length === 0) return
    const joined = buffer.join(" ").trim()
    if (joined) out.push(<p key={`p-${key}`} className="text-sm leading-relaxed text-foreground">{renderInline(joined, key)}</p>)
    buffer = []
  }
  function flushList(key: string) {
    if (listBuffer.length === 0) return
    out.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-foreground">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    )
    listBuffer = []
  }
  function renderInline(s: string, key: string): React.ReactNode {
    const parts: React.ReactNode[] = []
    let i = 0
    let buf = ""
    while (i < s.length) {
      if (s[i] === "*" && s[i + 1] === "*") {
        if (buf) parts.push(buf)
        buf = ""
        const end = s.indexOf("**", i + 2)
        if (end === -1) {
          buf += "**"
          i += 2
        } else {
          parts.push(<strong key={`b-${key}-${i}`}>{s.slice(i + 2, end)}</strong>)
          i = end + 2
        }
      } else {
        buf += s[i]
        i++
      }
    }
    if (buf) parts.push(buf)
    return parts
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    const key = String(idx)

    if (line.startsWith("### ")) {
      flushList(key)
      flushParagraph(key)
      out.push(
        <h3 key={`h3-${key}`} className="mt-5 mb-2 text-base font-semibold text-foreground border-b pb-1">
          {line.slice(4)}
        </h3>,
      )
    } else if (line.startsWith("## ")) {
      flushList(key)
      flushParagraph(key)
      out.push(
        <h2 key={`h2-${key}`} className="mt-6 mb-2 text-lg font-bold text-foreground">
          {line.slice(3)}
        </h2>,
      )
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph(key)
      listBuffer.push(line.slice(2))
    } else if (line === "") {
      flushList(key)
      flushParagraph(key)
    } else {
      flushList(key)
      buffer.push(line)
    }
  })
  flushList("end")
  flushParagraph("end")
  return <>{out}</>
}

// ──────────────────────────────────────────────────────────────────────────
// KPI Box
// ──────────────────────────────────────────────────────────────────────────

const DELTA_NEUTRAL_THRESHOLD = 1.5

function DeltaBadge({
  delta,
  suffix = "%",
  inverse = false,
  compareLabel,
}: {
  delta: number | null
  suffix?: string
  inverse?: boolean
  compareLabel?: string | null
}) {
  if (delta == null) return null
  const isNeutral = Math.abs(delta) < DELTA_NEUTRAL_THRESHOLD
  const isPositive = delta > 0
  const isGood = isNeutral ? false : inverse ? !isPositive : isPositive
  const isBad = isNeutral ? false : inverse ? isPositive : !isPositive
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown
  const cls = isGood
    ? "text-green-700 bg-green-50 border-green-200"
    : isBad
      ? "text-red-700 bg-red-50 border-red-200"
      : "text-muted-foreground bg-muted border-border"
  const verbalLabel = isNeutral ? "in linea" : isGood ? "meglio" : "peggio"
  const sign = delta > 0 ? "+" : ""
  return (
    <div className="space-y-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
          cls,
        )}
        aria-label={`Variazione ${sign}${formatNumber(delta, 1)}${suffix}, ${verbalLabel}${compareLabel ? ` rispetto a ${compareLabel.toLowerCase()}` : ""}`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">
          {sign}
          {formatNumber(delta, 1)}
          {suffix}
        </span>
        <span className="opacity-80">· {verbalLabel}</span>
      </span>
      {compareLabel && <div className="text-[10px] text-muted-foreground">vs {compareLabel.toLowerCase()}</div>}
    </div>
  )
}

function KpiCard({
  label,
  value,
  delta,
  deltaSuffix = "%",
  deltaInverse = false,
  compareLabel,
  hint,
  compact = false,
}: {
  label: string
  value: string
  delta: number | null
  deltaSuffix?: string
  deltaInverse?: boolean
  compareLabel?: string | null
  hint?: string
  compact?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={compact ? "p-3 space-y-1.5" : "p-4 space-y-2"}>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className={cn("font-bold text-foreground tabular-nums", compact ? "text-lg" : "text-2xl")}>{value}</div>
        <div className="min-h-[36px]">
          <DeltaBadge delta={delta} suffix={deltaSuffix} inverse={deltaInverse} compareLabel={compareLabel ?? null} />
          {hint && delta == null && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {hint && delta != null && <div className="text-[10px] text-muted-foreground leading-tight">{hint}</div>}
      </CardContent>
    </Card>
  )
}

/**
 * Pannello completo: header date + banner + KPI grid + testo report.
 * Usato sia in vista singola sia in modalita' confronto (2 colonne).
 */
function ReportPanel({
  report,
  streaming = false,
  compact = false,
  onClose,
  closeLabel,
  saved = false,
  createdAt,
}: {
  report: { kpi: KpiPayload | null; text: string }
  streaming?: boolean
  compact?: boolean
  onClose?: () => void
  closeLabel?: string
  /**
   * Timestamp di generazione del rapporto (ISO). Mostrato nell'header
   * accanto al periodo cosi' l'utente sa esattamente quando il report
   * e' stato prodotto, soprattutto per i rapporti storici riaperti
   * dall'archivio.
   */
  createdAt?: string
  /**
   * `true` quando questo pannello mostra un rapporto gia' presente
   * nell'archivio (id != null). Mostra un badge informativo cosi'
   * l'utente capisce che il salvataggio e' automatico e non c'e'
   * bisogno di un bottone "Salva".
   */
  saved?: boolean
}) {
  const { kpi, text } = report
  return (
    <div className="space-y-3">
      {kpi && (
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
            <span>
              {kpi.hotelName} • {formatDate(kpi.range.from)} → {formatDate(kpi.range.to)} • {kpi.range.days}{" "}
              {kpi.range.days === 1 ? "giorno" : "giorni"} •{" "}
              {kpi.range.dateMode === "booking" ? "data prenotazione" : "data soggiorno"}
              {kpi.compareLabel ? ` • Confronto: ${kpi.compareLabel}` : ""}
            </span>
            {createdAt && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                <Clock className="h-3 w-3" />
                Generato il {formatDateTime(createdAt)}
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <Check className="h-3 w-3" />
                Salvato in archivio
              </span>
            )}
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onClose}>
              <X className="h-3 w-3" />
              {closeLabel || "Chiudi"}
            </Button>
          )}
        </div>
      )}

      {kpi?.compareRequested && kpi.compareDataAvailable === false && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-900">
              <span className="font-medium">Confronto {kpi.compareLabel} non disponibile:</span> non ci sono dati di
              prenotazione per il periodo di confronto.
            </div>
          </CardContent>
        </Card>
      )}

      {kpi && (
        <div
          className={cn(
            "grid gap-3",
            compact
              ? "grid-cols-2 lg:grid-cols-3"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
          )}
        >
          <KpiCard
            compact={compact}
            label="Produzione"
            value={formatEur(kpi.kpis.revenueTotal)}
            delta={kpi.kpis.revenueDeltaPct}
            compareLabel={kpi.compareLabel}
          />
          <KpiCard
            compact={compact}
            label="Camere-notte"
            value={formatNumber(kpi.kpis.roomNights)}
            delta={kpi.kpis.roomNightsDeltaPct}
            compareLabel={kpi.compareLabel}
          />
          <KpiCard
            compact={compact}
            label="RevPOR"
            value={formatEur(kpi.kpis.revpor)}
            delta={kpi.kpis.revporDeltaPct}
            compareLabel={kpi.compareLabel}
          />
          <KpiCard
            compact={compact}
            label="Lead time medio"
            value={kpi.kpis.leadTimeAvgDays != null ? `${formatNumber(kpi.kpis.leadTimeAvgDays, 1)} gg` : "—"}
            delta={kpi.kpis.leadTimeDeltaPct}
            compareLabel={kpi.compareLabel}
            hint="giorni medi tra prenotazione e check-in"
          />
          <KpiCard
            compact={compact}
            label="Tasso cancellazioni"
            value={`${formatNumber(kpi.kpis.cancelRatePct, 1)}%`}
            delta={kpi.kpis.cancelRateDeltaPp}
            deltaSuffix="pp"
            deltaInverse
            compareLabel={kpi.compareLabel}
          />
        </div>
      )}

      {(streaming || text) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Rapporto narrativo
              {streaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {text ? (
              <div className="prose prose-sm max-w-none">{renderMarkdown(text)}</div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Aggregazione dati in corso, il rapporto inizia tra qualche istante…
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// History list item
// ──────────────────────────────────────────────────────────────────────────

function HistoryRow({
  item,
  isActiveA,
  isActiveB,
  canCompare,
  onOpen,
  onCompare,
  onDelete,
}: {
  item: HistoryItem
  isActiveA: boolean
  isActiveB: boolean
  canCompare: boolean
  onOpen: () => void
  onCompare: () => void
  onDelete: () => void
}) {
  const compareLabels: string[] = []
  if (item.compare_yoy) compareLabels.push("YoY")
  if (item.compare_period_before) compareLabels.push("Periodo prec.")
  const k = item.kpi_summary
  return (
    <div
      className={cn(
        "border rounded-md p-3 transition-colors",
        isActiveA && "border-primary bg-primary/5",
        isActiveB && "border-amber-500 bg-amber-50",
        !isActiveA && !isActiveB && "border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {formatDate(item.range_from)} → {formatDate(item.range_to)}
            </span>
            <span className="text-[10px] uppercase tracking-wide rounded bg-muted text-muted-foreground px-1.5 py-0.5">
              {item.date_mode === "booking" ? "prenotazione" : "soggiorno"}
            </span>
            {compareLabels.map((c) => (
              <span
                key={c}
                className="text-[10px] uppercase tracking-wide rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5"
              >
                {c}
              </span>
            ))}
            {isActiveA && (
              <span className="text-[10px] uppercase tracking-wide rounded bg-primary text-primary-foreground px-1.5 py-0.5">
                Aperto
              </span>
            )}
            {isActiveB && (
              <span className="text-[10px] uppercase tracking-wide rounded bg-amber-500 text-white px-1.5 py-0.5">
                Confronto
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Generato il {formatDateTime(item.created_at)} ·{" "}
            {k?.days != null ? `${k.days} giorni` : "range incompleto"}
          </div>
          {k && (
            <div className="text-xs text-foreground tabular-nums flex items-center gap-3 flex-wrap pt-1">
              <span>
                <span className="text-muted-foreground">Produzione</span>{" "}
                <span className="font-medium">{k.revenueTotal != null ? formatEur(k.revenueTotal) : "—"}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Notti</span>{" "}
                <span className="font-medium">{k.roomNights != null ? formatNumber(k.roomNights) : "—"}</span>
              </span>
              <span>
                <span className="text-muted-foreground">RevPOR</span>{" "}
                <span className="font-medium">{k.revpor != null ? formatEur(k.revpor) : "—"}</span>
              </span>
              {k.compareLabel && k.revenueDeltaPct != null && (
                <span className={cn(k.revenueDeltaPct >= 0 ? "text-green-700" : "text-red-700")}>
                  {k.revenueDeltaPct >= 0 ? "+" : ""}
                  {formatNumber(k.revenueDeltaPct, 1)}% vs {k.compareLabel.toLowerCase()}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Button
            variant={isActiveA ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={onOpen}
          >
            <Eye className="h-3 w-3" />
            {isActiveA ? "Aperto" : "Apri"}
          </Button>
          <Button
            variant={isActiveB ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={onCompare}
            disabled={!canCompare && !isActiveB}
            title={
              !canCompare && !isActiveB
                ? "Apri prima un altro rapporto in vista principale per attivare il confronto"
                : undefined
            }
          >
            <GitCompareArrows className="h-3 w-3" />
            {isActiveB ? "Confronto" : "Confronta"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export default function AIReportPage() {
  const { selectedHotel } = useHotel()
  const initRange = defaultRange()
  const [from, setFrom] = useState(initRange.from)
  const [to, setTo] = useState(initRange.to)
  const [dateMode, setDateMode] = useState<"booking" | "stay">("booking")
  const [compareYoY, setCompareYoY] = useState(true)
  const [comparePeriodBefore, setComparePeriodBefore] = useState(false)

  // Slot A: la vista "principale" — sia il rapporto in streaming live, sia
  // un rapporto storico aperto. Slot B: opzionale, attivo solo in modalita'
  // confronto.
  const [slotA, setSlotA] = useState<LoadedReport | null>(null)
  const [slotB, setSlotB] = useState<LoadedReport | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Storia
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)

  const canSubmit = useMemo(() => {
    return !!selectedHotel?.id && !!from && !!to && from <= to && !streaming
  }, [selectedHotel, from, to, streaming])

  // ──────────────────────────────────────────────────────────────────────
  // History fetch
  // ──────────────────────────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    if (!selectedHotel?.id) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/ai-report/history?hotelId=${selectedHotel.id}&limit=50`)
      const j = await res.json()
      if (res.ok) {
        setHistory(j.items || [])
      } else {
        console.error("[ai-report] history fetch", j)
      }
    } catch (e) {
      console.error("[ai-report] history fetch error", e)
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedHotel?.id])

  useEffect(() => {
    refreshHistory()
    // Cambio hotel = reset slot per evitare di mostrare report di un altro hotel
    setSlotA(null)
    setSlotB(null)
  }, [selectedHotel?.id, refreshHistory])

  // ──────────────────────────────────────────────────────────────────────
  // Generate (streaming)
  // ──────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedHotel?.id) return
    setError(null)
    setSlotA(null)
    // Disattivo il confronto durante lo streaming per non confondere la UI
    setSlotB(null)
    setStreaming(true)

    try {
      const res = await fetch("/api/ai-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: selectedHotel.id,
          from,
          to,
          dateMode,
          compareYoY,
          comparePeriodBefore,
        }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "")
        setError(`Errore ${res.status}: ${text || res.statusText}`)
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let prefix = ""
      let kpiSet = false
      let kpiCaptured: KpiPayload | null = null
      let buffered = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        if (!kpiSet) {
          prefix += chunk
          const idx = prefix.indexOf("\n---REPORT---\n")
          if (idx >= 0) {
            const jsonStr = prefix.slice(0, idx)
            try {
              const parsed: KpiPayload = JSON.parse(jsonStr)
              kpiCaptured = parsed
              setSlotA({ id: null, kpi: parsed, text: "", createdAt: new Date().toISOString() })
            } catch (e) {
              console.error("[ai-report] KPI parse error", e)
              setError("Errore parsing KPI dal server")
              setStreaming(false)
              return
            }
            const rest = prefix.slice(idx + "\n---REPORT---\n".length)
            buffered = rest
            if (kpiCaptured) {
              setSlotA({ id: null, kpi: kpiCaptured, text: rest, createdAt: new Date().toISOString() })
            }
            kpiSet = true
            prefix = ""
          }
        } else {
          buffered += chunk
          if (kpiCaptured) {
            setSlotA({ id: null, kpi: kpiCaptured, text: buffered, createdAt: new Date().toISOString() })
          }
        }
      }
      // Fine stream: il backend ha persistito; aggiorno la lista cosi'
      // l'utente vede subito il nuovo item con badge "Aperto".
      // Piccolo delay per dare al DB il tempo di committare.
      setTimeout(async () => {
        // Refetch + cattura del primo item, cosi' possiamo agganciare il
        // suo id allo slotA: il pannello passa da "(nuovo)" a "(storico)"
        // e mostra il badge "Salvato in archivio". Senza questo agganciamento
        // l'utente potrebbe pensare che debba esistere un pulsante manuale
        // per salvare (richiesta utente 01/05/2026 sera).
        if (!selectedHotel?.id) return
        try {
          const res = await fetch(`/api/ai-report/history?hotelId=${selectedHotel.id}&limit=50`)
          const j = await res.json()
          if (res.ok) {
            const items: HistoryItem[] = j.items || []
            setHistory(items)
            // Match euristico: il primo item della lista (ordinata desc)
            // creato negli ultimi 60 secondi e' quasi certamente il
            // rapporto appena generato.
            const newest = items[0]
            if (newest) {
              const ageMs = Date.now() - new Date(newest.created_at).getTime()
              if (ageMs < 60_000) {
                setSlotA((prev) => (prev ? { ...prev, id: newest.id } : prev))
              }
            }
          }
        } catch (err) {
          console.error("[ai-report] post-stream history refresh error", err)
        }
      }, 700)
    } catch (e: any) {
      console.error("[ai-report] fetch error", e)
      setError(e?.message || "Errore inaspettato")
    } finally {
      setStreaming(false)
    }
  }

  // ─────────���────────────────────────────────────────────────────────────
  // History actions
  // ──────────────────────────────────────────────────────────────────────
  async function loadReport(id: string): Promise<LoadedReport | null> {
    try {
      const res = await fetch(`/api/ai-report/history/${id}`)
      const j = await res.json()
      if (!res.ok) {
        alert(`Errore caricamento rapporto: ${j.error || res.statusText}`)
        return null
      }
      const r = j.report
      return {
        id: r.id,
        kpi: r.kpi_payload as KpiPayload,
        text: r.report_text as string,
        createdAt: r.created_at as string,
      }
    } catch (e: any) {
      console.error("[ai-report] load error", e)
      alert(`Errore di rete: ${e?.message || "?"}`)
      return null
    }
  }

  async function handleOpen(item: HistoryItem) {
    if (slotA?.id === item.id) {
      // Toggle off
      setSlotA(null)
      setSlotB(null) // chiudo anche il confronto quando chiudo lo slot principale
      return
    }
    const loaded = await loadReport(item.id)
    if (loaded) {
      setSlotA(loaded)
      // Se quello che era in B è uguale al nuovo A, libero B
      if (slotB?.id === loaded.id) setSlotB(null)
    }
  }

  async function handleCompare(item: HistoryItem) {
    if (!slotA) {
      alert("Apri prima un rapporto in vista principale, poi seleziona un altro rapporto per confrontarli.")
      return
    }
    if (slotA.id === item.id) {
      alert("Non puoi confrontare un rapporto con se stesso.")
      return
    }
    if (slotB?.id === item.id) {
      // Toggle off
      setSlotB(null)
      return
    }
    const loaded = await loadReport(item.id)
    if (loaded) setSlotB(loaded)
  }

  async function handleDelete(item: HistoryItem) {
    if (!confirm(`Eliminare il rapporto del ${formatDateTime(item.created_at)}?`)) return
    try {
      const res = await fetch(`/api/ai-report/history/${item.id}`, { method: "DELETE" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`Errore eliminazione: ${j.error || res.statusText}`)
        return
      }
      // Pulisci slot se contenevano l'item eliminato
      if (slotA?.id === item.id) setSlotA(null)
      if (slotB?.id === item.id) setSlotB(null)
      refreshHistory()
    } catch (e: any) {
      alert(`Errore di rete: ${e?.message || "?"}`)
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────
  const compareMode = !!slotB
  const showInitialEmpty = !slotA && !streaming && !error

  return (
    <div className="container mx-auto max-w-7xl py-6 space-y-6">
      <PageHeader
        title="Insight AI"
        description="Rapporto automatico sull'andamento delle prenotazioni con confronto opzionale"
      />

      {/* Form parametri */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Parametri del rapporto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from">Data inizio</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">Data fine</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Filtra per</Label>
            <RadioGroup
              value={dateMode}
              onValueChange={(v) => setDateMode(v as "booking" | "stay")}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <label
                htmlFor="dm-booking"
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                  dateMode === "booking" ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <RadioGroupItem value="booking" id="dm-booking" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Data prenotazione</div>
                  <div className="text-xs text-muted-foreground">
                    Cosa abbiamo venduto nel periodo (anche per soggiorni futuri). Pickup analysis.
                  </div>
                </div>
              </label>
              <label
                htmlFor="dm-stay"
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition-colors",
                  dateMode === "stay" ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <RadioGroupItem value="stay" id="dm-stay" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Data soggiorno</div>
                  <div className="text-xs text-muted-foreground">Camere effettivamente dormite nel periodo. Consuntivo.</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block">Confronti</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={compareYoY} onCheckedChange={(v) => setCompareYoY(v === true)} id="compare-yoy" />
                <span className="text-sm">Anno precedente (stesso periodo, anno -1)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={comparePeriodBefore}
                  onCheckedChange={(v) => setComparePeriodBefore(v === true)}
                  id="compare-prev"
                />
                <span className="text-sm">Periodo immediatamente precedente (stesso numero di giorni)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4 gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                Hotel: <span className="font-medium text-foreground">{selectedHotel?.name || "—"}</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-700">
                <Check className="h-3 w-3" />
                <span>Il rapporto viene salvato automaticamente nell&apos;archivio sottostante.</span>
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
              {streaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generazione in corso…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Genera rapporto
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Storia */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setHistoryOpen((v) => !v)}>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Rapporti precedenti
              {history.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({history.length})</span>
              )}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {historyOpen ? "Comprimi" : "Espandi"}
            </span>
          </CardTitle>
        </CardHeader>
        {historyOpen && (
          <CardContent className="space-y-2">
            {historyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento…
              </div>
            )}
            {!historyLoading && history.length === 0 && (
              <div className="text-sm text-muted-foreground italic py-4 text-center">
                Nessun rapporto in archivio per {selectedHotel?.name || "questo hotel"}. Genera il primo dal form qui sopra.
              </div>
            )}
            {!historyLoading && history.length > 0 && (
              <>
                <div className="text-xs text-muted-foreground">
                  Clicca <span className="font-medium">Apri</span> per visualizzare un rapporto, poi{" "}
                  <span className="font-medium">Confronta</span> su un altro per metterli affiancati.
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {history.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      isActiveA={slotA?.id === item.id}
                      isActiveB={slotB?.id === item.id}
                      canCompare={!!slotA && slotA.id !== item.id}
                      onOpen={() => handleOpen(item)}
                      onCompare={() => handleCompare(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Errore */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
            <div className="text-sm text-red-900">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Vista report: singola o confronto a 2 colonne */}
      {slotA && (
        <>
          {compareMode ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold border-l-4 border-primary pl-2">
                  Rapporto principale {slotA.id ? "(storico)" : "(nuovo)"}
                </div>
                <ReportPanel
                  report={{ kpi: slotA.kpi, text: slotA.text }}
                  streaming={streaming}
                  compact
                  createdAt={slotA.createdAt}
                  saved={!!slotA.id && !streaming}
                  onClose={() => {
                    setSlotA(null)
                    setSlotB(null)
                  }}
                  closeLabel="Chiudi"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold border-l-4 border-amber-500 pl-2">
                  Rapporto in confronto
                </div>
                <ReportPanel
                  report={{ kpi: slotB!.kpi, text: slotB!.text }}
                  compact
                  createdAt={slotB?.createdAt}
                  saved={!!slotB?.id}
                  onClose={() => setSlotB(null)}
                  closeLabel="Chiudi confronto"
                />
              </div>
            </div>
          ) : (
              <ReportPanel
                report={{ kpi: slotA.kpi, text: slotA.text }}
                streaming={streaming}
                createdAt={slotA.createdAt}
                saved={!!slotA.id && !streaming}
              onClose={
                slotA.id
                  ? () => {
                      setSlotA(null)
                    }
                  : undefined
              }
              closeLabel="Chiudi rapporto"
            />
          )}
        </>
      )}

      {/* Empty state iniziale */}
      {showInitialEmpty && history.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2 text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto text-amber-500" />
            <div className="text-sm">
              Imposta i parametri sopra e clicca <span className="font-medium text-foreground">Genera rapporto</span> per
              ricevere un&apos;analisi automatica delle prenotazioni del periodo scelto.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
