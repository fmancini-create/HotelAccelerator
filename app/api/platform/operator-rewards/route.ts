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
    const [state, ledgerResult] = await Promise.all([
      computeOperatorRewardState(sb, propertyId, userId, { includeCalls, includeTasks }),
      sb
        .from("operator_goal_reward_ledger")
        .select("id,goal_key,period_key,period_label,reward_type,reward_value,achievement_pct,status,approved_at,settled_at,created_at")
        .eq("property_id", propertyId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),
    ])
    if (ledgerResult.error) throw ledgerResult.error

    const ledger = (ledgerResult.data ?? []) as LedgerRow[]
    const valid = ledger.filter((row) => row.status !== "void")
    const summary = valid.reduce(
      (acc, row) => {
        if (row.reward_type === "points" && row.status === "settled") acc.pointsCredited += row.reward_value
        if (row.reward_type === "money" && row.status === "approved") acc.moneyApprovedCents += row.reward_value
        if (row.reward_type === "money" && row.status === "settled") acc.moneySettledCents += row.reward_value
        return acc
      },
      { ...emptySummary },
    )

    const currentAward = new Map(
      valid.map((row) => [`${row.goal_key}:${row.period_key}`, row] as const),
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
      recentAwards: ledger.slice(0, 12),
    })
  } catch (error) {
    console.error("[operator-rewards] self reward state unavailable", error)
    return NextResponse.json(
      { error: "Premi temporaneamente non misurabili" },
      { status: 500 },
    )
  }
}
