import type { SupabaseClient } from "@supabase/supabase-js"

import { DASHBOARD_PANELS } from "@/lib/platform/dashboard"

export const DASHBOARD_PANEL_IDS = DASHBOARD_PANELS.map((panel) => panel.id)
export const DASHBOARD_PANEL_ID_SET = new Set(DASHBOARD_PANEL_IDS)

export type DashboardCustomGoalMetric = "quotes_sent" | "completed_calls" | "completed_tasks" | "conversion_rate"
export type DashboardCustomGoalPeriod = "workday" | "30_days"

const CUSTOM_GOAL_METRICS = new Set<DashboardCustomGoalMetric>([
  "quotes_sent",
  "completed_calls",
  "completed_tasks",
  "conversion_rate",
])
const CUSTOM_GOAL_PERIODS = new Set<DashboardCustomGoalPeriod>(["workday", "30_days"])

export type DashboardGoals = {
  workdayResponsesTarget: number | null
  workdayConversationsTarget: number | null
  responsesTarget: number | null
  conversationsTarget: number | null
  medianResponseSecondsTarget: number | null
  closedDealsTarget: number | null
  closedRevenueTargetCents: number | null
  customGoalMetric: DashboardCustomGoalMetric | null
  customGoalLabel: string | null
  customGoalTarget: number | null
  customGoalPeriod: DashboardCustomGoalPeriod | null
}

export type DashboardUserSettings = {
  hiddenPanels: string[]
  goals: DashboardGoals
}

export const EMPTY_DASHBOARD_USER_SETTINGS: DashboardUserSettings = {
  hiddenPanels: [],
  goals: {
    workdayResponsesTarget: null,
    workdayConversationsTarget: null,
    responsesTarget: null,
    conversationsTarget: null,
    medianResponseSecondsTarget: null,
    closedDealsTarget: null,
    closedRevenueTargetCents: null,
    customGoalMetric: null,
    customGoalLabel: null,
    customGoalTarget: null,
    customGoalPeriod: null,
  },
}

export function sanitizeHiddenPanels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === "string" && DASHBOARD_PANEL_ID_SET.has(id)))]
}

function positiveIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error("Gli obiettivi devono essere interi positivi")
  return n
}

function customMetricOrNull(value: unknown): DashboardCustomGoalMetric | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string" || !CUSTOM_GOAL_METRICS.has(value as DashboardCustomGoalMetric)) {
    throw new Error("Metrica dell'obiettivo extra non valida")
  }
  return value as DashboardCustomGoalMetric
}

function customPeriodOrNull(value: unknown): DashboardCustomGoalPeriod | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string" || !CUSTOM_GOAL_PERIODS.has(value as DashboardCustomGoalPeriod)) {
    throw new Error("Periodo dell'obiettivo extra non valido")
  }
  return value as DashboardCustomGoalPeriod
}

function labelOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") throw new Error("Etichetta dell'obiettivo extra non valida")
  const clean = value.trim()
  if (!clean) return null
  if (clean.length > 80) throw new Error("L'etichetta dell'obiettivo extra può avere al massimo 80 caratteri")
  return clean
}

export function parseDashboardGoals(value: unknown): DashboardGoals {
  const goals = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const customGoalMetric = customMetricOrNull(goals.customGoalMetric)
  const customGoalTarget = positiveIntegerOrNull(goals.customGoalTarget)
  if (customGoalMetric === "conversion_rate" && customGoalTarget !== null && customGoalTarget > 100) {
    throw new Error("Il target del tasso di conversione non può superare il 100%")
  }

  return {
    workdayResponsesTarget: positiveIntegerOrNull(goals.workdayResponsesTarget),
    workdayConversationsTarget: positiveIntegerOrNull(goals.workdayConversationsTarget),
    responsesTarget: positiveIntegerOrNull(goals.responsesTarget),
    conversationsTarget: positiveIntegerOrNull(goals.conversationsTarget),
    medianResponseSecondsTarget: positiveIntegerOrNull(goals.medianResponseSecondsTarget),
    closedDealsTarget: positiveIntegerOrNull(goals.closedDealsTarget),
    closedRevenueTargetCents: positiveIntegerOrNull(goals.closedRevenueTargetCents),
    customGoalMetric,
    customGoalLabel: customGoalMetric ? labelOrNull(goals.customGoalLabel) : null,
    customGoalTarget: customGoalMetric ? customGoalTarget : null,
    customGoalPeriod: customGoalMetric ? customPeriodOrNull(goals.customGoalPeriod) ?? "30_days" : null,
  }
}

export async function readDashboardUserSettings(
  sb: SupabaseClient,
  propertyId: string,
  userId: string | null | undefined,
): Promise<DashboardUserSettings> {
  if (!userId) return EMPTY_DASHBOARD_USER_SETTINGS

  const { data, error } = await sb
    .from("dashboard_user_settings")
    .select(
      "hidden_panels, workday_responses_target, workday_conversations_target, responses_target, conversations_target, median_response_seconds_target, closed_deals_target, closed_revenue_target_cents, custom_goal_metric, custom_goal_label, custom_goal_target, custom_goal_period",
    )
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return EMPTY_DASHBOARD_USER_SETTINGS

  const customGoalMetric = CUSTOM_GOAL_METRICS.has(data.custom_goal_metric as DashboardCustomGoalMetric)
    ? (data.custom_goal_metric as DashboardCustomGoalMetric)
    : null
  const customGoalPeriod = CUSTOM_GOAL_PERIODS.has(data.custom_goal_period as DashboardCustomGoalPeriod)
    ? (data.custom_goal_period as DashboardCustomGoalPeriod)
    : null

  return {
    hiddenPanels: sanitizeHiddenPanels(data.hidden_panels),
    goals: {
      workdayResponsesTarget:
        typeof data.workday_responses_target === "number" ? data.workday_responses_target : null,
      workdayConversationsTarget:
        typeof data.workday_conversations_target === "number" ? data.workday_conversations_target : null,
      responsesTarget: typeof data.responses_target === "number" ? data.responses_target : null,
      conversationsTarget: typeof data.conversations_target === "number" ? data.conversations_target : null,
      medianResponseSecondsTarget:
        typeof data.median_response_seconds_target === "number" ? data.median_response_seconds_target : null,
      closedDealsTarget: typeof data.closed_deals_target === "number" ? data.closed_deals_target : null,
      closedRevenueTargetCents:
        typeof data.closed_revenue_target_cents === "number" ? data.closed_revenue_target_cents : null,
      customGoalMetric,
      customGoalLabel: typeof data.custom_goal_label === "string" ? data.custom_goal_label : null,
      customGoalTarget: typeof data.custom_goal_target === "number" ? data.custom_goal_target : null,
      customGoalPeriod,
    },
  }
}
