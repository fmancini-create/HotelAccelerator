"use client"

import { useEffect, useState } from "react"
import { Mail, Clock } from "lucide-react"

interface EmailKpi {
  unread_count: number | null
  read_unreplied_count: number | null
  overdue_count: number | null
  avg_response_time_minutes: number | null
  overdue_threshold_minutes: number | null
  metrics_status: "gmail_state_ready" | "reconciling"
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
        <span className={`font-semibold ${(kpi.unread_count || 0) > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
          {kpi.unread_count === null ? "Ricalcolo…" : kpi.unread_count}
        </span>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>
          {kpi.metrics_status === "reconciling"
            ? "Allineamento stato Gmail in corso"
            : "KPI di risposta temporaneamente non pubblicati"}
        </span>
      </div>
    </div>
  )
}
