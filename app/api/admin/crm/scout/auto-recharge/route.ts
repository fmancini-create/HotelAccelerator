import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { getScoutTenantBillingState } from "@/lib/scout/billing"
import { requireScoutBillingAdmin, ScoutBillingAccessDenied } from "@/lib/scout/access"

const patchSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().min(50).max(10_000_000),
  rechargeCredits: z.number().int().min(1).max(100000),
})

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const db = createServiceClient()
    const [{ data, error }, billing] = await Promise.all([
      db
        .from("scout_auto_recharge_settings")
        .select("enabled,status,threshold_cents,recharge_credits,card_brand,card_last4,card_exp_month,card_exp_year,consented_at,last_success_at,last_error_code,last_error_at,updated_at")
        .eq("property_id", propertyId)
        .maybeSingle(),
      getScoutTenantBillingState(db, propertyId),
    ])
    if (error) throw error

    let canManage = true
    try {
      await requireScoutBillingAdmin(db, request, propertyId)
    } catch (accessError) {
      if (accessError instanceof ScoutBillingAccessDenied) canManage = false
      else throw accessError
    }

    const row = data
    return NextResponse.json({
      autoRecharge: {
        enabled: row?.enabled === true,
        status: row?.status ?? "disabled",
        thresholdCents: row?.threshold_cents ?? null,
        rechargeCredits: row?.recharge_credits ?? null,
        card: row?.card_last4
          ? { brand: row.card_brand ?? null, last4: row.card_last4, expMonth: row.card_exp_month ?? null, expYear: row.card_exp_year ?? null }
          : null,
        consentedAt: row?.consented_at ?? null,
        lastSuccessAt: row?.last_success_at ?? null,
        lastErrorCode: row?.last_error_code ?? null,
        lastErrorAt: row?.last_error_at ?? null,
      },
      creditPriceCents: billing.creditPriceCents,
      canManage,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Scout auto recharge read failed:", error)
    return NextResponse.json({ error: "Impossibile leggere la ricarica automatica Scout." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = patchSchema.parse(await request.json())
    const db = createServiceClient()
    const actorEmail = await requireScoutBillingAdmin(db, request, propertyId)
    const billing = await getScoutTenantBillingState(db, propertyId)
    if (!billing.active) return NextResponse.json({ error: "Attiva Scout prima di configurare la ricarica automatica." }, { status: 409 })
    if (!billing.creditPriceCents || !billing.pricingConfigured) return NextResponse.json({ error: "Listino Scout non configurato." }, { status: 503 })
    if (body.rechargeCredits < billing.minimumPurchaseCredits) {
      return NextResponse.json({ error: `La ricarica minima è di ${billing.minimumPurchaseCredits} crediti.` }, { status: 400 })
    }

    const { data: current, error: currentError } = await db
      .from("scout_auto_recharge_settings")
      .select("stripe_customer_id,stripe_payment_method_id")
      .eq("property_id", propertyId)
      .maybeSingle()
    if (currentError) throw currentError

    if (body.enabled && (!current?.stripe_customer_id || !current?.stripe_payment_method_id)) {
      return NextResponse.json({ error: "Prima salva una carta per la ricarica automatica." }, { status: 409 })
    }

    const now = new Date().toISOString()
    const { error } = await db.from("scout_auto_recharge_settings").upsert({
      property_id: propertyId,
      enabled: body.enabled,
      status: body.enabled ? "ready" : "disabled",
      threshold_cents: body.thresholdCents,
      recharge_credits: body.rechargeCredits,
      consented_at: body.enabled ? now : null,
      updated_by: actorEmail,
      updated_at: now,
    }, { onConflict: "property_id" })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof ScoutBillingAccessDenied) return NextResponse.json({ error: error.message }, { status: 403 })
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Impostazioni ricarica automatica non valide." }, { status: 400 })
    console.error("Scout auto recharge update failed:", error)
    return NextResponse.json({ error: "Impossibile aggiornare la ricarica automatica Scout." }, { status: 500 })
  }
}
