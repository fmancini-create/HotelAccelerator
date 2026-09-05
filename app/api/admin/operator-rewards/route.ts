import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import {
  isOperatorGoalKey,
  parseOperatorRewardRule,
  type OperatorGoalKey,
} from "@/lib/platform/operator-goal-rewards-core"
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
  achievement_value: number
  target_value: number
  achievement_pct: number
  status: "approved" | "settled" | "void"
  approved_by_email: string
  approved_at: string
  settled_by_email: string | null
  settled_at: string | null
  voided_by_email: string | null
  voided_at: string | null
  void_reason: string | null
  created_at: string
  updated_at: string
}

async function requireTenantUser(propertyId: string, userId: string) {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("admin_users")
    .select("id,name,email,role,kpi_enabled")
    .eq("property_id", propertyId)
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw Object.assign(new Error("Utente non trovato nella struttura"), { status: 404 })
  return data
}

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    return Number((error as { status?: number }).status) || 500
  }
  return accessErrorStatus(error)
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
}

async function readLedger(propertyId: string, userId: string) {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("operator_goal_reward_ledger")
    .select(
      "id,goal_key,period_key,period_label,reward_type,reward_value,achievement_value,target_value,achievement_pct,status,approved_by_email,approved_at,settled_by_email,settled_at,voided_by_email,voided_at,void_reason,created_at,updated_at",
    )
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as LedgerRow[]
}

async function adminState(propertyId: string, userId: string) {
  const sb = createServiceClient()
  const [state, ledger] = await Promise.all([
    computeOperatorRewardState(sb, propertyId, userId, {
      includeCalls: true,
      includeTasks: true,
      includeGoalsWithoutReward: true,
    }),
    readLedger(propertyId, userId),
  ])

  const currentByGoal = new Map(
    ledger
      .filter((row) => row.status !== "void")
      .map((row) => [`${row.goal_key}:${row.period_key}`, row] as const),
  )

  return {
    ...state,
    goals: state.goals.map((goal) => ({
      ...goal,
      currentAward: currentByGoal.get(`${goal.goalKey}:${goal.periodKey}`) ?? null,
    })),
    ledger,
  }
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) return NextResponse.json({ error: "userId obbligatorio" }, { status: 400 })

    const user = await requireTenantUser(caller.propertyId, userId)
    const state = await adminState(caller.propertyId, userId)
    return NextResponse.json({ user, ...state })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere i premi" },
      { status: statusOf(error) },
    )
  }
}

/** Salva/disattiva la regola premio per un singolo obiettivo. */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null)
    const userId = body && typeof body.userId === "string" ? body.userId : ""
    const goalKey = body?.goalKey
    if (!userId || !isOperatorGoalKey(goalKey)) {
      return NextResponse.json({ error: "userId e goalKey validi sono obbligatori" }, { status: 400 })
    }

    await requireTenantUser(caller.propertyId, userId)
    const rule = parseOperatorRewardRule(body.rule)
    const sb = createServiceClient()

    // La regola non può esistere senza un target realmente configurato: evita
    // premi "decorativi" che l'app non saprebbe misurare.
    const state = await computeOperatorRewardState(sb, caller.propertyId, userId, {
      includeCalls: true,
      includeTasks: true,
      includeGoalsWithoutReward: true,
    })
    const configuredGoal = state.goals.find((goal) => goal.goalKey === goalKey)

    if (rule && !configuredGoal) {
      return NextResponse.json(
        { error: "Configura prima questo obiettivo nella Dashboard utenti" },
        { status: 409 },
      )
    }

    if (!rule) {
      const { error } = await sb
        .from("operator_goal_reward_rules")
        .update({ active: false, updated_by_email: caller.email, updated_at: new Date().toISOString() })
        .eq("property_id", caller.propertyId)
        .eq("user_id", userId)
        .eq("goal_key", goalKey)
      if (error) throw error
    } else {
      const { error } = await sb.from("operator_goal_reward_rules").upsert(
        {
          property_id: caller.propertyId,
          user_id: userId,
          goal_key: goalKey,
          reward_type: rule.rewardType,
          reward_value: rule.rewardValue,
          stretch_threshold_pct: rule.stretchThresholdPct,
          stretch_reward_value: rule.stretchRewardValue,
          active: true,
          updated_by_email: caller.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,user_id,goal_key" },
      )
      if (error) throw error
    }

    return NextResponse.json({ userId, goalKey, state: await adminState(caller.propertyId, userId) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile salvare il premio" },
      { status: statusOf(error) },
    )
  }
}

