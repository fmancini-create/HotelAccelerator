"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, RefreshCw, RotateCcw, CheckCircle2 } from "lucide-react"

/**
 * Pannello superadmin per recuperare le righe `price_change_log` finite in
 * "fallimento permanente" (action_taken='none', retry_count>=5,
 * next_retry_at IS NULL).
 *
 * Use case storico: l'env var NEXT_PUBLIC_APP_URL su Vercel e' stata
 * impostata senza schema https://, causando "Failed to parse URL" su 107
 * push di Tenuta Massabo'. Dopo aver corretto l'env var, le 107 righe
 * restavano permanenti perche' il sweep non le riprende mai. Da qui un
 * click ripianifica tutto.
 *
 * Flow:
 * 1. GET lista hotel con count > 0 (sample errore)
 * 2. Bottone "Recupera" per hotel apre conferma
 * 3. POST reset: il prossimo cron sweep le ripeschera' come scheduled
 *
 * NOTA: il componente si auto-nasconde se non ci sono fallimenti, cosi'
 * non appare nella UI quando il sistema e' in salute.
 */
type FailureRow = {
  id: string
  name: string
  count: number
  sampleError: string | null
}

export function PermanentFailuresPanel() {
  const [rows, setRows] = useState<FailureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<FailureRow | null>(null)
  const [lastResetMessage, setLastResetMessage] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/pricing-log/reset-permanent-failures")
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sessione scaduta. Effettua nuovamente il login.")
          return
        }
        if (res.status === 403) {
          setError("Non hai i permessi per questa operazione.")
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Errore del server (${res.status})`)
        return
      }
      const data = await res.json()
      setRows(data.hotels || [])
    } catch {
      setError("Errore di connessione al server.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleReset(target: FailureRow) {
    setResetting(target.id)
    setLastResetMessage(null)
    setConfirmTarget(null)
    try {
      const res = await fetch("/api/superadmin/pricing-log/reset-permanent-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Cap 5000 (hard cap server-side); per Massabo' 107, copre con margine.
        body: JSON.stringify({ hotelId: target.id, maxRows: 5000 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Errore del server (${res.status})`)
        return
      }
      setLastResetMessage(
        `Recuperate ${data.reset} righe per ${target.name}. Il prossimo sweep automatico (entro 15 min) le riprendera'.`,
      )
      // Reload lista per nascondere o aggiornare il count.
      await fetchData()
    } catch {
      setError("Errore di connessione durante il reset.")
    } finally {
      setResetting(null)
    }
  }

  // Loading iniziale: niente da mostrare per non aggiungere chrome inutile
  // (la pagina ha gia' il loader per gli altri pannelli).
  if (loading) return null

  // Stato sano: panel nascosto. La pagina resta pulita quando non c'e'
  // nulla da fare.
  if (!error && rows.length === 0 && !lastResetMessage) return null

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2 mt-0.5">
              <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base text-amber-900 dark:text-amber-100">
                Recupero fallimenti permanenti
              </CardTitle>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                Righe ferme con <code className="bg-amber-100/60 dark:bg-amber-900/40 px-1 rounded text-[11px]">retry_count ≥ 5</code>{" "}
                e nessun retry pianificato. Recupera dopo aver risolto la causa
                root (env var, credenziali PMS, mappatura tariffe). Il prossimo
                sweep ripartira' entro 15 minuti.
              </p>
            </div>
          </div>
          <Button
            onClick={fetchData}
            variant="ghost"
            size="sm"
            disabled={loading}
            className="gap-2 shrink-0 h-8"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {lastResetMessage && (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 dark:text-emerald-100">{lastResetMessage}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {rows.length === 0 && !error && (
          <p className="text-xs text-muted-foreground italic py-2">
            Nessun fallimento permanente al momento.
          </p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800/60 bg-card p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{row.name}</span>
                    <Badge variant="destructive" className="text-[10px] tabular-nums">
                      {row.count} {row.count === 1 ? "riga" : "righe"}
                    </Badge>
                  </div>
                  {row.sampleError && (
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                      <span className="text-amber-700 dark:text-amber-400">Ultimo errore:</span>{" "}
                      {row.sampleError}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="default"
                  disabled={resetting !== null}
                  onClick={() => setConfirmTarget(row)}
                  className="gap-2 shrink-0"
                >
                  {resetting === row.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Recupera
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confermi il recupero?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Stai per resettare{" "}
                  <strong>{confirmTarget?.count}</strong> righe in fallimento
                  permanente per <strong>{confirmTarget?.name}</strong>.
                </p>
                <p className="text-muted-foreground text-xs">
                  Verranno marcate <code>retry_count=0</code> e{" "}
                  <code>next_retry_at=now()</code>. Il prossimo cron
                  <code> /api/cron/sync-and-etl</code> (entro 15 min) le
                  riprendera' e ritentera' il push al PMS.
                </p>
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  Procedi solo se hai gia' risolto la causa root del
                  fallimento, altrimenti torneranno permanenti dopo 5 nuovi
                  tentativi (max 80 min).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget && handleReset(confirmTarget)}
            >
              Recupera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
