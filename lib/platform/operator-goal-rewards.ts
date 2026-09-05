import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  readDashboardUserSettings,
  type DashboardCustomGoalMetric,
  type DashboardUserSettings,
} from "@/lib/platform/dashboard-user-settings"
import { getTenantLocalDayStart, resolveTenantTimeZone } from "@/lib/platform/local-day"
import { computeOperatorPerformance, GIORNI_PREDEFINITI } from "@/lib/platform/operator-performance"
import { computeOperatorSalesPerformance, type OperatorSalesPerformance } from "@/lib/platform/operator-sales-performance"
import {
  OPERATOR_GOAL_KEYS,
  rewardAchievementPercent,
  rewardPeriodIdentity,
  rewardValueForAchievement,
  nextRewardTier,
  type OperatorGoalDirection,
  type OperatorGoalKey,
  type OperatorGoalPeriod,
  type OperatorRewardRuleValue,
  type OperatorRewardType,
} from "@/lib/platform/operator-goal-rewards-core"

export type OperatorGoalUnit = "count" | "seconds" | "cents" | "percent"

export type OperatorRewardRule = OperatorRewardRuleValue & {
  id: string
  goalKey: OperatorGoalKey
}

export type OperatorGoalRewardSnapshot = {
  goalKey: OperatorGoalKey
  label: string
  period: OperatorGoalPeriod
  targetValue: number
  currentValue: number | null
  unit: OperatorGoalUnit
  direction: OperatorGoalDirection
  requiredArea: string | null
  achievementPct: number | null
  periodKey: string
  periodLabel: string
  rule: OperatorRewardRule | null
  rewardValueAtCurrent: number | null
  nextTier: { thresholdPct: number; rewardValue: number } | null
}

export type OperatorRewardState = {
  measurementEnabled: boolean
  timeZone: string
  customMetric: DashboardCustomGoalMetric | null
  goals: OperatorGoalRewardSnapshot[]
}

type RuleRow = {
  id: string
  goal_key: string
  reward_type: string
  reward_value: number
  stretch_threshold_pct: number | null
  stretch_reward_value: number | null
  active: boolean
}

type GoalDefinition = {
  goalKey: OperatorGoalKey
  label: string
  period: OperatorGoalPeriod
  targetValue: number
  unit: OperatorGoalUnit
  direction: OperatorGoalDirection
  requiredArea: string | null
}

type ComputeRewardStateOptions = {
  now?: Date
  includeCalls?: boolean
  includeTasks?: boolean
  /** Admin settings needs all configured goals; self dashboard only needs rewarded goals. */
  includeGoalsWithoutReward?: boolean
}

function customGoalDefaultLabel(metric: DashboardCustomGoalMetric | null) {
  if (metric === "quotes_sent") return "Preventivi inviati"
  if (metric === "completed_calls") return "Chiamate completate"
  if (metric === "completed_tasks") return "Attività completate"
  if (metric === "conversion_rate") return "Tasso di conversione preventivi"
  return "Obiettivo extra"
}

export function requiredAreaForCustomMetric(metric: DashboardCustomGoalMetric | null): string | null {
  if (metric === "completed_calls") return "calls"
  if (metric === "completed_tasks") return "todos"
  if (metric === "quotes_sent" || metric === "conversion_rate") return "crm"
  return null
}

