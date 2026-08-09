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
  // Sessione scaduta: condizione ATTESA, non un guasto. Va mostrata e
  // deve fermare il ciclo di aggiornamento.
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    // `annullato` evita di scrivere sullo stato dopo lo smontaggio.
    let annullato = false
    let interval: ReturnType<typeof setInterval> | undefined

    // Freno progressivo sui guasti del server (5xx/rete).
    // A differenza del 401 non possiamo fermarci del tutto: il guasto e'
    // transitorio e vogliamo riprenderci da soli. Ma continuare a 30s fissi
    // mentre il server e' in affanno lo tiene sotto carico proprio quando
    // deve rialzarsi (nei log dell'8/8: 12 minuti di 500/504 con decine di
    // schede che continuavano a interrogare). Raddoppiamo l'attesa a ogni
    // fallimento fino a un tetto di 5 minuti, e torniamo a 30s al primo esito
    // buono.
    let cicliDaSaltare = 0
    let fallimentiConsecutivi = 0
    const MAX_CICLI_SALTATI = 9 // 9 cicli saltati + 1 eseguito = 5 min

    const registraFallimento = () => {
      fallimentiConsecutivi += 1
      cicliDaSaltare = Math.min(2 ** (fallimentiConsecutivi - 1), MAX_CICLI_SALTATI)
    }

    const fetchKpi = async () => {
      // Attesa del freno: consumiamo un ciclo senza toccare la rete.
      if (cicliDaSaltare > 0) {
        cicliDaSaltare -= 1
        return
      }

      try {
        const res = await fetch("/api/kpi/email", { credentials: "include" })
        if (annullato) return

        // Prima il 401 finiva nel ramo "!res.ok" senza distinzione: la barra
        // restava in caricamento e il ciclo continuava a interrogare ogni 30s
        // all'infinito (nei log: decine di richieste fallite al minuto).
        if (res.status === 401 || res.status === 403) {
          setSessionExpired(true)
          if (interval) clearInterval(interval)
          return
        }

        if (res.ok) {
          setKpi(await res.json())
          fallimentiConsecutivi = 0
          cicliDaSaltare = 0
        } else {
          // 5xx e altri esiti non attesi: guasto del server, applichiamo il freno.
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
    // Refresh ogni 30 secondi
    interval = setInterval(fetchKpi, 30000)
    return () => {
      annullato = true
      if (interval) clearInterval(interval)
    }
  }, [])

  if (sessionExpired) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Sessione scaduta: i dati non sono aggiornati.</span>
        <a href="/admin" className="font-medium text-ha-brand-soft-foreground underline underline-offset-2">
          Accedi di nuovo
        </a>
      </div>
    )
  }

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
