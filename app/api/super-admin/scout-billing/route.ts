import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"
import {
  getCurrentScoutProviderCost,
  getScoutBillingSettings,
  scoutCreditPriceCents,
} from "@/lib/scout/billing"

const settingsSchema = z.object({
  activationFeeCents: z.number().int().min(0).nullable(),
  activationIncludedCredits: z.number().int().min(0).max(100000),
  markupMultiplier: z.number().min(1).max(100),
  minimumPurchaseCredits: z.number().int().min(1).max(100000),
})

const costSchema = z.object({
  operation: z.literal("email_enrichment").default("email_enrichment"),
  costMicroEur: z.number().int().min(0),
  effectiveFrom: z.string().datetime().optional(),
})

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
  return actorEmail
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const db = createServiceClient()
    const [settings, currentCost, historyResult, accountsResult] = await Promise.all([
      getScoutBillingSettings(db),
      getCurrentScoutProviderCost(db),
      db
        .from("scout_provider_cost_history")
        .select("id,provider,operation,cost_micro_eur,effective_from,created_by,created_at")
        .eq("provider", "apollo")
        .order("effective_from", { ascending: false })
        .limit(50),
      db
        .from("scout_credit_accounts")
        .select("property_id,balance,reserved_credits,purchased_credits,granted_credits,consumed_credits,provider_cost_micro_eur,usage_retail_value_cents,updated_at,properties(name,slug)")
        .order("updated_at", { ascending: false }),
    ])
    if (historyResult.error) throw historyResult.error
    if (accountsResult.error) throw accountsResult.error

    const creditPriceCents = scoutCreditPriceCents(currentCost?.costMicroEur ?? null, settings.markupMultiplier)
    const accounts = accountsResult.data ?? []
    const totals = accounts.reduce(
      (acc, row) => {
        acc.balance += Number(row.balance || 0)
        acc.reserved += Number(row.reserved_credits || 0)
        acc.purchased += Number(row.purchased_credits || 0)
        acc.granted += Number(row.granted_credits || 0)
        acc.consumed += Number(row.consumed_credits || 0)
        acc.providerCostMicroEur += Number(row.provider_cost_micro_eur || 0)
        acc.usageRetailValueCents += Number(row.usage_retail_value_cents || 0)
        return acc
      },
      { balance: 0, reserved: 0, purchased: 0, granted: 0, consumed: 0, providerCostMicroEur: 0, usageRetailValueCents: 0 },
    )

    return NextResponse.json({
      settings,
      currentCost,
      creditPriceCents,
      unitMarginMicroEur:
        currentCost && creditPriceCents !== null
          ? Math.max(0, creditPriceCents * 10_000 - currentCost.costMicroEur)
          : null,
      history: historyResult.data ?? [],
      accounts,
      totals,
    })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actorEmail = await requireSuperAdmin(request)
    const body = settingsSchema.parse(await request.json())
    const db = createServiceClient()
    const { error } = await db
      .from("scout_billing_settings")
      .update({
        activation_fee_cents: body.activationFeeCents,
        activation_included_credits: body.activationIncludedCredits,
        markup_multiplier: body.markupMultiplier,
        minimum_purchase_credits: body.minimumPurchaseCredits,
        updated_by: actorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Configurazione Scout non valida.", details: error.flatten() }, { status: 400 })
    }
    return handleServiceError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actorEmail = await requireSuperAdmin(request)
    const body = costSchema.parse(await request.json())
    const db = createServiceClient()
    const { data, error } = await db
      .from("scout_provider_cost_history")
      .insert({
        provider: "apollo",
        operation: body.operation,
        cost_micro_eur: body.costMicroEur,
        effective_from: body.effectiveFrom ?? new Date().toISOString(),
        created_by: actorEmail,
      })
      .select("id,provider,operation,cost_micro_eur,effective_from,created_by,created_at")
      .single()
    if (error) throw error
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Costo provider Scout non valido.", details: error.flatten() }, { status: 400 })
    }
    return handleServiceError(error)
  }
}
