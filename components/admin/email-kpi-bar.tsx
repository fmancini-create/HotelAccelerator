"use client"

import { useEffect, useState } from "react"
import { Clock, Mail, MessageSquareText, Send } from "lucide-react"

interface EmailKpi {
  unread_count: number | null
  metrics_status: "gmail_state_ready" | "reconciling" | "stale"
  reconcile_age_minutes?: number | null
}

interface OperatorKpi {
  enabled: boolean | null
  days: number
  responses: number | null
  conversations: number | null
  medianResponseSeconds: number | null
  measuredResponses: number
}

function formatRitardo(minuti: number): string {
  if (minuti < 60) return `${minuti} min fa`
  const ore = minuti / 60
  if (ore < 48) return `${ore < 10 ? ore.toFixed(1) : Math.round(ore)} ore fa`
  return `${Math.round(ore / 24)} giorni fa`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`
}

export function EmailKpiBar() {
  const [emailKpi, setEmailKpi] = useState<EmailKpi | null>(null)
  const [operatorKpi, setOperatorKpi] = useState<OperatorKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [guastoServer, setGuastoServer] = useState(false)

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    const fetchKpi = async () => {
      try {
        const [emailRes, operatorRes] = await Promise.all([
          fetch("/api/kpi/email", { credentials: "include" }),
          fetch("/api/kpi/operator-self", { credentials: "include" }),
        ])
        if (cancelled) return
        if ([emailRes.status, operatorRes.status].some((status) => status === 401 || status === 403)) {
          setSessionExpired(true)
          if (interval) clearInterval(interval)
          return
        }
        if (!emailRes.ok || !operatorRes.ok) {
          setGuastoServer(true)
          return
        }
        setEmailKpi(await emailRes.json())
        setOperatorKpi(await operatorRes.json())
        setGuastoServer(false)
      } catch (error) {
        console.error("Errore caricamento KPI Inbox:", error)
        if (!cancelled) setGuastoServer(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchKpi()
    interval = setInterval(fetchKpi, 30000)
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [])

  if (sessionExpired) {
    return <div className="border-b bg-muted/50 px-3 py-2 text-sm text-muted-foreground sm:px-4">Sessione scaduta: i KPI non sono aggiornati.</div>
  }
  if (guastoServer || (!loading && (!emailKpi || !operatorKpi))) {
    return <div className="border-b bg-muted/50 px-3 py-2 text-sm text-muted-foreground sm:px-4">Statistiche non disponibili al momento. Riprovo automaticamente.</div>
  }
  if (loading || !emailKpi || !operatorKpi) {
    return <div className="h-10 animate-pulse border-b bg-muted/50" />
  }

  const statusText = emailKpi.metrics_status === "reconciling"
    ? "Allineamento Gmail in corso"
    : emailKpi.metrics_status === "stale"
      ? `Allineamento Gmail in ritardo${typeof emailKpi.reconcile_age_minutes === "number" ? ` (ultimo ${formatRitardo(emailKpi.reconcile_age_minutes)})` : ""}`
      : null

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b bg-muted/50 px-3 py-2 text-xs sm:px-4 sm:text-sm">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Mail className="h-4 w-4 text-blue-600" />
        <span className="text-muted-foreground">Non lette</span>
        <span className="font-semibold">{emailKpi.unread_count === null ? "Ricalcolo…" : emailKpi.unread_count}</span>
      </div>
      {operatorKpi.enabled ? (
        <>
          <div className="flex items-center gap-2 whitespace-nowrap"><Send className="h-4 w-4" /><span className="text-muted-foreground">Risposte</span><span className="font-semibold">{operatorKpi.responses ?? 0}</span></div>
          <div className="flex items-center gap-2 whitespace-nowrap"><MessageSquareText className="h-4 w-4" /><span className="text-muted-foreground">Conversazioni</span><span className="font-semibold">{operatorKpi.conversations ?? 0}</span></div>
          <div className="flex items-center gap-2 whitespace-nowrap" title={`Mediana su ${operatorKpi.measuredResponses} risposte misurabili negli ultimi ${operatorKpi.days} giorni`}><Clock className="h-4 w-4" /><span className="text-muted-foreground">Attesa mediana</span><span className="font-semibold">{formatDuration(operatorKpi.medianResponseSeconds)}</span></div>
          <span className="text-muted-foreground">ultimi {operatorKpi.days} giorni</span>
        </>
      ) : (
        <span className="text-muted-foreground">KPI operatore non attivi per questo utente</span>
      )}
      {statusText && <span className="text-muted-foreground">{statusText}</span>}
    </div>
  )
}
