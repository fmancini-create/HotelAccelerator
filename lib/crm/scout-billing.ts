import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getApolloCreditUsageStats, type ApolloCreditUsageStats } from "@/lib/integrations/apollo/client"
import { getEcbFxRate } from "@/lib/integrations/ecb/fx"

const FX_STALE_AFTER_MS = 36 * 60 * 60 * 1000

export type ScoutBillingSettings = {
  /** Valuta del costo provider/contratto. */
  currency: string
  /** Valuta commerciale mostrata e fatturata ai tenant. */
  commercialCurrency: string
  providerPlanLabel: string | null
  providerCycleCostCents: number | null
  leadCreditUnitCostMicrosOverride: number | null
  markupMultiplier: number
  lowBalanceThresholdPct: number
  pricingSource: string
  priceVerifiedAt: string | null
  fxSource: string
  fxRateOverride: number | null
  updatedAt: string | null
}

export type ScoutFxRate = {
  source: "identity" | "ecb" | "manual_override" | "snapshot"
  fromCurrency: string
  toCurrency: string
  rate: number
  referenceDate: string | null
  fetchedAt: string | null
}

export type ScoutEconomics = {
  providerCurrency: string
  customerCurrency: string
  unitCostMicros: number | null
  providerCostMicros: number | null
  fxRate: number
  providerCostCustomerMicros: number | null
  multiplier: number
  customerUnitPriceMicros: number | null
  customerValueMicros: number | null
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function currency(value: unknown, fallback: string) {
  const normalized = String(value || fallback).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback
}

export async function getScoutBillingSettings(db: SupabaseClient): Promise<ScoutBillingSettings> {
  const { data, error } = await db
    .from("platform_scout_billing_settings")
    .select("currency,commercial_currency,provider_plan_label,provider_cycle_cost_cents,lead_credit_unit_cost_micros_override,markup_multiplier,low_balance_threshold_pct,pricing_source,price_verified_at,fx_source,fx_rate_override,updated_at")
    .eq("id", "apollo")
    .maybeSingle()
  if (error) throw error

  return {
    currency: currency(data?.currency, "USD"),
    commercialCurrency: currency(data?.commercial_currency, "EUR"),
    providerPlanLabel: data?.provider_plan_label ? String(data.provider_plan_label) : null,
    providerCycleCostCents: nullableNumber(data?.provider_cycle_cost_cents),
    leadCreditUnitCostMicrosOverride: nullableNumber(data?.lead_credit_unit_cost_micros_override),
    markupMultiplier: positiveNumber(data?.markup_multiplier, 3),
    lowBalanceThresholdPct: nullableNumber(data?.low_balance_threshold_pct) ?? 20,
    pricingSource: String(data?.pricing_source || "manual_invoice"),
    priceVerifiedAt: data?.price_verified_at ? String(data.price_verified_at) : null,
    fxSource: String(data?.fx_source || "ecb"),
    fxRateOverride: nullableNumber(data?.fx_rate_override),
    updatedAt: data?.updated_at ? String(data.updated_at) : null,
  }
}

export function effectiveLeadUnitCostMicros(settings: ScoutBillingSettings, leadCreditLimit: number | null) {
  if (settings.leadCreditUnitCostMicrosOverride !== null) {
    return Math.round(settings.leadCreditUnitCostMicrosOverride)
  }
  if (settings.providerCycleCostCents === null || !leadCreditLimit || leadCreditLimit <= 0) return null

  // 1 centesimo = 10.000 micro-unita monetarie.
  return Math.round((settings.providerCycleCostCents * 10_000) / leadCreditLimit)
}

export async function latestScoutFxRate(
  db: SupabaseClient,
  fromCurrency: string,
  toCurrency: string,
): Promise<ScoutFxRate | null> {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  if (from === to) {
    return { source: "identity", fromCurrency: from, toCurrency: to, rate: 1, referenceDate: null, fetchedAt: null }
  }

  const { data, error } = await db
    .from("platform_scout_fx_snapshots")
    .select("source,from_currency,to_currency,rate,reference_date,fetched_at")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .order("reference_date", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const rate = Number(data.rate)
  if (!Number.isFinite(rate) || rate <= 0) return null
  return {
    source: data.source === "manual_override" ? "manual_override" : "snapshot",
    fromCurrency: from,
    toCurrency: to,
    rate,
    referenceDate: data.reference_date ? String(data.reference_date) : null,
    fetchedAt: data.fetched_at ? String(data.fetched_at) : null,
  }
}

export async function syncScoutFxSnapshot(
  db: SupabaseClient,
  settings?: ScoutBillingSettings,
): Promise<ScoutFxRate> {
  const current = settings ?? await getScoutBillingSettings(db)
  const from = current.currency
  const to = current.commercialCurrency
  if (from === to) {
    return { source: "identity", fromCurrency: from, toCurrency: to, rate: 1, referenceDate: null, fetchedAt: new Date().toISOString() }
  }

  if (current.fxRateOverride !== null && current.fxRateOverride > 0) {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const { error } = await db.from("platform_scout_fx_snapshots").upsert({
      source: "manual_override",
      from_currency: from,
      to_currency: to,
      rate: current.fxRateOverride,
      reference_date: today,
      fetched_at: now,
      metadata: { configured_source: current.fxSource },
    }, { onConflict: "source,from_currency,to_currency,reference_date" })
    if (error) throw error
    return {
      source: "manual_override",
      fromCurrency: from,
      toCurrency: to,
      rate: current.fxRateOverride,
      referenceDate: today,
      fetchedAt: now,
    }
  }

  const live = await getEcbFxRate(from, to)
  const { error } = await db.from("platform_scout_fx_snapshots").upsert({
    source: "ecb",
    from_currency: from,
    to_currency: to,
    rate: Number(live.rate.toFixed(8)),
    reference_date: live.referenceDate,
    fetched_at: live.fetchedAt,
    metadata: { base_currency: "EUR" },
  }, { onConflict: "source,from_currency,to_currency,reference_date" })
  if (error) throw error

  return {
    source: "ecb",
    fromCurrency: from,
    toCurrency: to,
    rate: live.rate,
    referenceDate: live.referenceDate,
    fetchedAt: live.fetchedAt,
  }
}

export async function resolveScoutFxRate(db: SupabaseClient, settings?: ScoutBillingSettings): Promise<ScoutFxRate> {
  const current = settings ?? await getScoutBillingSettings(db)
  if (current.currency === current.commercialCurrency) {
    return {
      source: "identity",
      fromCurrency: current.currency,
      toCurrency: current.commercialCurrency,
      rate: 1,
      referenceDate: null,
      fetchedAt: null,
    }
  }
  if (current.fxRateOverride !== null && current.fxRateOverride > 0) {
    return syncScoutFxSnapshot(db, current)
  }

  const latest = await latestScoutFxRate(db, current.currency, current.commercialCurrency)
  const fetchedMs = latest?.fetchedAt ? new Date(latest.fetchedAt).getTime() : 0
  const stale = !fetchedMs || Date.now() - fetchedMs > FX_STALE_AFTER_MS
  if (!stale && latest) return latest

  try {
    return await syncScoutFxSnapshot(db, current)
  } catch (error) {
    if (latest) {
      console.error("[scout] ECB FX refresh failed, using latest snapshot", error)
      return latest
    }
    throw error
  }
}

export function scoutEconomics(
  settings: ScoutBillingSettings,
  creditsUsed: number,
  leadCreditLimit: number | null,
  fxRate = 1,
): ScoutEconomics {
  const unitCostMicros = effectiveLeadUnitCostMicros(settings, leadCreditLimit)
  const normalizedCredits = Number.isFinite(creditsUsed) ? Math.max(0, creditsUsed) : 0
  const normalizedFx = Number.isFinite(fxRate) && fxRate > 0 ? fxRate : 1
  const providerCostMicros = unitCostMicros === null ? null : Math.round(unitCostMicros * normalizedCredits)
  const providerCostCustomerMicros = providerCostMicros === null
    ? null
    : Math.round(providerCostMicros * normalizedFx)
  const customerValueMicros = providerCostCustomerMicros === null
    ? null
    : Math.round(providerCostCustomerMicros * settings.markupMultiplier)
  const customerUnitPriceMicros = unitCostMicros === null
    ? null
    : Math.round(unitCostMicros * normalizedFx * settings.markupMultiplier)

  return {
    providerCurrency: settings.currency,
    customerCurrency: settings.commercialCurrency,
    unitCostMicros,
    providerCostMicros,
    fxRate: normalizedFx,
    providerCostCustomerMicros,
    multiplier: settings.markupMultiplier,
    customerUnitPriceMicros,
    customerValueMicros,
  }
}

export async function latestLeadCreditLimit(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db
    .from("platform_scout_provider_usage_snapshots")
    .select("lead_credit_limit")
    .eq("provider", "apollo")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return nullableNumber(data?.lead_credit_limit)
}

export async function economicsForScoutUsage(db: SupabaseClient, creditsUsed: number): Promise<ScoutEconomics> {
  const [settings, leadLimit] = await Promise.all([
    getScoutBillingSettings(db),
    latestLeadCreditLimit(db),
  ])
  const fx = await resolveScoutFxRate(db, settings)
  return scoutEconomics(settings, creditsUsed, leadLimit, fx.rate)
}

export async function persistApolloUsageSnapshot(
  db: SupabaseClient,
  usage: ApolloCreditUsageStats,
  source: "api" | "cron" | "manual" = "api",
) {
  const lead = usage.credits.lead_credit ?? { limit: 0, consumed: 0, leftOver: 0 }
  const direct = usage.credits.direct_dial_credit ?? { limit: 0, consumed: 0, leftOver: 0 }
  const { data, error } = await db
    .from("platform_scout_provider_usage_snapshots")
    .insert({
      provider: "apollo",
      source,
      cycle_start: usage.currentCycle.startDate,
      cycle_end: usage.currentCycle.endDate,
      lead_credit_limit: lead.limit,
      lead_credit_consumed: lead.consumed,
      lead_credit_remaining: lead.leftOver,
      direct_dial_limit: direct.limit,
      direct_dial_consumed: direct.consumed,
      direct_dial_remaining: direct.leftOver,
      credit_usage: usage.credits,
      fetched_at: usage.fetchedAt,
    })
    .select("id,fetched_at")
    .single()
  if (error) throw error
  return data
}

/**
 * Legge il provider e salva lo snapshot nello stesso passaggio. Questa e' la
 * singola funzione usata sia dalla pagina superadmin sia dal cron, per evitare
 * che i due percorsi calcolino i saldi in modo diverso.
 */
export async function syncApolloUsageSnapshot(
  db: SupabaseClient,
  source: "api" | "cron" | "manual" = "api",
) {
  const usage = await getApolloCreditUsageStats()
  await persistApolloUsageSnapshot(db, usage, source)
  return usage
}

export function moneyFromMicros(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return value / 1_000_000
}
