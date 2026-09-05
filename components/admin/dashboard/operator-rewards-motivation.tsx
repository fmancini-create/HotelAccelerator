"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BadgeEuro, CheckCircle2, Coins, Settings2, Sparkles, Trophy, TriangleAlert } from "lucide-react"

import { Progress } from "@/components/ui/progress"

type RewardType = "points" | "money"
type GoalUnit = "count" | "seconds" | "cents" | "percent"
type Award = {
  id: string
  reward_type: RewardType
  reward_value: number
  status: "approved" | "settled" | "void"
  period_label: string
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
  periodLabel: string
  rule: {
    rewardType: RewardType
    rewardValue: number
    stretchThresholdPct: number | null
    stretchRewardValue: number | null
  } | null
  rewardValueAtCurrent: number | null
  nextTier: { thresholdPct: number; rewardValue: number } | null
  currentAward: Award | null
}
type Payload = {
  canManageRewards: boolean
  measurementEnabled: boolean
  goals: Goal[]
  summary: {
    pointsCredited: number
    moneyApprovedCents: number
    moneySettledCents: number
  }
  recentAwards: Award[]
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

function remainingLabel(goal: Goal) {
  if (goal.currentValue === null) return "Dato non misurabile"
  if ((goal.achievementPct ?? 0) >= 100) return "Obiettivo raggiunto"
  const delta = goal.direction === "at_most"
    ? Math.max(0, goal.currentValue - goal.targetValue)
    : Math.max(0, goal.targetValue - goal.currentValue)
  if (delta <= 0) return "Obiettivo raggiunto"
  return goal.direction === "at_most"
    ? `Riduci ancora di ${metricLabel(delta, goal.unit)}`
    : `Mancano ${metricLabel(delta, goal.unit)}`
}

function awardState(goal: Goal) {
  const current = goal.currentAward
  if (current) {
    if (
      goal.rewardValueAtCurrent !== null &&
      goal.rewardValueAtCurrent > current.reward_value &&
      !(current.reward_type === "money" && current.status === "settled")
    ) {
      return `Livello superiore raggiunto: premio aggiornabile a ${rewardLabel(current.reward_type, goal.rewardValueAtCurrent)}`
    }
    if (current.reward_type === "points") return `Accreditati ${rewardLabel("points", current.reward_value)}`
    if (current.status === "settled") return `Liquidati ${rewardLabel("money", current.reward_value)}`
    return `Approvati ${rewardLabel("money", current.reward_value)} · da liquidare`
  }
  if (goal.rewardValueAtCurrent !== null && goal.rule) {
    return `Premio raggiunto: ${rewardLabel(goal.rule.rewardType, goal.rewardValueAtCurrent)} · da confermare`
  }
  if (goal.nextTier && goal.rule) {
    return `${rewardLabel(goal.rule.rewardType, goal.nextTier.rewardValue)} al ${goal.nextTier.thresholdPct}%`
  }
  return ""
}

function RewardCard({ goal }: { goal: Goal }) {
  if (!goal.rule) return null
  const pct = goal.achievementPct
  const achieved = (pct ?? 0) >= 100
  const status = awardState(goal)
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{goal.label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{goal.periodLabel}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${achieved ? "bg-ha-success-soft text-ha-success-soft-foreground" : "bg-ha-brand-soft text-ha-brand-soft-foreground"}`}>
          {goal.rule.rewardType === "points" ? <Coins className="mr-1 inline h-3.5 w-3.5" /> : <BadgeEuro className="mr-1 inline h-3.5 w-3.5" />}
          {rewardLabel(goal.rule.rewardType, goal.rewardValueAtCurrent ?? goal.rule.rewardValue)}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{metricLabel(goal.currentValue, goal.unit)}</span>
          <span className="ml-2 text-xs text-muted-foreground">/ {metricLabel(goal.targetValue, goal.unit)}</span>
        </div>
        <span className={`text-xs font-semibold ${achieved ? "text-ha-success" : "text-muted-foreground"}`}>
          {pct === null ? "—" : `${pct}%`}
        </span>
      </div>
      <Progress value={Math.min(100, pct ?? 0)} className="mt-3 h-2" />

      <div className="mt-3 flex items-start gap-2 text-xs">
        {achieved ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ha-success" /> : <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ha-brand" />}
        <div>
          <p className="font-medium text-foreground">{remainingLabel(goal)}</p>
          {status ? <p className="mt-0.5 text-muted-foreground">{status}</p> : null}
          {goal.rule.stretchThresholdPct && goal.rule.stretchRewardValue && (pct ?? 0) < goal.rule.stretchThresholdPct ? (
            <p className="mt-1 text-muted-foreground">
              Livello extra: {rewardLabel(goal.rule.rewardType, goal.rule.stretchRewardValue)} al {goal.rule.stretchThresholdPct}%.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function OperatorRewardsMotivation() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch("/api/platform/operator-rewards", { cache: "no-store" })
        if (!response.ok) throw new Error("rewards")
        const body = await response.json()
        if (!cancelled) setPayload(body)
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return null
  if (!payload) return <div className="mx-auto mb-4 h-20 w-full max-w-7xl animate-pulse rounded-2xl bg-muted/50 px-4 sm:px-6 lg:px-8" />

  const hasHistory = payload.summary.pointsCredited > 0 || payload.summary.moneyApprovedCents > 0 || payload.summary.moneySettledCents > 0
  if (payload.goals.length === 0 && !hasHistory) {
    if (!payload.canManageRewards) return null
    return (
      <section className="mx-auto mb-5 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-5 w-5 text-ha-brand" />
            <div>
              <p className="text-sm font-semibold">Premi sugli obiettivi</p>
              <p className="mt-1 text-xs text-muted-foreground">Nessun premio è ancora associato agli obiettivi di questo utente.</p>
            </div>
          </div>
          <Link href="/admin/settings/rewards" className="inline-flex items-center gap-2 text-sm font-medium text-ha-brand hover:underline">
            <Settings2 className="h-4 w-4" /> Configura premi
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto mb-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-ha-brand-soft via-card to-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-ha-brand" /><h2 className="text-base font-semibold">I tuoi premi</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Vedi cosa puoi ottenere raggiungendo gli obiettivi assegnati e quanto manca al prossimo livello.</p>
          </div>
          {payload.canManageRewards ? (
            <Link href="/admin/settings/rewards" className="inline-flex w-fit items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:border-ha-brand/40 hover:text-ha-brand">
              <Settings2 className="h-3.5 w-3.5" /> Configura premi
            </Link>
          ) : null}
        </div>

        <div className="grid gap-3 border-b border-border/70 bg-card/40 p-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Punti accreditati</p>
            <p className="mt-1 text-xl font-semibold tabular-nums"><Coins className="mr-1 inline h-4 w-4 text-ha-brand" />{payload.summary.pointsCredited.toLocaleString("it-IT")}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Premi € approvati</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{euro(payload.summary.moneyApprovedCents)}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Premi € liquidati</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{euro(payload.summary.moneySettledCents)}</p>
          </div>
        </div>

        {!payload.measurementEnabled && payload.goals.length > 0 ? (
          <div className="flex items-start gap-2 border-b border-ha-warning/25 bg-ha-warning-soft px-5 py-3 text-xs text-ha-warning-soft-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            I premi sono configurati, ma i KPI personali non sono attivi: HotelAccelerator non attribuisce risultati o premi finché la misurazione resta disattivata.
          </div>
        ) : null}

        {payload.goals.length > 0 ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {payload.goals.map((goal) => <RewardCard key={goal.goalKey} goal={goal} />)}
          </div>
        ) : null}

        <p className="border-t border-border/70 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Il raggiungimento viene verificato sui dati attribuiti all'utente e confermato dall'amministratore. I premi in denaro non generano pagamenti automatici: restano separati dalla liquidazione effettiva.
        </p>
      </div>
    </section>
  )
}
