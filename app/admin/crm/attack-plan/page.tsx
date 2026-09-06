"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Flag, RefreshCw, Save, Target, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type PlanAction = { id: string; text: string; done: boolean }
type PlanDay = {
  id: string
  day_number: number
  plan_date: string
  phase: string
  objective: string
  actions: PlanAction[]
  kpi_target: string
  avoid_today: string
  notes: string | null
  status: "open" | "done" | "skipped"
  completed_at: string | null
}

type Payload = { days: PlanDay[]; today: PlanDay | null; today_date: string }

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  )
}

export default function AttackPlanPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/crm/attack-plan", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Impossibile caricare il piano")
      const next = body as Payload
      setPayload(next)
      setSelectedId((current) => current || next.today?.id || next.days[0]?.id || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile caricare il piano")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => payload?.days.find((day) => day.id === selectedId) ?? payload?.today ?? null,
    [payload, selectedId],
  )

  useEffect(() => {
    setNotes(selected?.notes || "")
  }, [selected?.id, selected?.notes])

  const completedDays = payload?.days.filter((day) => day.status === "done").length ?? 0
  const completedActions = payload?.days.reduce((sum, day) => sum + day.actions.filter((action) => action.done).length, 0) ?? 0
  const totalActions = payload?.days.reduce((sum, day) => sum + day.actions.length, 0) ?? 0

  async function patch(dayId: string, body: Record<string, unknown>, key: string) {
    setSaving(key)
    setError(null)
    try {
      const response = await fetch("/api/admin/crm/attack-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_id: dayId, ...body }),
      })
      const updated = await response.json()
      if (!response.ok) throw new Error(updated.error || "Salvataggio non riuscito")
      setPayload((current) =>
        current
          ? {
              ...current,
              days: current.days.map((day) => (day.id === updated.id ? updated : day)),
              today: current.today?.id === updated.id ? updated : current.today,
            }
          : current,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito")
    } finally {
      setSaving(null)
    }
  }

  if (loading && !payload) {
    return <div className="py-16 text-center text-muted-foreground">Caricamento piano d'attacco...</div>
  }

  if (!payload || payload.days.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Piano d'attacco 30 giorni</CardTitle>
          <CardDescription>Il piano non e configurato per questo tenant.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Piano d'attacco 30 giorni</h1>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Ogni giorno poche cose da fare, un numero da battere e una cosa da non fare. Prima stabilita e vendite, poi il resto.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Giorni completati</p>
            <p className="mt-1 text-3xl font-bold">{completedDays}/30</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Azioni completate</p>
            <p className="mt-1 text-3xl font-bold">{completedActions}/{totalActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Oggi</p>
            <p className="mt-1 text-lg font-bold">
              {payload.today ? `Giorno ${payload.today.day_number} · ${formatDate(payload.today.plan_date)}` : "Nessuna azione prevista"}
            </p>
          </CardContent>
        </Card>
      </div>

      {selected && (
        <Card className={payload.today?.id === selected.id ? "border-foreground/20" : undefined}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selected.status === "done" ? "default" : "secondary"}>Giorno {selected.day_number}</Badge>
              <span className="text-sm text-muted-foreground">{formatDate(selected.plan_date)}</span>
              <Badge variant="outline">{selected.phase}</Badge>
              {payload.today?.id === selected.id && <Badge>OGGI</Badge>}
            </div>
            <CardTitle className="pt-2">{selected.objective}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="font-semibold">Cose da fare</p>
              {selected.actions.map((action) => {
                const key = `${selected.id}:${action.id}`
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => void patch(selected.id, { action_id: action.id, done: !action.done }, key)}
                    disabled={saving === key}
                    className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
                  >
                    {action.done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={action.done ? "text-muted-foreground line-through" : ""}>{action.text}</span>
                  </button>
                )
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 font-semibold"><Flag className="h-4 w-4" /> Numero da battere oggi</div>
                <p className="mt-2 text-sm leading-6">{selected.kpi_target}</p>
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" /> Oggi NON fare</div>
                <p className="mt-2 text-sm leading-6">{selected.avoid_today}</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold" htmlFor="attack-plan-notes">Note della giornata</label>
              <Textarea
                id="attack-plan-notes"
                className="mt-2 min-h-24"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Cosa e successo? Cosa abbiamo imparato?"
              />
              <Button
                className="mt-2"
                variant="outline"
                onClick={() => void patch(selected.id, { notes }, `${selected.id}:notes`)}
                disabled={saving === `${selected.id}:notes`}
              >
                <Save className="mr-2 h-4 w-4" /> Salva note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">I 30 giorni</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {payload.days.map((day) => {
            const done = day.actions.filter((action) => action.done).length
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelectedId(day.id)}
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === day.id ? "ring-1 ring-foreground/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Giorno {day.day_number}</span>
                  {day.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs text-muted-foreground">{done}/{day.actions.length}</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(day.plan_date)} · {day.phase}</p>
                <p className="mt-2 line-clamp-2 text-sm">{day.objective}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
