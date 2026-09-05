"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, PhoneCall, PhoneIncoming, RefreshCw, UserCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"

type AlertItem = {
  id: string
  number: string | null
  startedAt: string | null
  endedAt: string | null
  extension: string | null
  extensionLabel: string | null
  contactName: string | null
  status: "pending" | "in_progress"
  assignedTo: string | null
  assignedToName: string | null
  visibleAfter: string | null
}

type Payload = { items: AlertItem[]; count: number }

function when(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function displayNumber(value: string | null) {
  if (!value) return "Numero sconosciuto"
  return value.replace(/^00(?=\d)/, "+")
}

export function CallAlertsPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/telephony/call-alerts", { cache: "no-store" })
      if (response.status === 401 || response.status === 403 || response.status === 400) {
        setData({ items: [], count: 0 })
        return
      }
      if (!response.ok) throw new Error("call_alerts_unavailable")
      setData((await response.json()) as Payload)
    } catch {
      // La dashboard non deve diventare inutilizzabile se il pannello telefono e' in degrado.
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const act = useCallback(
    async (callId: string, action: "claim" | "resolve" | "dismiss" | "release") => {
      setActing(`${callId}:${action}`)
      try {
        const response = await fetch("/api/telephony/call-alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: callId, action }),
        })
        if (response.ok || response.status === 409) await load()
      } finally {
        setActing(null)
      }
    },
    [load],
  )

  if (loading || !data || data.count === 0) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 lg:px-8" aria-live="polite">
      <section className="overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/[0.035] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-destructive/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <PhoneIncoming className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Chiamate da richiamare <span className="text-destructive">· {data.count}</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mostriamo solo chiamate non recuperate dopo il passaggio tra code, per evitare falsi allarmi.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Aggiorna avvisi telefonici">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Aggiorna
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/calls">Registro chiamate</Link>
            </Button>
          </div>
        </div>

        <div className="divide-y divide-destructive/10">
          {data.items.slice(0, 5).map((item) => {
            const title = item.contactName || displayNumber(item.number)
            const tel = item.number ? `tel:${item.number.replace(/[^+\d]/g, "")}` : null
            const busy = acting?.startsWith(`${item.id}:`) ?? false
            return (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{title}</span>
                    {item.contactName && item.number && (
                      <span className="text-xs tabular-nums text-muted-foreground">{displayNumber(item.number)}</span>
                    )}
                    {item.status === "in_progress" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ha-warning-soft px-2 py-0.5 text-[10px] font-semibold text-ha-warning-soft-foreground">
                        <UserCheck className="h-3 w-3" aria-hidden="true" />
                        In carico{item.assignedToName ? ` a ${item.assignedToName}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Persa {when(item.startedAt)}
                    {item.extensionLabel ? ` · ${item.extensionLabel}` : item.extension ? ` · interno ${item.extension}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {item.status === "pending" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(item.id, "claim")}>
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Prendi in carico
                    </Button>
                  )}
                  {item.status === "in_progress" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(item.id, "release")}>
                      Rilascia
                    </Button>
                  )}
                  {tel && (
                    <Button asChild size="sm">
                      <a href={tel}>
                        <PhoneCall className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Richiama
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(item.id, "resolve")}>
                    <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Risolta
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(item.id, "dismiss")}
                    aria-label="Ignora questa chiamata"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
