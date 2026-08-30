"use client"

import { useEffect, useState } from "react"
import { Mail, Clock } from "lucide-react"

interface EmailKpi {
  unread_count: number | null
  read_unreplied_count: number | null
  overdue_count: number | null
  avg_response_time_minutes: number | null
  overdue_threshold_minutes: number | null
  metrics_status: "gmail_state_ready" | "reconciling" | "stale"
  reconcile_never?: number
  reconcile_stale?: number
  reconcile_age_minutes?: number | null
}

function formatRitardo(minuti: number): string {
  if (minuti < 60) return `${minuti} min fa`
  const ore = minuti / 60
  if (ore < 48) return `${ore < 10 ? ore.toFixed(1) : Math.round(ore)} ore fa`
  return `${Math.round(ore / 24)} giorni fa`
}

export function EmailKpiBar() {
  const [kpi, setKpi] = useState<EmailKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [guastoServer, setGuastoServer] = useState(false)

  useEffect(() => {
    let annullato = false
    let interval: ReturnType<typeof setInterval> | undefined
    let cicliDaSaltare = 0
    let fallimentiConsecutivi = 0
    const MAX_CICLI_SALTATI = 9

    const registraFallimento = () => {
      fallimentiConsecutivi += 1
      cicliDaSaltare = Math.min(2 ** (fallimentiConsecutivi - 1), MAX_CICLI_SALTATI)
      if (!annullato) setGuastoServer(true)
    }

    const fetchKpi = async () => {
      if (cicliDaSaltare > 0) {
        cicliDaSaltare -= 1
        return
      }

      try {
        const res = await fetch("/api/kpi/email", { credentials: "include" })
        if (annullato) return

        if (res.status === 401 || res.status === 403) {
          setSessionExpired(true)
          if (interval) clearInterval(interval)
          return
        }

        if (res.ok) {
          setKpi(await res.json())
          fallimentiConsecutivi = 0
          cicliDaSaltare = 0
          setGuastoServer(false)
        } else {
          registraFallimento()
        }
      } catch (error) {
        if (!annullato) {
          console.error("Errore caricamento KPI:", error)
          registraFallimento()
        }
      } finally {
        if (!annullato) setLoading(false)
      }
    }

    fetchKpi()
    interval = setInterval(fetchKpi, 30000)
    return () => {
      annullato = true
      if (interval) clearInterval(interval)
    }
  }, [])

  if (sessionExpired) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/50 px-3 py-2 text-sm sm:px-4">
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Sessione scaduta: i dati non sono aggiornati.</span>
        <a href="/admin" className="font-medium text-ha-brand-soft-foreground underline underline-offset-2">
          Accedi di nuovo
        </a>
      </div>
    )
  }

  if (guastoServer && !kpi) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm sm:px-4">
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Statistiche non disponibili al momento. Riprovo automaticamente.</span>
      </div>
    )
  }

  if (loading || !kpi) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-3 py-2 animate-pulse sm:gap-4 sm:px-4">
        <div className="h-4 w-20 rounded bg-muted sm:w-24" />
        <div className="h-4 w-28 max-w-full rounded bg-muted sm:w-24" />
        <div className="h-4 w-20 rounded bg-muted sm:w-24" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-muted/50 px-3 py-2 text-xs sm:gap-x-6 sm:px-4 sm:text-sm">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Mail className="h-4 w-4 shrink-0 text-blue-600" />
        <span className="text-muted-foreground">Non lette:</span>
        <span className={`font-semibold ${(kpi.unread_count || 0) > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
          {kpi.unread_count === null ? "Ricalcolo…" : kpi.unread_count}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {kpi.metrics_status === "reconciling"
            ? "Allineamento stato Gmail in corso"
            : kpi.metrics_status === "stale"
              ? `Allineamento Gmail in ritardo${
                  typeof kpi.reconcile_age_minutes === "number"
                    ? ` (ultimo ${formatRitardo(kpi.reconcile_age_minutes)})`
                    : ""
                }`
              : "KPI operatori configurabili in Team & Permessi"}
        </span>
      </div>
    </div>
  )
}
