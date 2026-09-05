import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getApolloCreditUsageStats, type ApolloCreditUsageStats } from "@/lib/integrations/apollo/client"

export type ScoutBillingSettings = {
  currency: string
  providerPlanLabel: string | null
  providerCycleCostCents: number | null
  leadCreditUnitCostMicrosOverride: number | null
  markupMultiplier: number
  lowBalanceThresholdPct: number
  pricingSource: string
  priceVerifiedAt: string | null
  updatedAt: string | null
}

export type ScoutEconomics = {
  currency: string
  unitCostMicros: number | null
  providerCostMicros: number | null
  multiplier: number
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

export async function getScoutBillingSettings(db: SupabaseClient): Promise<ScoutBillingSettings> {
  const { data, error } = await db
    .from("platform_scout_billing_settings")
    .select("currency,provider_plan_label,provider_cycle_cost_cents,lead_credit_unit_cost_micros_override,markup_multiplier,low_balance_threshold_pct,pricing_source,price_verified_at,updated_at")
    .eq("id", "apollo")
    .maybeSingle()
  if (error) throw error

  return {
    currency: String(data?.currency || "EUR").toUpperCase(),
    providerPlanLabel: data?.provider_plan_label ? String(data.provider_plan_label) : null,
    providerCycleCostCents: nullableNumber(data?.provider_cycle_cost_cents),
    leadCreditUnitCostMicrosOverride: nullableNumber(data?.lead_credit_unit_cost_micros_override),
    markupMultiplier: positiveNumber(data?.markup_multiplier, 3),
    lowBalanceThresholdPct: nullableNumber(data?.low_balance_threshold_pct) ?? 20,
    pricingSource: String(data?.pricing_source || "manual_invoice"),
    priceVerifiedAt: data?.price_verified_at ? String(data.price_verified_at) : null,
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

export function scoutEconomics(
  settings: ScoutBillingSettings,
  creditsUsed: number,
  leadCreditLimit: number | null,
): ScoutEconomics {
  const unitCostMicros = effectiveLeadUnitCostMicros(settings, leadCreditLimit)
  const normalizedCredits = Number.isFinite(creditsUsed) ? Math.max(0, creditsUsed) : 0
  const providerCostMicros = unitCostMicros === null ? null : Math.round(unitCostMicros * normalizedCredits)
  const customerValueMicros = providerCostMicros === null
    ? null
    : Math.round(providerCostMicros * settings.markupMultiplier)

  return {
    currency: settings.currency,
    unitCostMicros,
    providerCostMicros,
    multiplier: settings.markupMultiplier,
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
  return scoutEconomics(settings, creditsUsed, leadLimit)
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
