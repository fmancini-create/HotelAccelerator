import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { isModuleActive } from "@/lib/modules"

export const SCOUT_MODULE_KEY = "scout"
export const SCOUT_PROVIDER = "apollo"
export const SCOUT_EMAIL_ENRICHMENT = "email_enrichment"

export class ScoutBillingError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = "ScoutBillingError"
    this.code = code
    this.status = status
  }
}

export type ScoutBillingSettings = {
  activationFeeCents: number | null
  activationIncludedCredits: number
  markupMultiplier: number
  minimumPurchaseCredits: number
  updatedAt: string | null
}

export type ScoutProviderCost = {
  id: string
  provider: string
  operation: string
  costMicroEur: number
  effectiveFrom: string
  createdAt: string
}

/**
 * Contratto tenant-safe. Non aggiungere qui costo provider, moltiplicatore,
 * margine o economics interni: questo oggetto viene serializzato verso UI/API tenant.
 */
export type ScoutTenantBillingState = {
  active: boolean
  balance: number
  reservedCredits: number
  availableCredits: number
  activationFeeCents: number | null
  activationIncludedCredits: number
  minimumPurchaseCredits: number
  creditPriceCents: number | null
  pricingConfigured: boolean
}

function asNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 1 EUR = 1.000.000 micro-EUR; 1 cent = 10.000 micro-EUR. */
export function scoutCreditPriceCents(costMicroEur: number | null, multiplier: number): number | null {
  if (costMicroEur === null || !Number.isFinite(costMicroEur) || costMicroEur < 0) return null
  if (!Number.isFinite(multiplier) || multiplier < 1) return null
  return Math.ceil((costMicroEur * multiplier) / 10_000)
}

export async function getScoutBillingSettings(db: SupabaseClient): Promise<ScoutBillingSettings> {
  const { data, error } = await db
    .from("scout_billing_settings")
    .select("activation_fee_cents,activation_included_credits,markup_multiplier,minimum_purchase_credits,updated_at")
    .eq("id", true)
    .maybeSingle()

  if (error) throw error
  return {
    activationFeeCents: data?.activation_fee_cents == null ? null : asNumber(data.activation_fee_cents),
    activationIncludedCredits: Math.max(0, Math.trunc(asNumber(data?.activation_included_credits))),
    markupMultiplier: Math.max(1, asNumber(data?.markup_multiplier, 3)),
    minimumPurchaseCredits: Math.max(1, Math.trunc(asNumber(data?.minimum_purchase_credits, 10))),
    updatedAt: data?.updated_at ?? null,
  }
}

export async function getCurrentScoutProviderCost(
  db: SupabaseClient,
  operation = SCOUT_EMAIL_ENRICHMENT,
): Promise<ScoutProviderCost | null> {
  const { data, error } = await db
    .from("scout_provider_cost_history")
    .select("id,provider,operation,cost_micro_eur,effective_from,created_at")
    .eq("provider", SCOUT_PROVIDER)
    .eq("operation", operation)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    provider: data.provider,
    operation: data.operation,
    costMicroEur: asNumber(data.cost_micro_eur),
    effectiveFrom: data.effective_from,
    createdAt: data.created_at,
  }
}

export async function getScoutTenantBillingState(
  db: SupabaseClient,
  propertyId: string,
): Promise<ScoutTenantBillingState> {
  const [active, settings, providerCost, accountResult] = await Promise.all([
    isModuleActive(db, propertyId, SCOUT_MODULE_KEY),
    getScoutBillingSettings(db),
    getCurrentScoutProviderCost(db),
    db
      .from("scout_credit_accounts")
      .select("balance,reserved_credits")
      .eq("property_id", propertyId)
      .maybeSingle(),
  ])

  if (accountResult.error) throw accountResult.error
  const row = accountResult.data
  const balance = Math.max(0, Math.trunc(asNumber(row?.balance)))
  const reservedCredits = Math.max(0, Math.trunc(asNumber(row?.reserved_credits)))
  const creditPriceCents = scoutCreditPriceCents(providerCost?.costMicroEur ?? null, settings.markupMultiplier)

  return {
    active,
    balance,
    reservedCredits,
    availableCredits: Math.max(0, balance - reservedCredits),
    activationFeeCents: settings.activationFeeCents,
    activationIncludedCredits: settings.activationIncludedCredits,
    minimumPurchaseCredits: settings.minimumPurchaseCredits,
    creditPriceCents,
    pricingConfigured: Boolean(providerCost && creditPriceCents !== null && creditPriceCents > 0),
  }
}

export async function requireScoutEntitlement(db: SupabaseClient, propertyId: string) {
  const active = await isModuleActive(db, propertyId, SCOUT_MODULE_KEY)
  if (!active) {
    throw new ScoutBillingError(
      "SCOUT_ADDON_REQUIRED",
      "HotelAccelerator Scout è un add-on a pagamento. Attivalo prima di utilizzare il servizio.",
      402,
    )
  }
}

