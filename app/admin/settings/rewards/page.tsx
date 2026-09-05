"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BadgeEuro, CheckCircle2, Coins, Save, Sparkles, Trophy, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"

type User = { id: string; name: string; email: string; role: string; kpi_enabled?: boolean }
type RewardType = "points" | "money"
type GoalUnit = "count" | "seconds" | "cents" | "percent"
type RewardRule = {
  id: string
  goalKey: string
  rewardType: RewardType
  rewardValue: number
  stretchThresholdPct: number | null
  stretchRewardValue: number | null
}
type Award = {
  id: string
  goal_key: string
  period_key: string
  period_label: string
  reward_type: RewardType
  reward_value: number
  achievement_value: number
  target_value: number
  achievement_pct: number
  status: "approved" | "settled" | "void"
  approved_at: string
  settled_at: string | null
}
type Goal = {
  goalKey: string
  label: string
  period: "workday" | "30_days"
  targetValue: number
  currentValue: number | null
  unit: GoalUnit
  direction: "at_least" | "at_most"
  achievementPct: number | null
  periodKey: string
  periodLabel: string
  rule: RewardRule | null
  rewardValueAtCurrent: number | null
  nextTier: { thresholdPct: number; rewardValue: number } | null
  currentAward: Award | null
}
type State = {
  user?: User
  measurementEnabled: boolean
  timeZone: string
  goals: Goal[]
  ledger: Award[]
}
type Draft = {
  rewardType: "" | RewardType
  value: string
  stretchEnabled: boolean
  stretchThreshold: string
  stretchValue: string
}

const EMPTY_DRAFT: Draft = {
  rewardType: "",
  value: "",
  stretchEnabled: false,
  stretchThreshold: "120",
  stretchValue: "",
}

function euro(cents: number) {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })
}

function rewardLabel(type: RewardType, value: number) {
  return type === "points" ? `${value.toLocaleString("it-IT")} pt` : euro(value)
}

function metricLabel(value: number | null, unit: GoalUnit) {
  if (value === null) return "—"
  if (unit === "cents") return euro(value)
  if (unit === "percent") return `${value}%`
  if (unit === "seconds") {
    if (value < 60) return `${value}s`
    if (value < 3600) return `${Math.round(value / 60)} min`
    return `${(value / 3600).toFixed(1)} h`
  }
  return value.toLocaleString("it-IT")
}

function toDraft(rule: RewardRule | null): Draft {
  if (!rule) return { ...EMPTY_DRAFT }
  const money = rule.rewardType === "money"
  return {
    rewardType: rule.rewardType,
    value: String(money ? rule.rewardValue / 100 : rule.rewardValue),
    stretchEnabled: rule.stretchThresholdPct !== null && rule.stretchRewardValue !== null,
    stretchThreshold: String(rule.stretchThresholdPct ?? 120),
    stretchValue: rule.stretchRewardValue === null ? "" : String(money ? rule.stretchRewardValue / 100 : rule.stretchRewardValue),
  }
}

function stateDrafts(state: State) {
  return Object.fromEntries(state.goals.map((goal) => [goal.goalKey, toDraft(goal.rule)])) as Record<string, Draft>
}

