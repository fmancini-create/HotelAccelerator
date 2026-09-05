"use client"

import { BadgeEuro, Handshake, Target } from "lucide-react"

import { Progress } from "@/components/ui/progress"

type Goals = {
  closedDealsTarget: number | null
  closedRevenueTargetCents: number | null
  customGoalMetric: "quotes_sent" | "completed_calls" | "completed_tasks" | "conversion_rate" | null
  customGoalLabel: string | null
  customGoalTarget: number | null
  customGoalPeriod: "workday" | "30_days" | null
}

type Commercial = {
  closedDeals30: number | null
  closedRevenueCents30: number | null
  quotesSent30: number | null
  customMetricValue: number | null
  customMetricUnit: "count" | "percent" | null
  customMetric: Goals["customGoalMetric"]
  customMetricPeriod: Goals["customGoalPeriod"]
}

function progress(value: number | null, target: number | null) {
  if (value === null || target === null || target <= 0) return null
  return Math.min(100, Math.round((value / target) * 100))
}

function euro(cents: number | null) {
  if (cents === null) return "—"
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
}

function customDefaultLabel(metric: Goals["customGoalMetric"]) {
  if (metric === "quotes_sent") return "Preventivi inviati"
  if (metric === "completed_calls") return "Chiamate completate"
  if (metric === "completed_tasks") return "Attività completate"
  if (metric === "conversion_rate") return "Tasso di conversione preventivi"
  return "Obiettivo extra"
}

function ResultCard({
  label,
  value,
  target,
  pct,
  note,
  icon,
}: {
  label: string
  value: string
  target: string | null
  pct: number | null
  note: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {pct !== null ? <span className={`text-xs font-semibold ${pct >= 100 ? "text-ha-success" : "text-muted-foreground"}`}>{pct}%</span> : null}
      </div>
      {pct !== null ? <Progress value={pct} className="mt-3 h-1.5" /> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">{target ?? note}</p>
    </div>
  )
}

export function CommercialPerformance({ goals, commercial }: { goals: Goals; commercial: Commercial }) {
  const closedDeals = commercial.closedDeals30 ?? 0
  const closedRevenue = commercial.closedRevenueCents30 ?? 0
  const customValue = commercial.customMetricValue
  const customPeriod = goals.customGoalPeriod === "workday" ? "oggi" : "ultimi 30 giorni"
  const customDisplay = customValue === null
    ? "—"
    : commercial.customMetricUnit === "percent"
      ? `${customValue}%`
      : customValue.toLocaleString("it-IT")

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-ha-brand" /><h2 className="text-base font-semibold">Risultati commerciali</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Solo attribuzioni confermate · prenotazioni automatiche e attribuzioni dubbie non entrano nei risultati.</p>
        </div>
        <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">ultimi 30 giorni</span>
      </div>
      <div className={`grid gap-3 p-4 ${goals.customGoalMetric ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <ResultCard
          label="Trattative chiuse"
          value={closedDeals.toLocaleString("it-IT")}
          target={goals.closedDealsTarget ? `Obiettivo: ${goals.closedDealsTarget.toLocaleString("it-IT")}` : null}
          pct={progress(closedDeals, goals.closedDealsTarget)}
          note="Obiettivo commerciale non configurato"
          icon={<Target className="h-3.5 w-3.5 text-ha-brand" />}
        />
        <ResultCard
          label="Valore chiuso"
          value={euro(closedRevenue)}
          target={goals.closedRevenueTargetCents ? `Budget: ${euro(goals.closedRevenueTargetCents)}` : null}
          pct={progress(closedRevenue, goals.closedRevenueTargetCents)}
          note="Budget individuale non configurato"
          icon={<BadgeEuro className="h-3.5 w-3.5 text-ha-brand" />}
        />
        {goals.customGoalMetric ? (
          <ResultCard
            label={goals.customGoalLabel || customDefaultLabel(goals.customGoalMetric)}
            value={customDisplay}
            target={goals.customGoalTarget ? `Obiettivo ${customPeriod}: ${goals.customGoalTarget}${goals.customGoalMetric === "conversion_rate" ? "%" : ""}` : null}
            pct={progress(customValue, goals.customGoalTarget)}
            note={`Metrica ${customPeriod} · target non configurato`}
            icon={<Target className="h-3.5 w-3.5 text-ha-brand" />}
          />
        ) : null}
      </div>
      {closedDeals > 0 && closedRevenue === 0 ? (
        <p className="border-t px-5 py-3 text-[11px] text-muted-foreground">Almeno una trattativa è chiusa ma non ha un valore economico confermato: il numero di chiusure conta, il valore non viene stimato.</p>
      ) : null}
    </section>
  )
}
