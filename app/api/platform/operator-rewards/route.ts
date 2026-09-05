import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getMemberEffectiveAreas } from "@/lib/auth/area-access"
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"
import { computeOperatorRewardState } from "@/lib/platform/operator-goal-rewards"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type LedgerRow = {
  id: string
  goal_key: string
  period_key: string
  period_label: string
  reward_type: "points" | "money"
  reward_value: number
  achievement_pct: number
  status: "approved" | "settled" | "void"
  approved_at: string
  settled_at: string | null
  created_at: string
}

type RewardSummaryRow = {
  points_credited: number | string | null
  money_approved_cents: number | string | null
  money_settled_cents: number | string | null
}

export async function GET(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })

  const isAdmin = identity.isSuperAdmin || identity.isTenantAdmin
  const userId = identity.adminUserId
  const emptySummary = {
    pointsCredited: 0,
    moneyApprovedCents: 0,
    moneySettledCents: 0,
  }

  // Un superadmin con tenant override non ha necessariamente una scheda operatore.
  // Può configurare i premi, ma non gli si inventa un saldo personale.
  if (!userId) {
    return NextResponse.json({
      canManageRewards: isAdmin,
      measurementEnabled: false,
      goals: [],
      summary: emptySummary,
      recentAwards: [],
    })
  }

  const propertyId = identity.propertyId
  const sb = createServiceClient()

  let areas: string[] = []
  if (!isAdmin) {
    try {
      areas = await getMemberEffectiveAreas(propertyId, userId)
    } catch {
      areas = []
    }
  }
  const granted = new Set([...(areas ?? []), ...BASELINE_AREA_KEYS])
  const hasArea = (area: string | null) => !area || isAdmin || granted.has(area)

  try {
    const includeCalls = hasArea("calls")
    const includeTasks = hasArea("todos")
    const state = await computeOperatorRewardState(sb, propertyId, userId, { includeCalls, includeTasks })

    // Il saldo è aggregato sull'intero ledger server-side. Lo storico recente e
    // i record del ciclo corrente sono letture separate, così la correttezza del
    // saldo non dipende mai da un limite di paginazione UI.
    const periodKeys = [...new Set(state.goals.map((goal) => goal.periodKey))]
    const summaryPromise = sb.rpc("operator_goal_reward_summary", {
      p_property_id: propertyId,
      p_user_id: userId,
    })
    const currentPromise =
      periodKeys.length > 0
        ? sb
            .from("operator_goal_reward_ledger")
            .select("id,goal_key,period_key,period_label,reward_type,reward_value,achievement_pct,status,approved_at,settled_at,created_at")
            .eq("property_id", propertyId)
            .eq("user_id", userId)
            .neq("status", "void")
            .in("period_key", periodKeys)
        : Promise.resolve({ data: [], error: null })
    const recentPromise = sb
      .from("operator_goal_reward_ledger")
      .select("id,goal_key,period_key,period_label,reward_type,reward_value,achievement_pct,status,approved_at,settled_at,created_at")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12)

    const [summaryResult, currentResult, recentResult] = await Promise.all([
      summaryPromise,
      currentPromise,
      recentPromise,
    ])
    if (summaryResult.error) throw summaryResult.error
    if (currentResult.error) throw currentResult.error
    if (recentResult.error) throw recentResult.error

    const rawSummary = ((summaryResult.data ?? [])[0] ?? null) as RewardSummaryRow | null
    const summary = rawSummary
      ? {
          pointsCredited: Number(rawSummary.points_credited ?? 0),
          moneyApprovedCents: Number(rawSummary.money_approved_cents ?? 0),
          moneySettledCents: Number(rawSummary.money_settled_cents ?? 0),
        }
      : emptySummary

    const currentAwards = (currentResult.data ?? []) as LedgerRow[]
    const currentAward = new Map(
      currentAwards.map((row) => [`${row.goal_key}:${row.period_key}`, row] as const),
    )

    const goals = state.goals
      .filter((goal) => hasArea(goal.requiredArea))
      .map((goal) => ({
        ...goal,
        currentAward: currentAward.get(`${goal.goalKey}:${goal.periodKey}`) ?? null,
      }))

    return NextResponse.json({
      canManageRewards: isAdmin,
      measurementEnabled: state.measurementEnabled,
      timeZone: state.timeZone,
      goals,
      summary,
      recentAwards: (recentResult.data ?? []) as LedgerRow[],
    })
  } catch (error) {
    console.error("[operator-rewards] self reward state unavailable", error)
    return NextResponse.json(
      { error: "Premi temporaneamente non misurabili" },
      { status: 500 },
    )
  }
}