export default function RewardsSettingsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [state, setState] = useState<State | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingState, setLoadingState] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const selected = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId])

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Impossibile leggere gli utenti")
        const list = (body.users ?? []) as User[]
        setUsers(list)
        setSelectedUserId(list[0]?.id ?? "")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossibile leggere gli utenti")
      } finally {
        setLoadingUsers(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!selectedUserId) return
    let cancelled = false
    setLoadingState(true)
    setMessage("")
    setError("")
    ;(async () => {
      try {
        const response = await fetch(`/api/admin/operator-rewards?userId=${encodeURIComponent(selectedUserId)}`, { cache: "no-store" })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Impossibile leggere i premi")
        if (!cancelled) {
          setState(body)
          setDrafts(stateDrafts(body))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Impossibile leggere i premi")
      } finally {
        if (!cancelled) setLoadingState(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedUserId])

  function patchDraft(goalKey: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [goalKey]: { ...(current[goalKey] ?? EMPTY_DRAFT), ...patch },
    }))
  }

  function amountToStored(type: RewardType, raw: string) {
    const n = Number(raw.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) throw new Error("Inserisci un valore premio positivo")
    if (type === "points") {
      if (!Number.isInteger(n)) throw new Error("I punti devono essere un numero intero")
      return n
    }
    return Math.round(n * 100)
  }

  async function saveRule(goal: Goal) {
    const draft = drafts[goal.goalKey] ?? EMPTY_DRAFT
    setSavingKey(goal.goalKey)
    setMessage("")
    setError("")
    try {
      const rule = draft.rewardType
        ? {
            rewardType: draft.rewardType,
            rewardValue: amountToStored(draft.rewardType, draft.value),
            stretchThresholdPct: draft.stretchEnabled ? Number(draft.stretchThreshold) : null,
            stretchRewardValue: draft.stretchEnabled ? amountToStored(draft.rewardType, draft.stretchValue) : null,
          }
        : null
      const response = await fetch("/api/admin/operator-rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, goalKey: goal.goalKey, rule }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Salvataggio non riuscito")
      const next = body.state as State
      setState(next)
      setDrafts(stateDrafts(next))
      setMessage(rule ? `Premio aggiornato per “${goal.label}”.` : `Premio disattivato per “${goal.label}”.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito")
    } finally {
      setSavingKey(null)
    }
  }

  async function rewardAction(action: "confirm" | "settle", data: { goalKey?: string; ledgerId?: string }) {
    const key = data.ledgerId || data.goalKey || action
    setActingId(key)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/admin/operator-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: selectedUserId, ...data }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Operazione non riuscita")
      const next = body.state as State
      setState(next)
      setDrafts(stateDrafts(next))
      setMessage(action === "confirm" ? "Premio confermato e registrato nel ledger." : "Premio economico segnato come liquidato.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione non riuscita")
    } finally {
      setActingId(null)
    }
  }

  if (loadingUsers) {
    return <main className="mx-auto max-w-6xl p-6"><div className="h-32 animate-pulse rounded-xl bg-muted" /></main>
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/settings/dashboard" className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-ha-brand">
            <ArrowLeft className="h-3.5 w-3.5" /> Obiettivi e dashboard utenti
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ha-brand">Motivazione operatori</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl"><Trophy className="h-7 w-7 text-ha-brand" /> Premi sugli obiettivi</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Associa a ogni obiettivo misurabile un premio in punti o denaro. Il sistema mostra all'utente quanto manca, ma l'accredito viene sempre confermato da un amministratore.
          </p>
        </div>
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {message && <div className="mb-5 rounded-lg border border-ha-success/30 bg-ha-success-soft p-3 text-sm text-ha-success-soft-foreground">{message}</div>}

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Coins className="h-4 w-4 text-ha-brand" /> Punti</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Sono un credito motivazionale interno. Alla conferma admin vengono accreditati subito nel saldo punti dell'utente.</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><BadgeEuro className="h-4 w-4 text-ha-brand" /> Denaro</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">La conferma crea un premio approvato. Nessun pagamento parte da HotelAccelerator: l'admin lo marca liquidato solo dopo il pagamento reale.</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-ha-brand" /> Livello extra</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Facoltativo: puoi aumentare il premio, per esempio al 120%. Il valore extra è il premio totale del livello superiore.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-xl border bg-card p-3 lg:sticky lg:top-4">
          <div className="mb-2 flex items-center gap-2 px-2 py-1 text-sm font-medium"><Users className="h-4 w-4 text-ha-brand" /> Utenti</div>
          <div className="max-h-[70vh] space-y-1 overflow-auto">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedUserId === user.id ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "hover:bg-muted"}`}
              >
                <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">{selected ? `Premi di ${selected.name || selected.email}` : "Premi individuali"}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Ogni premio usa esattamente lo stesso dato e lo stesso target già configurati nella dashboard dell'utente.</p>
              </div>
              <Link href="/admin/settings/dashboard" className="text-xs font-medium text-ha-brand hover:underline">Modifica obiettivi</Link>
            </div>

            {loadingState ? (
              <div className="mt-5 h-32 animate-pulse rounded-xl bg-muted" />
            ) : !state ? null : state.goals.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Non ci sono obiettivi configurati per questo utente. Imposta prima almeno un target in <Link href="/admin/settings/dashboard" className="font-medium text-ha-brand hover:underline">Dashboard utenti</Link>.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {!state.measurementEnabled ? (
                  <div className="rounded-lg border border-ha-warning/30 bg-ha-warning-soft p-3 text-xs text-ha-warning-soft-foreground">
                    I KPI personali di questo utente non sono attivi. Puoi preparare le regole premio, ma nessun risultato verrà confermato finché la misurazione resta disattivata.
                  </div>
                ) : null}

                {state.goals.map((goal) => {
                  const draft = drafts[goal.goalKey] ?? EMPTY_DRAFT
                  const pct = goal.achievementPct
                  const achievedValue = goal.rewardValueAtCurrent
                  const award = goal.currentAward
                  const canConfirm = Boolean(goal.rule && achievedValue !== null && (!award || achievedValue > award.reward_value))
                  const settledMoneyBlocksUpgrade = Boolean(award?.reward_type === "money" && award.status === "settled" && achievedValue !== null && achievedValue > award.reward_value)
                  return (
                    <div key={goal.goalKey} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">{goal.label}</h3>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{goal.periodLabel}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Target: {metricLabel(goal.targetValue, goal.unit)}</p>
                        </div>
                        <div className="min-w-[190px] text-right">
                          <div className="text-lg font-semibold tabular-nums">{metricLabel(goal.currentValue, goal.unit)}</div>
                          <div className="text-xs text-muted-foreground">{pct === null ? "non misurabile" : `${pct}% del target`}</div>
                        </div>
                      </div>
                      <Progress value={Math.min(100, pct ?? 0)} className="mt-3 h-1.5" />

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-1.5 text-xs">
                          <span className="font-medium">Tipo premio</span>
                          <select
                            value={draft.rewardType}
                            onChange={(e) => patchDraft(goal.goalKey, { rewardType: e.target.value as Draft["rewardType"] })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Nessun premio</option>
                            <option value="points">Punti</option>
                            <option value="money">Euro</option>
                          </select>
                        </label>
                        <label className="space-y-1.5 text-xs">
                          <span className="font-medium">Premio al 100% {draft.rewardType === "money" ? "(€)" : draft.rewardType === "points" ? "(pt)" : ""}</span>
                          <Input
                            type="number"
                            min={draft.rewardType === "money" ? 0.01 : 1}
                            step={draft.rewardType === "money" ? "0.01" : "1"}
                            disabled={!draft.rewardType}
                            value={draft.value}
                            onChange={(e) => patchDraft(goal.goalKey, { value: e.target.value })}
                            placeholder={draft.rewardType === "money" ? "Es. 50" : "Es. 100"}
                          />
                        </label>
                        <div className="rounded-lg border bg-muted/20 p-3 xl:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium">Livello extra</p>
                              <p className="text-[10px] text-muted-foreground">Premio superiore oltre il 100%</p>
                            </div>
                            <Switch
                              checked={draft.stretchEnabled}
                              disabled={!draft.rewardType}
                              onCheckedChange={(checked) => patchDraft(goal.goalKey, { stretchEnabled: checked })}
                              aria-label={`Livello extra ${goal.label}`}
                            />
                          </div>
                          {draft.stretchEnabled ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <label className="space-y-1 text-[10px] text-muted-foreground">
                                Soglia %
                                <Input type="number" min={101} max={300} value={draft.stretchThreshold} onChange={(e) => patchDraft(goal.goalKey, { stretchThreshold: e.target.value })} />
                              </label>
                              <label className="space-y-1 text-[10px] text-muted-foreground">
                                Premio totale
                                <Input type="number" min={1} step={draft.rewardType === "money" ? "0.01" : "1"} value={draft.stretchValue} onChange={(e) => patchDraft(goal.goalKey, { stretchValue: e.target.value })} />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                          {award ? (
                            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-ha-success" />
                              {award.reward_type === "points"
                                ? `${rewardLabel("points", award.reward_value)} accreditati`
                                : award.status === "settled"
                                  ? `${rewardLabel("money", award.reward_value)} liquidati`
                                  : `${rewardLabel("money", award.reward_value)} approvati, da liquidare`}
                            </span>
                          ) : goal.rule && achievedValue !== null ? (
                            <span>Premio raggiunto: <strong className="text-foreground">{rewardLabel(goal.rule.rewardType, achievedValue)}</strong></span>
                          ) : goal.rule && goal.nextTier ? (
                            <span>Prossimo premio: <strong className="text-foreground">{rewardLabel(goal.rule.rewardType, goal.nextTier.rewardValue)}</strong> al {goal.nextTier.thresholdPct}%</span>
                          ) : (
                            <span>Salva una regola per rendere visibile il premio all'utente.</span>
                          )}
                          {settledMoneyBlocksUpgrade ? <span className="mt-1 block text-ha-warning-soft-foreground">Il denaro è già liquidato: il livello superiore richiede una rettifica manuale.</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => saveRule(goal)} disabled={savingKey === goal.goalKey} className="gap-2">
                            <Save className="h-3.5 w-3.5" /> {savingKey === goal.goalKey ? "Salvo..." : "Salva premio"}
                          </Button>
                          {canConfirm && !settledMoneyBlocksUpgrade ? (
                            <Button size="sm" onClick={() => rewardAction("confirm", { goalKey: goal.goalKey })} disabled={actingId === goal.goalKey} className="gap-2">
                              <Trophy className="h-3.5 w-3.5" /> {award ? "Aggiorna premio" : "Conferma premio"}
                            </Button>
                          ) : null}
                          {award?.reward_type === "money" && award.status === "approved" ? (
                            <Button size="sm" variant="outline" onClick={() => rewardAction("settle", { ledgerId: award.id })} disabled={actingId === award.id} className="gap-2">
                              <BadgeEuro className="h-3.5 w-3.5" /> Segna liquidato
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {state?.ledger?.length ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-base font-semibold">Storico premi</h2>
              <p className="mt-1 text-xs text-muted-foreground">Registro dei premi confermati. Le regole possono cambiare, ma il valore già registrato resta fotografato nel ledger.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="border-b text-muted-foreground">
                    <tr><th className="py-2 pr-3 font-medium">Ciclo</th><th className="py-2 pr-3 font-medium">Obiettivo</th><th className="py-2 pr-3 font-medium">Risultato</th><th className="py-2 pr-3 font-medium">Premio</th><th className="py-2 font-medium">Stato</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {state.ledger.map((row) => (
                      <tr key={row.id} className={row.status === "void" ? "opacity-50" : ""}>
                        <td className="py-3 pr-3">{row.period_label}</td>
                        <td className="py-3 pr-3">{state.goals.find((goal) => goal.goalKey === row.goal_key)?.label ?? row.goal_key}</td>
                        <td className="py-3 pr-3 font-medium">{row.achievement_pct}%</td>
                        <td className="py-3 pr-3 font-semibold">{rewardLabel(row.reward_type, row.reward_value)}</td>
                        <td className="py-3">
                          {row.status === "settled" ? "Accreditato / liquidato" : row.status === "approved" ? "Approvato" : "Annullato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
