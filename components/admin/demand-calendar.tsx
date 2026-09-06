"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Code,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface DemandData {
  date: string
  searchCount: number
  sources: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  intensity: "low" | "medium" | "high" | "very_high"
}

interface DemandSummary {
  period: { start: string; end: string }
  totalSearches: number
  peakDates: DemandData[]
  bySource: {
    website: number
    chat: number
    email: number
    whatsapp: number
    phone: number
    script: number
  }
  dailyData: DemandData[]
  // Facoltativo: una risposta salvata prima che questa misura esistesse non ha
  // il campo, e leggerlo senza guardia mostrerebbe "undefined telefonate".
  calls?: { received: number; missed: number }
}

interface PipelineRequest {
  id: string
  conversation_id: string | null
  requested_check_in: string | null
  requested_check_out: string | null
  nights: number | null
  guests_adults: number | null
  source: string | null
  fase: string | null
  chi: string | null
  canale: string | null
  oggetto: string | null
}

interface PipelineResponse {
  richieste?: PipelineRequest[]
  acquisite?: PipelineRequest[]
}

type DayRequest = PipelineRequest & { tipo: "richiesta" | "acquisita" }

interface DemandCalendarProps {
  propertyId?: string // Added propertyId prop
  compact?: boolean // Per la versione sidebar
  onDateSelect?: (date: string, data: DemandData | null) => void
  highlightDates?: string[] // Date da evidenziare (es. dalla conversazione corrente)
  className?: string // Added className prop
}

const DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
const MONTHS_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
]

const INTENSITY_COLORS = {
  low: "bg-green-100 text-green-800 hover:bg-green-200",
  medium: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
  high: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  very_high: "bg-red-100 text-red-800 hover:bg-red-200",
}

const INTENSITY_LABELS = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  very_high: "Molto Alta",
}

const FASE_LABELS: Record<string, string> = {
  da_qualificare: "Da qualificare",
  aperta: "Richiesta aperta",
  preventivo_inviato: "Preventivo inviato",
  confermata: "Confermata",
  persa: "Persa",
}