function configuredGoalDefinitions(settings: DashboardUserSettings): GoalDefinition[] {
  const g = settings.goals
  const definitions: Array<GoalDefinition | null> = [
    g.workdayResponsesTarget
      ? {
          goalKey: "workday_responses",
          label: "Risposte nella giornata",
          period: "workday",
          targetValue: g.workdayResponsesTarget,
          unit: "count",
          direction: "at_least",
          requiredArea: null,
        }
      : null,
    g.workdayConversationsTarget
      ? {
          goalKey: "workday_conversations",
          label: "Conversazioni nella giornata",
          period: "workday",
          targetValue: g.workdayConversationsTarget,
          unit: "count",
          direction: "at_least",
          requiredArea: null,
        }
      : null,
    g.responsesTarget
      ? {
          goalKey: "responses_30",
          label: "Risposte / ultimi 30 giorni",
          period: "30_days",
          targetValue: g.responsesTarget,
          unit: "count",
          direction: "at_least",
          requiredArea: null,
        }
      : null,
    g.conversationsTarget
      ? {
          goalKey: "conversations_30",
          label: "Conversazioni / ultimi 30 giorni",
          period: "30_days",
          targetValue: g.conversationsTarget,
          unit: "count",
          direction: "at_least",
          requiredArea: null,
        }
      : null,
    g.medianResponseSecondsTarget
      ? {
          goalKey: "median_response_30",
          label: "Tempo mediano di risposta",
          period: "30_days",
          targetValue: g.medianResponseSecondsTarget,
          unit: "seconds",
          direction: "at_most",
          requiredArea: null,
        }
      : null,
    g.closedDealsTarget
      ? {
          goalKey: "closed_deals_30",
          label: "Trattative chiuse vinte",
          period: "30_days",
          targetValue: g.closedDealsTarget,
          unit: "count",
          direction: "at_least",
          requiredArea: "crm",
        }
      : null,
    g.closedRevenueTargetCents
      ? {
          goalKey: "closed_revenue_30",
          label: "Valore vendite chiuse",
          period: "30_days",
          targetValue: g.closedRevenueTargetCents,
          unit: "cents",
          direction: "at_least",
          requiredArea: "crm",
        }
      : null,
    g.customGoalMetric && g.customGoalTarget
      ? {
          goalKey: "custom",
          label: g.customGoalLabel || customGoalDefaultLabel(g.customGoalMetric),
          period: g.customGoalPeriod === "workday" ? "workday" : "30_days",
          targetValue: g.customGoalTarget,
          unit: g.customGoalMetric === "conversion_rate" ? "percent" : "count",
          direction: "at_least",
          requiredArea: requiredAreaForCustomMetric(g.customGoalMetric),
        }
      : null,
  ]
  return definitions.filter((definition): definition is GoalDefinition => Boolean(definition))
}

function mapRule(row: RuleRow): OperatorRewardRule | null {
  if (!row.active || !OPERATOR_GOAL_KEYS.includes(row.goal_key as OperatorGoalKey)) return null
  if (row.reward_type !== "points" && row.reward_type !== "money") return null
  return {
    id: row.id,
    goalKey: row.goal_key as OperatorGoalKey,
    rewardType: row.reward_type as OperatorRewardType,
    rewardValue: row.reward_value,
    stretchThresholdPct: row.stretch_threshold_pct,
    stretchRewardValue: row.stretch_reward_value,
  }
}

function customMetricValue(sales: OperatorSalesPerformance, metric: DashboardCustomGoalMetric | null, period: OperatorGoalPeriod) {
  if (!metric) return null
  const workday = period === "workday"
  if (metric === "quotes_sent") return workday ? sales.quotesSentToday : sales.quotesSent30
  if (metric === "completed_calls") return workday ? sales.completedCallsToday : sales.completedCalls30
  if (metric === "completed_tasks") return workday ? sales.completedTasksToday : sales.completedTasks30
  if (metric === "conversion_rate") return workday ? sales.conversionRateToday : sales.conversionRate30
  return null
}