/**
 * Azioni economiche esplicite: conferma di un premio realmente raggiunto,
 * liquidazione del denaro o annullamento motivato. Nessuna di queste azioni è
 * disponibile al collaboratore e nessun pagamento esterno parte da qui.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null)
    const action = body?.action
    const sb = createServiceClient()

    if (action === "confirm") {
      const userId = typeof body?.userId === "string" ? body.userId : ""
      const goalKey = body?.goalKey
      if (!userId || !isOperatorGoalKey(goalKey)) {
        return NextResponse.json({ error: "userId e goalKey validi sono obbligatori" }, { status: 400 })
      }
      await requireTenantUser(caller.propertyId, userId)

      const state = await computeOperatorRewardState(sb, caller.propertyId, userId, {
        includeCalls: true,
        includeTasks: true,
        includeGoalsWithoutReward: true,
      })
      if (!state.measurementEnabled) {
        return NextResponse.json({ error: "I KPI di questo utente non sono attivi" }, { status: 409 })
      }

      const goal = state.goals.find((item) => item.goalKey === goalKey)
      if (!goal?.rule) return NextResponse.json({ error: "Premio non configurato per questo obiettivo" }, { status: 409 })
      if (goal.currentValue === null || goal.achievementPct === null || goal.rewardValueAtCurrent === null) {
        return NextResponse.json({ error: "Obiettivo non ancora raggiunto o non misurabile" }, { status: 409 })
      }

      const { data: existing, error: existingError } = await sb
        .from("operator_goal_reward_ledger")
        .select("id,status,reward_type,reward_value")
        .eq("property_id", caller.propertyId)
        .eq("user_id", userId)
        .eq("goal_key", goal.goalKey)
        .eq("period_key", goal.periodKey)
        .maybeSingle()
      if (existingError) throw existingError

      const nowIso = new Date().toISOString()
      const status = goal.rule.rewardType === "points" ? "settled" : "approved"
      const payload = {
        reward_type: goal.rule.rewardType,
        reward_value: goal.rewardValueAtCurrent,
        achievement_value: goal.currentValue,
        target_value: goal.targetValue,
        achievement_pct: goal.achievementPct,
        approved_by_email: caller.email,
        approved_at: nowIso,
        settled_by_email: goal.rule.rewardType === "points" ? caller.email : null,
        settled_at: goal.rule.rewardType === "points" ? nowIso : null,
        status,
        rule_snapshot: {
          goalKey: goal.goalKey,
          rewardType: goal.rule.rewardType,
          rewardValue: goal.rule.rewardValue,
          stretchThresholdPct: goal.rule.stretchThresholdPct,
          stretchRewardValue: goal.rule.stretchRewardValue,
        },
        metric_snapshot: {
          label: goal.label,
          period: goal.period,
          periodLabel: goal.periodLabel,
          unit: goal.unit,
          currentValue: goal.currentValue,
          targetValue: goal.targetValue,
          achievementPct: goal.achievementPct,
        },
        updated_at: nowIso,
      }

      if (existing) {
        if (existing.status === "void") {
          return NextResponse.json({ error: "Il premio di questo ciclo è stato annullato e non può essere riaccreditato" }, { status: 409 })
        }
        if (goal.rewardValueAtCurrent <= existing.reward_value) {
          return NextResponse.json({ error: "Premio già confermato per questo obiettivo e ciclo" }, { status: 409 })
        }
        if (existing.reward_type === "money" && existing.status === "settled") {
          return NextResponse.json(
            { error: "Il premio economico è già stato liquidato: non può essere aumentato automaticamente" },
            { status: 409 },
          )
        }

        const { error } = await sb
          .from("operator_goal_reward_ledger")
          .update(payload)
          .eq("property_id", caller.propertyId)
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await sb.from("operator_goal_reward_ledger").insert({
          property_id: caller.propertyId,
          user_id: userId,
          rule_id: goal.rule.id,
          goal_key: goal.goalKey,
          period_key: goal.periodKey,
          period_label: goal.periodLabel,
          ...payload,
        })
        if (error) {
          if (errorCode(error) === "23505") {
            return NextResponse.json({ error: "Premio già confermato per questo obiettivo e ciclo" }, { status: 409 })
          }
          throw error
        }
      }

      return NextResponse.json({ ok: true, state: await adminState(caller.propertyId, userId) })
    }

    if (action === "settle" || action === "void") {
      const ledgerId = typeof body?.ledgerId === "string" ? body.ledgerId : ""
      if (!ledgerId) return NextResponse.json({ error: "ledgerId obbligatorio" }, { status: 400 })

      const { data: row, error: readError } = await sb
        .from("operator_goal_reward_ledger")
        .select("id,user_id,reward_type,status")
        .eq("property_id", caller.propertyId)
        .eq("id", ledgerId)
        .maybeSingle()
      if (readError) throw readError
      if (!row) return NextResponse.json({ error: "Premio non trovato" }, { status: 404 })

      if (action === "settle") {
        if (row.reward_type !== "money" || row.status !== "approved") {
          return NextResponse.json({ error: "Solo un premio economico approvato può essere marcato come liquidato" }, { status: 409 })
        }
        const nowIso = new Date().toISOString()
        const { error } = await sb
          .from("operator_goal_reward_ledger")
          .update({
            status: "settled",
            settled_by_email: caller.email,
            settled_at: nowIso,
            updated_at: nowIso,
          })
          .eq("property_id", caller.propertyId)
          .eq("id", ledgerId)
        if (error) throw error
      } else {
        const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
        if (!reason || reason.length > 240) {
          return NextResponse.json({ error: "Indica un motivo di annullamento (massimo 240 caratteri)" }, { status: 400 })
        }
        if (row.status === "void") return NextResponse.json({ error: "Premio già annullato" }, { status: 409 })
        if (row.reward_type === "money" && row.status === "settled") {
          return NextResponse.json(
            { error: "Un premio economico già liquidato non può essere annullato: serve una rettifica amministrativa separata" },
            { status: 409 },
          )
        }
        const nowIso = new Date().toISOString()
        const { error } = await sb
          .from("operator_goal_reward_ledger")
          .update({
            status: "void",
            voided_by_email: caller.email,
            voided_at: nowIso,
            void_reason: reason,
            updated_at: nowIso,
          })
          .eq("property_id", caller.propertyId)
          .eq("id", ledgerId)
        if (error) throw error
      }

      return NextResponse.json({ ok: true, state: await adminState(caller.propertyId, row.user_id) })
    }

    return NextResponse.json({ error: "Azione premio non valida" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Operazione premio non riuscita" },
      { status: statusOf(error) },
    )
  }
}