export function DemandCalendar({
  propertyId,
  compact = false,
  onDateSelect,
  highlightDates = [],
  className,
}: DemandCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [demandData, setDemandData] = useState<DemandSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayRequests, setDayRequests] = useState<DayRequest[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState("")
  const pipelineCache = useRef<PipelineResponse | null>(null)
  const detailsRequestId = useRef(0)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    loadDemandData()
  }, [year, month, propertyId]) // Added propertyId to deps

  useEffect(() => {
    // Se cambia struttura, il dettaglio CRM in cache non deve sopravvivere al
    // cambio tenant: altrimenti il primo click mostrerebbe le righe precedenti.
    pipelineCache.current = null
    setSelectedDate(null)
    setDayRequests([])
    setDetailsError("")
  }, [propertyId])

  async function loadDemandData() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
      })
      if (propertyId) {
        params.set("property_id", propertyId)
      }
      const res = await fetch(`/api/tracking/demand?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDemandData(data)
      }
    } catch (error) {
      console.error("Error loading demand data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function loadDateDetails(dateStr: string) {
    const requestId = ++detailsRequestId.current
    setDetailsLoading(true)
    setDetailsError("")
    setDayRequests([])

    try {
      let pipeline = pipelineCache.current
      if (!pipeline) {
        const res = await fetch("/api/admin/crm/pipeline")
        const body = (await res.json().catch(() => null)) as (PipelineResponse & { error?: string }) | null
        if (!res.ok) {
          if (requestId !== detailsRequestId.current) return
          setDetailsError(
            res.status === 403
              ? "Non hai il permesso CRM necessario per vedere le singole richieste."
              : body?.error || "Non è stato possibile leggere il dettaglio delle richieste.",
          )
          return
        }
        pipeline = body ?? {}
        pipelineCache.current = pipeline
      }

      const rows: DayRequest[] = [
        ...(pipeline.richieste ?? []).map((row) => ({ ...row, tipo: "richiesta" as const })),
        ...(pipeline.acquisite ?? []).map((row) => ({ ...row, tipo: "acquisita" as const })),
      ]
        .filter((row) => String(row.requested_check_in ?? "").slice(0, 10) === dateStr)
        .sort((a, b) => (a.chi ?? a.oggetto ?? "").localeCompare(b.chi ?? b.oggetto ?? "", "it"))

      if (requestId === detailsRequestId.current) setDayRequests(rows)
    } catch {
      if (requestId === detailsRequestId.current) {
        setDetailsError("Non è stato possibile contattare il server per il dettaglio delle richieste.")
      }
    } finally {
      if (requestId === detailsRequestId.current) setDetailsLoading(false)
    }
  }

  function resetSelectedDay() {
    detailsRequestId.current += 1
    setSelectedDate(null)
    setDayRequests([])
    setDetailsError("")
    setDetailsLoading(false)
  }

  function goToPreviousMonth() {
    resetSelectedDay()
    setCurrentDate(new Date(year, month - 2, 1))
  }

  function goToNextMonth() {
    resetSelectedDay()
    setCurrentDate(new Date(year, month, 1))
  }

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate()
  }

  function getFirstDayOfMonth(year: number, month: number) {
    const day = new Date(year, month - 1, 1).getDay()
    return day === 0 ? 6 : day - 1 // Converti da Domenica=0 a Lunedì=0
  }

  function getDemandForDate(dateStr: string): DemandData | null {
    return demandData?.dailyData.find((d) => d.date === dateStr) || null
  }

  function handleDateClick(dateStr: string) {
    setSelectedDate(dateStr)
    const data = getDemandForDate(dateStr)
    onDateSelect?.(dateStr, data)
    if (!compact) void loadDateDetails(dateStr)
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const selectedDemand = selectedDate ? getDemandForDate(selectedDate) : null

  // Crea array di giorni con padding
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  // Raggruppa in settimane
  const weeks: (number | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <Card className={cn(compact ? "border-0 shadow-none" : "", className)}>
      <CardHeader className={cn("pb-2", compact && "px-2 pt-2")}>
        <div className="flex items-center justify-between">
          <CardTitle className={cn("flex items-center gap-2", compact && "text-sm")}>
            <TrendingUp className={cn("text-amber-600", compact ? "h-4 w-4" : "h-5 w-5")} />
            {compact ? "Domanda" : "Calendario Domanda"}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className={cn("font-medium min-w-[120px] text-center", compact && "text-sm")}>
              {MONTHS_IT[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn(compact && "px-2 pb-2")}>
        {/* Legenda */}
        {!compact && (
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(INTENSITY_COLORS).map(([key, color]) => (
              <Badge key={key} variant="outline" className={cn("text-xs", color)}>
                {INTENSITY_LABELS[key as keyof typeof INTENSITY_LABELS]}
              </Badge>
            ))}
          </div>
        )}

        {/* Calendario */}
        <div className="grid grid-cols-7 gap-1" aria-busy={isLoading}>
          {/* Header giorni */}
          {DAYS_IT.map((day) => (
            <div
              key={day}
              className={cn(
                "text-center font-medium text-muted-foreground",
                compact ? "text-[10px] py-1" : "text-xs py-2",
              )}
            >
              {compact ? day.charAt(0) : day}
            </div>
          ))}

          {/* Giorni del mese */}
          {weeks.map((week, weekIdx) =>
            week.map((day, dayIdx) => {
              if (day === null) {
                return <div key={`empty-${weekIdx}-${dayIdx}`} className="aspect-square" />
              }

              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              const demand = getDemandForDate(dateStr)
              const isHighlighted = highlightDates.includes(dateStr)
              const isSelected = selectedDate === dateStr
              const isToday = dateStr === new Date().toISOString().split("T")[0]

              return (
                <TooltipProvider key={dateStr}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleDateClick(dateStr)}
                        aria-pressed={isSelected}
                        aria-label={`${day} ${MONTHS_IT[month - 1]} ${year}${demand ? `, ${demand.searchCount} richieste` : ", nessuna richiesta"}`}
                        className={cn(
                          "aspect-square rounded-md flex items-center justify-center transition-all",
                          compact ? "text-xs" : "text-sm",
                          demand ? INTENSITY_COLORS[demand.intensity] : "bg-muted/30 hover:bg-muted/50",
                          isHighlighted && "ring-2 ring-blue-500",
                          isSelected && "ring-2 ring-amber-500",
                          isToday && "font-bold underline",
                        )}
                      >
                        {day}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">
                        {day} {MONTHS_IT[month - 1]}
                      </div>
                      {demand ? (
                        <div className="mt-1">
                          <div>Ricerche: {demand.searchCount}</div>
                          <div className="text-muted-foreground">Intensità: {INTENSITY_LABELS[demand.intensity]}</div>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">Nessuna ricerca</div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            }),
          )}
        </div>

        {/* Dettaglio operativo: una riga per ogni richiesta CRM con arrivo nel
            giorno selezionato. L'intera riga apre la conversazione d'origine. */}
        {!compact && selectedDate && (
          <div className="mt-5 border-t pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Richieste del {formatDateLongIT(selectedDate)}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                  {selectedDemand
                    ? `${selectedDemand.searchCount} segnali di domanda nel calendario. Qui sotto trovi le richieste CRM con arrivo in questa data.`
                    : "Nessun segnale aggregato nel calendario. Qui sotto trovi comunque le eventuali richieste CRM collegate alla data."}
                </p>
              </div>
              {!detailsLoading && !detailsError && dayRequests.length > 0 && (
                <Badge variant="secondary" className="shrink-0">
                  {dayRequests.length} {dayRequests.length === 1 ? "richiesta" : "richieste"}
                </Badge>
              )}
            </div>

            {detailsLoading ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carico le richieste collegate a questa data…
              </div>
            ) : detailsError ? (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive" role="alert">
                {detailsError}
              </div>
            ) : dayRequests.length === 0 ? (
              <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Nessuna richiesta CRM con arrivo in questa data. Il numero colorato del calendario può includere altri
                segnali di domanda non ancora collegati alla pipeline, per esempio dati di tracciamento o altri flussi.
              </div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border">
                <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,.7fr)_auto] gap-3 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                  <span>Richiesta</span>
                  <span>Soggiorno</span>
                  <span>Ospiti / stato</span>
                  <span className="sr-only">Apri</span>
                </div>
                <div className="divide-y">
                  {dayRequests.map((request) => (
                    <DemandRequestRow key={`${request.tipo}-${request.id}`} request={request} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Statistiche sorgenti (solo versione estesa) */}
        {!compact && demandData && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Sorgenti ricerche</h4>
            <p className="text-xs text-muted-foreground mb-2 text-pretty">
              Da dove arrivano le richieste con una notte precisa.
            </p>
            {/* "Sito" e "Script" arrivano SOLO dagli eventi del sito, che oggi
                nessuno scrive (tabella `events` a zero righe): mostrarli fissi a
                zero accanto a numeri veri li fa leggere come misura ("dal sito
                non arriva nulla") invece che come sorgente non ancora
                collegata. Si mostra una voce solo se ha un valore; le altre
                restano scritte qui e ricompaiono da sole appena arrivano dati. */}
            <div className="grid grid-cols-3 gap-2">
              {demandData.bySource.website > 0 && (
                <SourceStat icon={Globe} label="Sito" count={demandData.bySource.website} />
              )}
              <SourceStat icon={MessageSquare} label="Chat" count={demandData.bySource.chat} />
              <SourceStat icon={Mail} label="Email" count={demandData.bySource.email} />
              <SourceStat icon={Phone} label="WhatsApp" count={demandData.bySource.whatsapp} />
              {/* Stessa regola di "Sito" e "Script", che qui mancava: "Telefono"
                  vale il numero di telefonate in cui l'ospite ha chiesto una
                  NOTTE precisa. Misurato: tutte le 96 righe da telefono sono di
                  tipo `chiamata`, cioe' volume senza data, quindi questa voce e'
                  0 mentre subito sotto compare "96 telefonate": due numeri che
                  si contraddicono a occhio pur essendo entrambi giusti. */}
              {demandData.bySource.phone > 0 && (
                <SourceStat icon={Phone} label="Telefono" count={demandData.bySource.phone} />
              )}
              {demandData.bySource.script > 0 && (
                <SourceStat icon={Code} label="Script" count={demandData.bySource.script} />
              )}
            </div>
          </div>
        )}

        {/* Telefonate: fuori dal calendario, con la data detta a parole.
            Il cron le contava da sempre in `demand_calendar_days` e nessuno le
            leggeva. Restano separate perche' qui la data e' il giorno della
            telefonata, non la notte chiesta: messe nelle celle direbbero che
            quelle persone vogliono dormire il giorno in cui hanno chiamato. */}
        {!compact && demandData?.calls && demandData.calls.received > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Telefonate ricevute</h4>
            <p className="text-xs text-muted-foreground text-pretty">
              Contate nel giorno della chiamata, non nella notte richiesta: per questo non entrano nel calendario.
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">{demandData.calls.received}</span>
              {demandData.calls.missed > 0 && (
                <span className="text-sm text-muted-foreground">
                  di cui {demandData.calls.missed} senza risposta
                </span>
              )}
            </div>
          </div>
        )}

        {/* Date più cercate (solo versione estesa) */}
        {!compact && demandData && demandData.peakDates.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Date più richieste</h4>
            <div className="space-y-1">
              {demandData.peakDates.slice(0, 3).map((peak) => (
                <div
                  key={peak.date}
                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50"
                >
                  <span>{formatDateIT(peak.date)}</span>
                  <Badge variant="secondary" className={INTENSITY_COLORS[peak.intensity]}>
                    {peak.searchCount} ricerche
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legenda compatta */}
        {compact && (
          <div className="flex justify-center gap-1 mt-2">
            <span className="w-3 h-3 rounded bg-green-100" title="Bassa" />
            <span className="w-3 h-3 rounded bg-yellow-100" title="Media" />
            <span className="w-3 h-3 rounded bg-orange-100" title="Alta" />
            <span className="w-3 h-3 rounded bg-red-100" title="Molto Alta" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DemandRequestRow({ request }: { request: DayRequest }) {
  const label = request.tipo === "acquisita" ? "Acquisita dal sito" : FASE_LABELS[request.fase ?? ""] ?? "Richiesta"
  const details = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{request.chi ?? "Senza nome"}</span>
          {request.canale ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              {request.canale}
            </Badge>
          ) : null}
        </div>
        {request.oggetto ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={request.oggetto}>
            {request.oggetto}
          </p>
        ) : null}
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="block text-foreground">{formatStay(request)}</span>
        {request.nights ? <span>{request.nights} {request.nights === 1 ? "notte" : "notti"}</span> : null}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground md:block">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {request.guests_adults ?? "—"}
        </span>
        <span className="md:mt-1 md:block">{label}</span>
      </div>
    </>
  )

  const rowClass =
    "grid gap-2 px-3 py-3 text-sm transition-colors md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,.7fr)_auto] md:items-center md:gap-3"

  if (!request.conversation_id) {
    return (
      <div className={cn(rowClass, "bg-muted/10")}>
        {details}
        <span className="text-xs text-muted-foreground">Conversazione non collegata</span>
      </div>
    )
  }

  return (
    <Link
      href={`/admin/inbox?conversation=${request.conversation_id}`}
      className={cn(rowClass, "group hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset")}
      aria-label={`Apri la conversazione di ${request.chi ?? "questa richiesta"}`}
    >
      {details}
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
    </Link>
  )
}

function SourceStat({ icon: Icon, label, count }: { icon: any; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{count}</span>
    </div>
  )
}

function formatDateIT(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}

function formatDateLongIT(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function formatStay(request: PipelineRequest): string {
  const checkIn = request.requested_check_in ? formatDateIT(String(request.requested_check_in).slice(0, 10)) : "—"
  if (!request.requested_check_out) return `Arrivo ${checkIn}`
  const checkOut = formatDateIT(String(request.requested_check_out).slice(0, 10))
  return `${checkIn} → ${checkOut}`
}
