"use client"

import { useEffect, useState } from "react"
import { Mail, Clock, AlertTriangle, Timer } from "lucide-react"

interface EmailKpi {
  unread_count: number
  read_unreplied_count: number
  overdue_count: number
  avg_response_time_minutes: number | null
  overdue_threshold_minutes: number
}

export function EmailKpiBar() {
  const [kpi, setKpi] = useState<EmailKpi | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchKpi = async () => {
    try {
      const res = await fetch("/api/kpi/email", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setKpi(data)
      }
    } catch (error) {
      console.error("Errore caricamento KPI:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKpi()
    // Refresh ogni 30 secondi
    const interval = setInterval(fetchKpi, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !kpi) {
    return (
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b animate-pulse">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-4 w-24 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-muted/50 border-b text-sm">
      {/* Non lette */}
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-blue-600" />
        <span className="text-muted-foreground">Non lette:</span>
        <span className={`font-semibold ${kpi.unread_count > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
          {kpi.unread_count}
        </span>
      </div>

      {/* Lette ma non risposte */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600" />
        <span className="text-muted-foreground">Da rispondere:</span>
        <span className={`font-semibold ${kpi.read_unreplied_count > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
          {kpi.read_unreplied_count}
        </span>
      </div>

      {/* Scadute (oltre soglia) */}
      <div className="flex items-center gap-2">
        <AlertTriangle className={`h-4 w-4 ${kpi.overdue_count > 0 ? "text-red-600" : "text-muted-foreground"}`} />
        <span className="text-muted-foreground">
          Urgenti ({">"}
          {kpi.overdue_threshold_minutes}min):
        </span>
        <span className={`font-semibold ${kpi.overdue_count > 0 ? "text-red-600" : "text-muted-foreground"}`}>
          {kpi.overdue_count}
        </span>
      </div>

      {/* Tempo medio risposta */}
      <div className="flex items-center gap-2 ml-auto">
        <Timer className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Tempo medio:</span>
        <span className="font-semibold">
          {kpi.avg_response_time_minutes !== null ? `${kpi.avg_response_time_minutes} min` : "N/D"}
        </span>
      </div>
    </div>
  )
}