export async function computeOperatorRewardState(
  sb: SupabaseClient,
  propertyId: string,
  userId: string,
  options: ComputeRewardStateOptions = {},
): Promise<OperatorRewardState> {
  const now = options.now ?? new Date()

  const [settings, propertyResult, kpiResult, rulesResult] = await Promise.all([
    readDashboardUserSettings(sb, propertyId, userId),
    sb.from("properties").select("timezone").eq("id", propertyId).maybeSingle(),
    sb
      .from("operator_kpi_settings")
      .select("enabled")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("operator_goal_reward_rules")
      .select("id,goal_key,reward_type,reward_value,stretch_threshold_pct,stretch_reward_value,active")
      .eq("property_id", propertyId)
      .eq("user_id", userId),
  ])

  if (propertyResult.error) throw propertyResult.error
  if (kpiResult.error) throw kpiResult.error
  if (rulesResult.error) throw rulesResult.error

  const timeZone = resolveTenantTimeZone(propertyResult.data?.timezone)
  const measurementEnabled = kpiResult.data?.enabled === true
  const rules = new Map<OperatorGoalKey, OperatorRewardRule>()
  for (const raw of (rulesResult.data ?? []) as RuleRow[]) {
    const rule = mapRule(raw)
    if (rule) rules.set(rule.goalKey, rule)
  }

  let definitions = configuredGoalDefinitions(settings)
  if (!options.includeGoalsWithoutReward) {
    definitions = definitions.filter((definition) => rules.has(definition.goalKey))
  }

  if (definitions.length === 0 || !measurementEnabled) {
    return {
      measurementEnabled,
      timeZone,
      customMetric: settings.goals.customGoalMetric,
      goals: definitions.map((definition) => {
        const identity = rewardPeriodIdentity(definition.period, now, timeZone)
        const rule = rules.get(definition.goalKey) ?? null
        return {
          ...definition,
          currentValue: null,
          achievementPct: null,
          periodKey: identity.key,
          periodLabel: identity.label,
          rule,
          rewardValueAtCurrent: null,
          nextTier: null,
        }
      }),
    }
  }

  const dayStart = getTenantLocalDayStart(now, timeZone)
  const rollingStart = new Date(now.getTime() - GIORNI_PREDEFINITI * 86_400_000)
  const dailyWindowDays = Math.max((now.getTime() - dayStart.getTime()) / 86_400_000, 1 / 86_400)

  const needsTodayPerformance = definitions.some((definition) =>
    definition.goalKey === "workday_responses" || definition.goalKey === "workday_conversations",
  )
  const needsRollingPerformance = definitions.some((definition) =>
    definition.goalKey === "responses_30" ||
    definition.goalKey === "conversations_30" ||
    definition.goalKey === "median_response_30",
  )
  const needsSales = definitions.some((definition) =>
    definition.goalKey === "closed_deals_30" || definition.goalKey === "closed_revenue_30" || definition.goalKey === "custom",
  )

  const [todayPerformance, rollingPerformance, sales] = await Promise.all([
    needsTodayPerformance ? computeOperatorPerformance(sb, propertyId, dailyWindowDays) : Promise.resolve(null),
    needsRollingPerformance ? computeOperatorPerformance(sb, propertyId, GIORNI_PREDEFINITI) : Promise.resolve(null),
    needsSales
      ? computeOperatorSalesPerformance(
          sb,
          propertyId,
          userId,
          dayStart.toISOString(),
          rollingStart.toISOString(),
          { includeCalls: options.includeCalls === true, includeTasks: options.includeTasks === true },
        )
      : Promise.resolve(null),
  ])

  const todayMe = todayPerformance?.righe.find((row) => row.genere === "persona" && row.id === userId)
  const rollingMe = rollingPerformance?.righe.find((row) => row.genere === "persona" && row.id === userId)

  const currentValue = (definition: GoalDefinition): number | null => {
    switch (definition.goalKey) {
      case "workday_responses":
        return todayMe?.risposte ?? 0
      case "workday_conversations":
        return todayMe?.conversazioni ?? 0
      case "responses_30":
        return rollingMe?.risposte ?? 0
      case "conversations_30":
        return rollingMe?.conversazioni ?? 0
      case "median_response_30":
        return rollingMe?.attesaMedianaSec ?? null
      case "closed_deals_30":
        return sales?.closedDeals30 ?? 0
      case "closed_revenue_30":
        return sales?.closedRevenueCents30 ?? 0
      case "custom":
        return sales ? customMetricValue(sales, settings.goals.customGoalMetric, definition.period) : null
    }
  }

  return {
    measurementEnabled,
    timeZone,
    customMetric: settings.goals.customGoalMetric,
    goals: definitions.map((definition) => {
      const value = currentValue(definition)
      const achievementPct = rewardAchievementPercent(value, definition.targetValue, definition.direction)
      const rule = rules.get(definition.goalKey) ?? null
      const identity = rewardPeriodIdentity(definition.period, now, timeZone)
      return {
        ...definition,
        currentValue: value,
        achievementPct,
        periodKey: identity.key,
        periodLabel: identity.label,
        rule,
        rewardValueAtCurrent: rewardValueForAchievement(rule, achievementPct),
        nextTier: nextRewardTier(rule, achievementPct),
      }
    }),
  }
}
