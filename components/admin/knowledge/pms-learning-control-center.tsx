"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BrainCircuit,
  Check,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/use-toast"

type BaseOption = { id: string; name: string }
type ReviewStatus = "pending" | "approved" | "rejected"

type Procedure = {
  id: string
  pms_type: string
  title: string
  occurrences: number
  risk: "basso" | "medio" | "alto"
  status: "osservata" | "proposta" | "autonoma" | "bloccata"
  autonomy_threshold: number
  steps_summary: Array<{ azione?: string; etichetta?: string | null; percorso?: string | null; natura?: string | null }>
  first_seen_at: string
  last_seen_at: string
  review_status: ReviewStatus
  reviewed_at: string | null
  knowledge_base_ids: string[]
}

type Activity = {
  key: string
  title: string
  operator: string
  occurrences: number
  steps: number
  lastAt: string | null
  reviewStatus: ReviewStatus | null
  risk: "basso" | "medio" | "alto" | null
}

type Payload = {
  coverage: {
    unknownPercent: number
    knownPercent: number
    sample: "empty" | "partial" | "sufficient"
    observedProcedures: number
    approvedProcedures: number
    pendingProcedures: number
    rejectedProcedures: number
  }
  usage: {
    averageMinutesPerSession30d: number
    sessions30d: number
    todayMinutes: number
    todaySessions: number
    unobservableTodayMinutes: number
  }
  activities: Activity[]
  procedures: Procedure[]
  timezone: string
}

