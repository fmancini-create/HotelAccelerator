import type { SupabaseClient } from "@supabase/supabase-js"

import { DASHBOARD_PANELS } from "@/lib/platform/dashboard"

export const DASHBOARD_PANEL_IDS = DASHBOARD_PANELS.map((panel) => panel.id)
export const DASHBOARD_PANEL_ID_SET = new Set(DASHBOARD_PANEL_IDS)

export type DashboardGoals = {
  responsesTarget: number | null
  conversationsTarget: number | null
  medianResponseSecondsTarget: number | null
}

export type DashboardUserSettings = {
  hiddenPanels: string[]
  goals: DashboardGoals
}

export const EMPTY_DASHBOARD_USER_SETTINGS: DashboardUserSettings = {
  hiddenPanels: [],
  goals: {
    responsesTarget: null,
    conversationsTarget: null,
    medianResponseSecondsTarget: null,
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

export function parseDashboardGoals(value: unknown): DashboardGoals {
  const goals = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    responsesTarget: positiveIntegerOrNull(goals.responsesTarget),
    conversationsTarget: positiveIntegerOrNull(goals.conversationsTarget),
    medianResponseSecondsTarget: positiveIntegerOrNull(goals.medianResponseSecondsTarget),
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
    .select("hidden_panels, responses_target, conversations_target, median_response_seconds_target")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return EMPTY_DASHBOARD_USER_SETTINGS

  return {
    hiddenPanels: sanitizeHiddenPanels(data.hidden_panels),
    goals: {
      responsesTarget: typeof data.responses_target === "number" ? data.responses_target : null,
      conversationsTarget: typeof data.conversations_target === "number" ? data.conversations_target : null,
      medianResponseSecondsTarget:
        typeof data.median_response_seconds_target === "number" ? data.median_response_seconds_target : null,
    },
  }
}
