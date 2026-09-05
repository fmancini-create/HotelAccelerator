"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, History, RefreshCw, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type User = { id: string; name: string; email: string }
type ReviewRow = {
  id: string
  user_id: string | null
  quote_sent_at: string | null
  closed_at: string | null
  amount_cents: number | null
  confidence: number
  operatorName: string | null
  contactName: string | null
  subject: string | null
}
type Snapshot = {
  summary: {
    totalRequests: number
    scanned: number
    unscanned: number
    confirmed: number
    needs_review: number
    unattributed: number
    rejected: number
  }
  review: ReviewRow[]
}

function euro(cents: number | null) {
  if (!cents) return "—"
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })
}

export function SalesAttributionAdmin({ users }: { users: User[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<string>("")
  const [error, setError] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError("")
    try {
      const response = await fetch("/api/admin/crm/sales-attribution", { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile leggere l'attribuzione commerciale")
      const next = body as Snapshot
      setSnapshot(next)
      setSelectedUsers((current) => {
        const copy = { ...current }
        for (const row of next.review) if (!copy[row.id] && row.user_id) copy[row.id] = row.user_id
        return copy
      })
      setAmounts((current) => {
        const copy = { ...current }
        for (const row of next.review) {
          if (copy[row.id] === undefined) copy[row.id] = row.amount_cents ? String(row.amount_cents / 100) : ""
        }
        return copy
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile leggere l'attribuzione commerciale")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = snapshot?.summary
  const percent = useMemo(() => {
    if (!summary?.totalRequests) return 0
    return Math.min(100, Math.round((summary.scanned / summary.totalRequests) * 100))
  }, [summary])

  async function scanHistory() {
    setScanning(true)
    setError("")
    setScanProgress("Avvio analisi…")
    let offset = 0
    let safety = 0
    try {
      while (safety < 500) {
        safety += 1
        const response = await fetch("/api/admin/crm/sales-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || "Analisi storico non riuscita")
        offset = body.nextOffset ?? offset
        setScanProgress(`${Math.min(offset, body.total ?? offset)} / ${body.total ?? "?"} richieste analizzate`)
        if (body.done) break
      }
      await load()
      setScanProgress("Analisi completata")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi storico non riuscita")
    } finally {
      setScanning(false)
    }
  }

  async function review(row: ReviewRow, status: "confirmed" | "rejected") {
    const userId = selectedUsers[row.id] || row.user_id || null
    if (status === "confirmed" && !userId) {
      setError("Seleziona un operatore prima di confermare l'attribuzione.")
      return
    }
    const rawAmount = (amounts[row.id] ?? "").trim().replace(",", ".")
    let amountCents: number | null = null
    if (rawAmount) {
      const euros = Number(rawAmount)
      if (!Number.isFinite(euros) || euros <= 0) {
        setError("Il valore della trattativa non è valido.")
        return
      }
      amountCents = Math.round(euros * 100)
    }

    setSavingId(row.id)
    setError("")
    try {
      const response = await fetch("/api/admin/crm/sales-attribution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          userId: status === "confirmed" ? userId : row.user_id,
          verificationStatus: status,
          amountCents,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Aggiornamento non riuscito")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aggiornamento non riuscito")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            <History className="h-5 w-5 text-ha-brand" /> Recupero storico trattative
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Analizza i thread Gmail collegati alle richieste CRM per ricostruire chi ha inviato il preventivo e, quando c'è una conferma esplicita del cliente, chiudere retroattivamente la trattativa. Le mail inviate non vengono importate nella Inbox.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void scanHistory()} disabled={scanning} className="shrink-0 gap-2">
          <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Analisi in corso" : "Analizza storico commerciale"}
        </Button>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Analizzate" value={loading ? "…" : `${summary?.scanned ?? 0}/${summary?.totalRequests ?? 0}`} note={`${percent}% storico`} />
        <Stat label="Confermate" value={loading ? "…" : String(summary?.confirmed ?? 0)} note="entrano nei KPI" />
        <Stat label="Da verificare" value={loading ? "…" : String(summary?.needs_review ?? 0)} note="non ancora conteggiate" />
        <Stat label="Non attribuite" value={loading ? "…" : String(summary?.unattributed ?? 0)} note="nessuna evidenza sufficiente" />
        <Stat label="Da analizzare" value={loading ? "…" : String(summary?.unscanned ?? 0)} note={scanProgress || "storico residuo"} />
      </div>

      {(snapshot?.review.length ?? 0) > 0 ? (
        <div className="mt-5 border-t pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-ha-brand" /> Attribuzioni da verificare</div>
          <p className="mt-1 text-xs text-muted-foreground">Finché non le confermi, queste righe non modificano le performance dell'operatore.</p>
          <div className="mt-3 space-y-3">
            {snapshot!.review.map((row) => (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.contactName || "Contatto senza nome"}</div>
                    <div className="truncate text-xs text-muted-foreground">{row.subject || "Conversazione senza oggetto"}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Confidenza {row.confidence}% · {row.closed_at ? "segnale di chiusura trovato" : "preventivo attribuito, nessuna chiusura certa"} · valore {euro(row.amount_cents)}
                    </div>
                  </div>
                  <select
                    value={selectedUsers[row.id] ?? row.user_id ?? ""}
                    onChange={(e) => setSelectedUsers((current) => ({ ...current, [row.id]: e.target.value }))}
                    className="h-9 min-w-48 rounded-md border bg-background px-3 text-sm"
                    aria-label="Operatore attribuito"
                  >
                    <option value="">Seleziona operatore</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
                  </select>
                  <Input
                    value={amounts[row.id] ?? ""}
                    onChange={(e) => setAmounts((current) => ({ ...current, [row.id]: e.target.value }))}
                    className="w-32"
                    inputMode="decimal"
                    placeholder="Valore €"
                    aria-label="Valore trattativa in euro"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="gap-1" disabled={savingId === row.id} onClick={() => void review(row, "confirmed")}>
                      <Check className="h-4 w-4" /> Conferma
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-1" disabled={savingId === row.id} onClick={() => void review(row, "rejected")}>
                      <X className="h-4 w-4" /> Scarta
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>
    </div>
  )
}