function timeText(iso: string | null, timezone: string) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("it-IT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

function riskLabel(risk: Procedure["risk"] | null) {
  return risk === "alto" ? "Rischio alto" : risk === "medio" ? "Rischio medio" : "Rischio basso"
}

export function PmsLearningControlCenter({ bases }: { bases: BaseOption[] }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedBases, setSelectedBases] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/ai/pms-learning", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Caricamento PMS non riuscito")
      setData(body)
    } catch (error) {
      toast({
        title: "Impossibile leggere l'apprendimento PMS",
        description: error instanceof Error ? error.message : "Errore",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pending = useMemo(() => data?.procedures.filter((p) => p.review_status === "pending") ?? [], [data])

  async function decide(procedure: Procedure, action: "approve" | "reject") {
    setBusy(procedure.id)
    try {
      const response = await fetch("/api/admin/ai/pms-learning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          procedureId: procedure.id,
          action,
          knowledgeBaseIds: selectedBases[procedure.id] ?? procedure.knowledge_base_ids ?? [],
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Decisione non salvata")
      toast({
        title: action === "approve" ? "Procedura approvata" : "Procedura rifiutata",
        description:
          action === "approve"
            ? "L'IA può considerarla conoscenza valida. L'autonomia operativa resta separata."
            : "La procedura è bloccata e non viene considerata conoscenza valida.",
      })
      await load()
    } catch (error) {
      toast({ title: "Operazione non riuscita", description: error instanceof Error ? error.message : "Errore", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <Card id="pms-learning">
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Lettura dell&apos;apprendimento PMS…
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const sampleText =
    data.coverage.sample === "empty"
      ? "Nessuna attività PMS osservata: il 100% non è una stima delle funzioni del PMS, ma assenza di evidenze."
      : data.coverage.sample === "partial"
        ? "Campione ancora parziale: la percentuale riguarda solo le attività osservate."
        : "Campione osservato sufficiente per usare la metrica come indicatore operativo."

  return (
    <section id="pms-learning" className="space-y-4" aria-labelledby="pms-learning-title">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-0.5 h-5 w-5 text-ha-brand" aria-hidden />
              <div>
                <CardTitle id="pms-learning-title" className="text-base">Conoscenza operativa del PMS</CardTitle>
                <CardDescription className="mt-1 max-w-3xl leading-relaxed">
                  HotelAccelerator osserva la forma delle operazioni svolte nel browser PMS senza memorizzare ciò che viene digitato. Qui approvi ciò che l&apos;IA ha imparato e controlli quanto dell&apos;uso osservato è realmente consolidato.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Sconoscenza PMS osservata</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{data.coverage.unknownPercent}%</p>
              <Progress className="mt-3" value={data.coverage.knownPercent} aria-label={`Conoscenza PMS osservata ${data.coverage.knownPercent}%`} />
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Uso medio PMS</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{data.usage.averageMinutesPerSession30d} min</p>
              <p className="mt-2 text-xs text-muted-foreground">per sessione · ultimi 30 giorni · {data.usage.sessions30d} sessioni</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Uso di oggi</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{data.usage.todayMinutes} min</p>
              <p className="mt-2 text-xs text-muted-foreground">{data.usage.todaySessions} sessioni in primo piano</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground">Procedure osservate</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{data.coverage.observedProcedures}</p>
              <p className="mt-2 text-xs text-muted-foreground">{data.coverage.approvedProcedures} approvate · {data.coverage.pendingProcedures} da rivedere</p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{sampleText}</p>
          {data.usage.unobservableTodayMinutes > 0 ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Oggi {data.usage.unobservableTodayMinutes} minuti sono avvenuti nel fallback diretto: il tempo è misurato, ma quelle operazioni non sono osservabili dal browser remoto e quindi non alimentano l&apos;apprendimento.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Da approvare</CardTitle>
            <CardDescription>
              Una procedura ripetuta non diventa autonoma da sola. Approvazione della conoscenza e permesso operativo restano separati.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nessuna procedura PMS in attesa di revisione.</div>
            ) : (
              <ul className="space-y-4">
                {pending.map((procedure) => {
                  const chosen = selectedBases[procedure.id] ?? procedure.knowledge_base_ids ?? []
                  return (
                    <li key={procedure.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{procedure.title}</p>
                        <Badge variant="outline">{procedure.occurrences} volte</Badge>
                        <Badge variant="outline">{riskLabel(procedure.risk)}</Badge>
                      </div>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-muted-foreground">Vedi passaggi osservati</summary>
                        <ol className="mt-2 space-y-1 pl-5 text-xs text-muted-foreground">
                          {(procedure.steps_summary ?? []).map((step, index) => (
                            <li key={`${procedure.id}-${index}`} className="list-decimal">
                              {step.azione ?? "azione"}{step.etichetta ? ` — ${step.etichetta}` : ""}{step.percorso ? ` · ${step.percorso}` : ""}
                            </li>
                          ))}
                        </ol>
                      </details>

                      {bases.length > 0 ? (
                        <fieldset className="mt-4 space-y-2">
                          <legend className="text-xs font-medium">Aggiungi anche come documentazione alle basi di conoscenza</legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {bases.map((base) => {
                              const checked = chosen.includes(base.id)
                              return (
                                <div key={base.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`pms-${procedure.id}-${base.id}`}
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      setSelectedBases((current) => ({
                                        ...current,
                                        [procedure.id]: value
                                          ? [...new Set([...chosen, base.id])]
                                          : chosen.filter((id) => id !== base.id),
                                      }))
                                    }
                                  />
                                  <Label htmlFor={`pms-${procedure.id}-${base.id}`} className="text-xs font-normal">{base.name}</Label>
                                </div>
                              )
                            })}
                          </div>
                        </fieldset>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void decide(procedure, "approve")} disabled={busy === procedure.id}>
                          {busy === procedure.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />}
                          Approva apprendimento
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void decide(procedure, "reject")} disabled={busy === procedure.id}>
                          <X className="mr-2 h-4 w-4" aria-hidden />
                          Rifiuta
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attività PMS di oggi</CardTitle>
            <CardDescription>Attività osservate e raggruppate per procedura e operatore. Fuso orario: {data.timezone}.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activities.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Clock3 className="h-6 w-6" aria-hidden />
                Nessuna attività PMS osservata oggi.
              </div>
            ) : (
              <ul className="space-y-3">
                {data.activities.map((activity) => (
                  <li key={activity.key} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{activity.title}</p>
                        {activity.occurrences > 1 ? <Badge variant="secondary">×{activity.occurrences}</Badge> : null}
                        {activity.reviewStatus === "approved" ? <Sparkles className="h-3.5 w-3.5 text-ha-brand" aria-label="Apprendimento approvato" /> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.operator} · {activity.steps} passaggi osservati</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{timeText(activity.lastAt, data.timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
