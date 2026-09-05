import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"
import {
  effectiveLeadUnitCostMicros,
  getScoutBillingSettings,
  resolveScoutFxRate,
  scoutEconomics,
  syncApolloUsageSnapshot,
} from "@/lib/crm/scout-billing"

const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase())
const patchSchema = z.object({
  providerPlanLabel: z.string().trim().max(120).nullable().optional(),
  providerCycleCostCents: z.number().int().min(0).nullable().optional(),
  leadCreditUnitCostMicrosOverride: z.number().int().min(0).nullable().optional(),
  commercialCurrency: currencySchema.optional(),
  fxRateOverride: z.number().positive().nullable().optional(),
  markupMultiplier: z.number().min(1).max(100).optional(),
  lowBalanceThresholdPct: z.number().min(0).max(100).optional(),
  pricingSource: z.enum(["manual_invoice", "contract", "manual_override"]).optional(),
})

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
  return actorEmail
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function warning(code: string, message: string, severity: "info" | "warning" | "critical" = "warning") {
  return { code, message, severity }
}

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const db = createServiceClient()

    const settings = await getScoutBillingSettings(db)
    let liveUsage: Awaited<ReturnType<typeof syncApolloUsageSnapshot>> | null = null
    let providerError: string | null = null

    try {
      liveUsage = await syncApolloUsageSnapshot(db, "api")
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Lettura Apollo non disponibile"
    }

    let fx: Awaited<ReturnType<typeof resolveScoutFxRate>> | null = null
    let fxError: string | null = null
    try {
      fx = await resolveScoutFxRate(db, settings)
    } catch (error) {
      fxError = error instanceof Error ? error.message : "Cambio non disponibile"
    }

    const { data: latestSnapshot, error: latestSnapshotError } = await db
      .from("platform_scout_provider_usage_snapshots")
      .select("*")
      .eq("provider", "apollo")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestSnapshotError) throw latestSnapshotError

    const cycleStart = liveUsage?.currentCycle.startDate || latestSnapshot?.cycle_start || null
    const cycleEnd = liveUsage?.currentCycle.endDate || latestSnapshot?.cycle_end || null
    const leadBucket = liveUsage?.credits.lead_credit
    const directDialBucket = liveUsage?.credits.direct_dial_credit
    const leadLimit = leadBucket?.limit ?? number(latestSnapshot?.lead_credit_limit)
    const leadConsumed = leadBucket?.consumed ?? number(latestSnapshot?.lead_credit_consumed)
    const leadRemaining = leadBucket?.leftOver ?? number(latestSnapshot?.lead_credit_remaining)
    const directDialLimit = directDialBucket?.limit ?? number(latestSnapshot?.direct_dial_limit)
    const directDialConsumed = directDialBucket?.consumed ?? number(latestSnapshot?.direct_dial_consumed)
    const directDialRemaining = directDialBucket?.leftOver ?? number(latestSnapshot?.direct_dial_remaining)
    const allBuckets = liveUsage?.credits ?? (latestSnapshot?.credit_usage || {})

    let usageQuery = db
      .from("crm_scout_usage_events")
      .select("property_id,action,success,credits_used,provider_cost_micros,provider_cost_customer_micros,customer_value_micros,provider_currency,customer_currency,fx_rate_provider_to_customer,created_at")
      .eq("action", "enrich")
    if (cycleStart) usageQuery = usageQuery.gte("created_at", cycleStart)
    if (cycleEnd) usageQuery = usageQuery.lt("created_at", cycleEnd)
    const { data: meteredRows, error: meteredError } = await usageQuery
    if (meteredError) throw meteredError

    const rows = meteredRows ?? []
    const propertyIds = Array.from(new Set(rows.map((row: any) => String(row.property_id)).filter(Boolean)))
    const { data: properties, error: propertiesError } = propertyIds.length
      ? await db.from("properties").select("id,name").in("id", propertyIds)
      : { data: [], error: null }
    if (propertiesError) throw propertiesError
    const propertyName = new Map<string, string>(
      (properties ?? []).map((row: any): [string, string] => [String(row.id), String(row.name || "Tenant")]),
    )

    const trackedCredits = rows.reduce((sum: number, row: any) => sum + number(row.credits_used), 0)
    const trackedProviderCostMicros = rows.reduce((sum: number, row: any) => sum + number(row.provider_cost_micros), 0)
    const trackedProviderCostCustomerMicros = rows.reduce((sum: number, row: any) => sum + number(row.provider_cost_customer_micros), 0)
    const trackedCustomerValueMicros = rows.reduce((sum: number, row: any) => sum + number(row.customer_value_micros), 0)
    const trackedMarginMicros = Math.max(0, trackedCustomerValueMicros - trackedProviderCostCustomerMicros)
    const unattributedCredits = Math.max(0, leadConsumed - trackedCredits)
    const attributionPct = leadConsumed > 0 ? Math.max(0, Math.min(100, (trackedCredits / leadConsumed) * 100)) : 100

    const unitCostMicros = effectiveLeadUnitCostMicros(settings, leadLimit)
    const fxRate = fx?.rate ?? (settings.currency === settings.commercialCurrency ? 1 : 0)
    const liveEconomics = scoutEconomics(settings, leadConsumed, leadLimit, fxRate || 1)
    const remainingEconomics = scoutEconomics(settings, leadRemaining, leadLimit, fxRate || 1)

    const byProperty = new Map<string, {
      propertyId: string
      propertyName: string
      credits: number
      providerCostMicros: number
      providerCostCustomerMicros: number
      customerValueMicros: number
      marginMicros: number
    }>()
    for (const row of rows as any[]) {
      const id = String(row.property_id)
      const current = byProperty.get(id) ?? {
        propertyId: id,
        propertyName: propertyName.get(id) || id,
        credits: 0,
        providerCostMicros: 0,
        providerCostCustomerMicros: 0,
        customerValueMicros: 0,
        marginMicros: 0,
      }
      current.credits += number(row.credits_used)
      current.providerCostMicros += number(row.provider_cost_micros)
      current.providerCostCustomerMicros += number(row.provider_cost_customer_micros)
      current.customerValueMicros += number(row.customer_value_micros)
      current.marginMicros = Math.max(0, current.customerValueMicros - current.providerCostCustomerMicros)
      byProperty.set(id, current)
    }

    const { data: snapshots, error: snapshotsError } = await db
      .from("platform_scout_provider_usage_snapshots")
      .select("cycle_start,cycle_end,lead_credit_limit,lead_credit_consumed,lead_credit_remaining,direct_dial_limit,direct_dial_consumed,direct_dial_remaining,fetched_at,source")
      .eq("provider", "apollo")
      .order("fetched_at", { ascending: false })
      .limit(24)
    if (snapshotsError) throw snapshotsError

    const { data: fxSnapshots, error: fxSnapshotsError } = await db
      .from("platform_scout_fx_snapshots")
      .select("source,from_currency,to_currency,rate,reference_date,fetched_at")
      .eq("from_currency", settings.currency)
      .eq("to_currency", settings.commercialCurrency)
      .order("reference_date", { ascending: false })
      .order("fetched_at", { ascending: false })
      .limit(20)
    if (fxSnapshotsError) throw fxSnapshotsError

    const { data: priceHistory, error: historyError } = await db
      .from("platform_scout_billing_settings_audit")
      .select("currency,commercial_currency,provider_plan_label,provider_cycle_cost_cents,lead_credit_unit_cost_micros_override,markup_multiplier,low_balance_threshold_pct,pricing_source,price_verified_at,fx_source,fx_rate_override,changed_by_email,created_at")
      .eq("provider", "apollo")
      .order("created_at", { ascending: false })
      .limit(20)
    if (historyError) throw historyError

    const warnings: Array<ReturnType<typeof warning>> = []
    if (settings.providerCycleCostCents === null && settings.leadCreditUnitCostMicrosOverride === null) {
      warnings.push(warning(
        "pricing_missing",
        "Inserisci il costo reale del ciclo Apollo (da fattura/contratto) oppure un costo per lead credit: il provider espone i crediti, non il prezzo monetario dell'abbonamento.",
        "critical",
      ))
    }
    if (!settings.priceVerifiedAt || Date.now() - new Date(settings.priceVerifiedAt).getTime() > 35 * 24 * 60 * 60 * 1000) {
      warnings.push(warning("pricing_stale", "Costo Apollo non verificato negli ultimi 35 giorni: controlla la fattura o il contratto corrente."))
    }
    if (fxError && settings.currency !== settings.commercialCurrency) {
      warnings.push(warning("fx_unavailable", `Cambio ${settings.currency}/${settings.commercialCurrency} non disponibile: ${fxError}. I prezzi commerciali non sono affidabili finché il cambio non torna disponibile.`, "critical"))
    }
    if (fx?.referenceDate) {
      const ageDays = (Date.now() - new Date(`${fx.referenceDate}T12:00:00Z`).getTime()) / (24 * 60 * 60 * 1000)
      if (ageDays > 5) warnings.push(warning("fx_stale", `Cambio BCE del ${fx.referenceDate}: dato più vecchio di 5 giorni.`))
    }
    const remainingPct = leadLimit > 0 ? (leadRemaining / leadLimit) * 100 : 100
    if (leadLimit > 0 && remainingPct <= settings.lowBalanceThresholdPct) {
      warnings.push(warning(
        "low_balance",
        `Crediti lead Apollo al ${remainingPct.toFixed(1)}%: sotto la soglia configurata del ${settings.lowBalanceThresholdPct.toFixed(1)}%.`,
        remainingPct <= 5 ? "critical" : "warning",
      ))
    }
    if (unattributedCredits > 0.01) {
      warnings.push(warning(
        "unattributed_usage",
        `${unattributedCredits.toFixed(2)} crediti del ciclo risultano consumati su Apollo ma non attribuiti a eventi Scout HotelAccelerator.`,
        unattributedCredits > Math.max(5, leadConsumed * 0.1) ? "critical" : "warning",
      ))
    }
    if (providerError) {
      warnings.push(warning("provider_unavailable", `Lettura live Apollo non disponibile: ${providerError}. Mostro l'ultimo snapshot salvato.`, "critical"))
    }
    if (directDialLimit > 0 && directDialRemaining <= 0) {
      warnings.push(warning("direct_dial_exhausted", "I crediti Direct Dial Apollo risultano esauriti. Scout attualmente non li usa, ma il piano provider va controllato.", "info"))
    }
    const priorDifferentLimit = (snapshots ?? []).find((row: any) => number(row.lead_credit_limit) > 0 && number(row.lead_credit_limit) !== leadLimit)
    if (priorDifferentLimit) {
      warnings.push(warning(
        "credit_limit_changed",
        `Il plafond lead Apollo è cambiato rispetto a uno snapshot precedente (${number(priorDifferentLimit.lead_credit_limit)} → ${leadLimit}). Verifica se è cambiato anche il costo del piano.`,
      ))
    }

    return NextResponse.json({
      provider: "apollo",
      settings,
      fx: {
        available: Boolean(fx),
        source: fx?.source || null,
        fromCurrency: settings.currency,
        toCurrency: settings.commercialCurrency,
        rate: fx?.rate ?? null,
        referenceDate: fx?.referenceDate ?? null,
        fetchedAt: fx?.fetchedAt ?? null,
      },
      live: {
        available: Boolean(liveUsage),
        fetchedAt: liveUsage?.fetchedAt || latestSnapshot?.fetched_at || null,
        cycle: { start: cycleStart, end: cycleEnd },
        lead: { limit: leadLimit, consumed: leadConsumed, remaining: leadRemaining },
        directDial: { limit: directDialLimit, consumed: directDialConsumed, remaining: directDialRemaining },
        creditBuckets: allBuckets,
      },
      economics: {
        unitCostMicros,
        customerUnitPriceMicros: fx ? liveEconomics.customerUnitPriceMicros : null,
        providerCostMicros: liveEconomics.providerCostMicros,
        providerCostCustomerMicros: fx ? liveEconomics.providerCostCustomerMicros : null,
        customerValueMicros: fx ? liveEconomics.customerValueMicros : null,
        marginMicros: fx && liveEconomics.providerCostCustomerMicros !== null && liveEconomics.customerValueMicros !== null
          ? Math.max(0, liveEconomics.customerValueMicros - liveEconomics.providerCostCustomerMicros)
          : null,
        remainingProviderValueMicros: remainingEconomics.providerCostMicros,
        remainingProviderValueCustomerMicros: fx ? remainingEconomics.providerCostCustomerMicros : null,
        trackedProviderCostMicros,
        trackedProviderCostCustomerMicros,
        trackedCustomerValueMicros,
        trackedMarginMicros,
      },
      reconciliation: {
        providerConsumedCredits: leadConsumed,
        trackedCredits,
        unattributedCredits,
        attributionPct,
      },
      tenants: Array.from(byProperty.values()).sort((a, b) => b.credits - a.credits),
      warnings,
      snapshots: snapshots ?? [],
      fxSnapshots: fxSnapshots ?? [],
      priceHistory: priceHistory ?? [],
    })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actorEmail = await requireSuperAdmin(request)
    const payload = patchSchema.parse(await request.json())
    const db = createServiceClient()
    const current = await getScoutBillingSettings(db)

    const now = new Date().toISOString()
    const priceTouched = payload.providerCycleCostCents !== undefined || payload.leadCreditUnitCostMicrosOverride !== undefined
    const next = {
      provider_plan_label: payload.providerPlanLabel !== undefined ? payload.providerPlanLabel : current.providerPlanLabel,
      provider_cycle_cost_cents: payload.providerCycleCostCents !== undefined ? payload.providerCycleCostCents : current.providerCycleCostCents,
      lead_credit_unit_cost_micros_override: payload.leadCreditUnitCostMicrosOverride !== undefined
        ? payload.leadCreditUnitCostMicrosOverride
        : current.leadCreditUnitCostMicrosOverride,
      commercial_currency: payload.commercialCurrency ?? current.commercialCurrency,
      fx_source: payload.fxRateOverride !== undefined && payload.fxRateOverride !== null ? "manual_override" : "ecb",
      fx_rate_override: payload.fxRateOverride !== undefined ? payload.fxRateOverride : current.fxRateOverride,
      markup_multiplier: payload.markupMultiplier ?? current.markupMultiplier,
      low_balance_threshold_pct: payload.lowBalanceThresholdPct ?? current.lowBalanceThresholdPct,
      pricing_source: payload.pricingSource ?? current.pricingSource,
      price_verified_at: priceTouched ? now : current.priceVerifiedAt,
      updated_by_email: actorEmail,
      updated_at: now,
    }

    const { error: auditError } = await db.from("platform_scout_billing_settings_audit").insert({
      provider: "apollo",
      currency: current.currency,
      commercial_currency: current.commercialCurrency,
      provider_plan_label: current.providerPlanLabel,
      provider_cycle_cost_cents: current.providerCycleCostCents,
      lead_credit_unit_cost_micros_override: current.leadCreditUnitCostMicrosOverride,
      markup_multiplier: current.markupMultiplier,
      low_balance_threshold_pct: current.lowBalanceThresholdPct,
      pricing_source: current.pricingSource,
      price_verified_at: current.priceVerifiedAt,
      fx_source: current.fxSource,
      fx_rate_override: current.fxRateOverride,
      changed_by_email: actorEmail,
    })
    if (auditError) throw auditError

    const { error: updateError } = await db
      .from("platform_scout_billing_settings")
      .update(next)
      .eq("id", "apollo")
    if (updateError) throw updateError

    const updated = await getScoutBillingSettings(db)
    const { data: latest } = await db
      .from("platform_scout_provider_usage_snapshots")
      .select("lead_credit_limit")
      .eq("provider", "apollo")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const leadLimit = nullableNumber(latest?.lead_credit_limit)
    const fx = await resolveScoutFxRate(db, updated)
    const economics = scoutEconomics(updated, 1, leadLimit, fx.rate)

    return NextResponse.json({
      ok: true,
      settings: updated,
      fx,
      unitCostMicros: economics.unitCostMicros,
      customerUnitPriceMicros: economics.customerUnitPriceMicros,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Configurazione Scout non valida", details: error.flatten() }, { status: 400 })
    }
    return handleServiceError(error)
  }
}
