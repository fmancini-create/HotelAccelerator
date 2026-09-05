"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Play, RefreshCw, UserRoundCheck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Prospect = {
  id: string
  full_name: string | null
  job_title: string | null
  organization_name: string | null
  city: string | null
  country: string | null
  email: string | null
  status: string
  lead_score: number | null
  sales_stage: string | null
  next_action: string | null
  next_action_at: string | null
  outreach_paused: boolean | null
  assigned_at: string | null
}

type Payload = {
  currentUserId: string | null
  prospects: Prospect[]
  summary: { assigned: number; due: number }
}

const actionLabels: Record<string, string> = {
  linkedin_invite: "Richiesta LinkedIn",
  linkedin_check: "Controllo LinkedIn",
  linkedin_message: "Messaggio LinkedIn",
  email_intro: "Prima email",
  email_followup: "Follow-up email",
  call: "Chiamata",
  review: "Revisione",
}

export function ScoutAssignedWorkPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/crm/scout/assigned", { cache: "no-store" })
      if (!response.ok) return
      const payload = await response.json()
      setData(payload as Payload)
    } catch {
      // The normal prospecting page remains available even if this secondary queue fails.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const start = async (prospect: Prospect) => {
    setBusyId(prospect.id)
    try {
      const response = await fetch("/api/admin/crm/prospecting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", prospectId: prospect.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Avvio lavorazione non riuscito")
      toast.success("Prospect inserito nelle attività operative")
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Avvio lavorazione non riuscito")
      setBusyId("")
    }
  }

  if (loading && !data) {
    return <div className="mb-4 flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  }
  if (!data?.currentUserId || data.prospects.length === 0) return null

  return (
    <section className="mb-6" aria-label="Prospect assegnati a me">
      <Card className="border-ha-brand/20">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-5 w-5 text-ha-brand" aria-hidden />
                <CardTitle className="text-lg">Prospect assegnati a te</CardTitle>
                <Badge variant="secondary">{data.summary.assigned}</Badge>
                {data.summary.due > 0 && <Badge>{data.summary.due} da fare ora</Badge>}
              </div>
              <CardDescription className="mt-1">
                Questa è la tua coda commerciale. Non serve il permesso Scout per lavorare un prospect che un admin o un capogruppo ti ha assegnato.
              </CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 lg:grid-cols-2">
            {data.prospects.slice(0, 12).map((prospect) => {
              const due = prospect.next_action_at ? new Date(prospect.next_action_at).getTime() <= Date.now() : false
              return (
                <div key={prospect.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{prospect.full_name || "Prospect Scout"}</span>
                      <Badge variant="outline">Score {Number(prospect.lead_score || 0)}</Badge>
                      {prospect.outreach_paused && <Badge variant="outline">In pausa</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[prospect.job_title, prospect.organization_name, prospect.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {prospect.next_action && (
                      <p className={`mt-1 text-xs ${due ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        Prossima: {actionLabels[prospect.next_action] || prospect.next_action}{due ? " · da fare ora" : ""}
                      </p>
                    )}
                  </div>
                  {!prospect.next_action && !prospect.outreach_paused ? (
                    <Button size="sm" onClick={() => void start(prospect)} disabled={busyId === prospect.id}>
                      {busyId === prospect.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Avvia lavorazione
                    </Button>
                  ) : (
                    <Badge variant={due ? "default" : "secondary"}>{due ? "Operativa" : "In lavorazione"}</Badge>
                  )}
                </div>
              )
            })}
          </div>
          {data.prospects.length > 12 && (
            <p className="mt-3 text-xs text-muted-foreground">Mostrati i primi 12 di {data.prospects.length} prospect assegnati.</p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