function mapRpcError(error: { message?: string } | null | undefined): never {
  const message = error?.message || "Operazione crediti Scout non completata."
  if (message.includes("SCOUT_INSUFFICIENT_CREDITS")) {
    throw new ScoutBillingError(
      "SCOUT_INSUFFICIENT_CREDITS",
      "Crediti Scout insufficienti. Acquista nuovi crediti per continuare.",
      402,
    )
  }
  if (message.includes("SCOUT_USAGE_IN_PROGRESS")) {
    throw new ScoutBillingError(
      "SCOUT_USAGE_IN_PROGRESS",
      "La verifica di questo prospect è già in corso.",
      409,
    )
  }
  if (message.includes("SCOUT_USAGE_ALREADY_COMPLETED")) {
    throw new ScoutBillingError(
      "SCOUT_USAGE_ALREADY_COMPLETED",
      "Questo prospect è già stato verificato.",
      409,
    )
  }
  throw new ScoutBillingError("SCOUT_BILLING_ERROR", message, 500)
}

export async function reserveScoutEmailEnrichment(
  db: SupabaseClient,
  params: { propertyId: string; prospectId: string; attemptKey: string },
) {
  await requireScoutEntitlement(db, params.propertyId)
  const [settings, providerCost] = await Promise.all([
    getScoutBillingSettings(db),
    getCurrentScoutProviderCost(db, SCOUT_EMAIL_ENRICHMENT),
  ])
  if (!providerCost) {
    throw new ScoutBillingError(
      "SCOUT_PRICING_NOT_CONFIGURED",
      "Il listino Scout non è ancora configurato. Contatta l'amministratore della piattaforma.",
      503,
    )
  }
  const retailAmountCents = scoutCreditPriceCents(providerCost.costMicroEur, settings.markupMultiplier)
  if (retailAmountCents === null || retailAmountCents <= 0) {
    throw new ScoutBillingError(
      "SCOUT_PRICING_NOT_CONFIGURED",
      "Il listino Scout non è ancora configurato. Contatta l'amministratore della piattaforma.",
      503,
    )
  }

  const { data, error } = await db.rpc("scout_reserve_usage", {
    p_property_id: params.propertyId,
    p_operation: SCOUT_EMAIL_ENRICHMENT,
    p_subject_id: params.prospectId,
    p_attempt_key: params.attemptKey,
    p_credits: 1,
    p_provider_cost_micro_eur: providerCost.costMicroEur,
    p_markup_multiplier: settings.markupMultiplier,
    p_retail_amount_cents: retailAmountCents,
  })
  if (error) mapRpcError(error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.operation_id) throw new ScoutBillingError("SCOUT_RESERVATION_FAILED", "Riserva credito Scout non riuscita.", 500)
  return {
    operationId: String(row.operation_id),
    balance: asNumber(row.balance),
    reservedCredits: asNumber(row.reserved),
    availableCredits: asNumber(row.available),
  }
}

export async function completeScoutUsage(db: SupabaseClient, operationId: string) {
  const { data, error } = await db.rpc("scout_complete_usage", { p_operation_id: operationId })
  if (error) mapRpcError(error)
  const row = Array.isArray(data) ? data[0] : data
  return {
    balance: asNumber(row?.balance),
    reservedCredits: asNumber(row?.reserved),
    availableCredits: asNumber(row?.available),
  }
}

export async function refundScoutUsage(db: SupabaseClient, operationId: string) {
  const { data, error } = await db.rpc("scout_refund_usage", { p_operation_id: operationId })
  if (error) mapRpcError(error)
  const row = Array.isArray(data) ? data[0] : data
  return {
    balance: asNumber(row?.balance),
    reservedCredits: asNumber(row?.reserved),
    availableCredits: asNumber(row?.available),
  }
}

export async function addScoutCredits(
  db: SupabaseClient,
  params: {
    propertyId: string
    credits: number
    eventType: "activation_bonus" | "purchase" | "admin_adjustment" | "migration"
    idempotencyKey: string
    stripeSessionId?: string | null
    metadata?: Record<string, unknown>
  },
) {
  if (!Number.isInteger(params.credits) || params.credits <= 0) {
    throw new ScoutBillingError("SCOUT_INVALID_CREDITS", "Numero di crediti Scout non valido.")
  }
  const { data, error } = await db.rpc("scout_apply_credit_delta", {
    p_property_id: params.propertyId,
    p_delta: params.credits,
    p_event_type: params.eventType,
    p_idempotency_key: params.idempotencyKey,
    p_operation: null,
    p_provider_cost_micro_eur: null,
    p_markup_multiplier: null,
    p_retail_amount_cents: null,
    p_stripe_session_id: params.stripeSessionId ?? null,
    p_metadata: params.metadata ?? {},
  })
  if (error) mapRpcError(error)
  return asNumber(data)
}
