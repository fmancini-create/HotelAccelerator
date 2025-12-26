"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, TrendingUp, Globe, MessageSquare, Mail, Phone, Code } from "lucide-react"
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
}

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

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    loadDemandData()
  }, [year, month, propertyId]) // Added propertyId to deps

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

  function goToPreviousMonth() {
    setCurrentDate(new Date(year, month - 2, 1))
  }

  function goToNextMonth() {
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
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

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
        <div className="grid grid-cols-7 gap-1">
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
                        onClick={() => handleDateClick(dateStr)}
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

        {/* Statistiche sorgenti (solo versione estesa) */}
        {!compact && demandData && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Sorgenti ricerche</h4>
            <div className="grid grid-cols-3 gap-2">
              <SourceStat icon={Globe} label="Sito" count={demandData.bySource.website} />
              <SourceStat icon={MessageSquare} label="Chat" count={demandData.bySource.chat} />
              <SourceStat icon={Mail} label="Email" count={demandData.bySource.email} />
              <SourceStat icon={Phone} label="WhatsApp" count={demandData.bySource.whatsapp} />
              <SourceStat icon={Phone} label="Telefono" count={demandData.bySource.phone} />
              <SourceStat icon={Code} label="Script" count={demandData.bySource.script} />
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
  const date = new Date(dateStr)
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}
