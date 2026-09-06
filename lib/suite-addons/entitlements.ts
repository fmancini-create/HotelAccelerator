import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteProductKey } from "@/lib/customer-codes/product"

export const SUITE_ADDONS = ["reviews", "web_traffic"] as const
export type SuiteAddonKey = (typeof SUITE_ADDONS)[number]
export type SuiteAddonStatus = "active" | "trial" | "inactive" | "suspended" | "cancelled"

export type SuiteAddonEntitlement = {
  addonKey: SuiteAddonKey
  status: SuiteAddonStatus
  activatedAt: string | null
  expiresAt: string | null
  activeSourceCount: number
  active: boolean
}

export function isSuiteAddonKey(value: string | null | undefined): value is SuiteAddonKey {
  return Boolean(value && (SUITE_ADDONS as readonly string[]).includes(value))
}

export function isSuiteAddonStatus(value: string | null | undefined): value is SuiteAddonStatus {
  return value === "active" || value === "trial" || value === "inactive" || value === "suspended" || value === "cancelled"
}

function isEffective(status: SuiteAddonStatus, expiresAt: string | null) {
  if (status !== "active" && status !== "trial") return false
  return !expiresAt || new Date(expiresAt).getTime() > Date.now()
}

export async function resolveSuiteCustomerAccountId(input: {
  productKey: SuiteProductKey
  externalTenantId: string
}): Promise<string | null> {
  const externalTenantId = input.externalTenantId.trim()
  if (!externalTenantId) return null

  const db = createServiceClient()
  if (input.productKey === "hotelaccelerator") {
    const { data, error } = await db
      .from("customer_accounts")
      .select("id")
      .eq("property_id", externalTenantId)
      .maybeSingle()
    if (error) throw error
    return (data?.id as string | undefined) ?? null
  }

  const { data, error } = await db
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", input.productKey)
    .eq("external_tenant_id", externalTenantId)
    .maybeSingle()
  if (error) throw error
  return (data?.customer_account_id as string | undefined) ?? null
}

export async function getSuiteAddonEntitlement(input: {
  customerAccountId: string
  addonKey: SuiteAddonKey
}): Promise<SuiteAddonEntitlement | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .from("suite_addon_entitlements")
    .select("addon_key,status,activated_at,expires_at,active_source_count")
    .eq("customer_account_id", input.customerAccountId)
    .eq("addon_key", input.addonKey)
    .maybeSingle()

  // Additive rollout: a deploy that reaches an environment before the migration
  // must treat the suite entitlement as absent, never break the tenant UI.
  if (error) {
    if (error.code === "42P01") return null
    throw error
  }
  if (!data || !isSuiteAddonStatus(data.status as string)) return null

  const status = data.status as SuiteAddonStatus
  const expiresAt = (data.expires_at as string | null) ?? null
  return {
    addonKey: data.addon_key as SuiteAddonKey,
    status,
    activatedAt: (data.activated_at as string | null) ?? null,
    expiresAt,
    activeSourceCount: Number(data.active_source_count ?? 0),
    active: isEffective(status, expiresAt),
  }
}

export async function getSuiteAddonEntitlementForTenant(input: {
  productKey: SuiteProductKey
  externalTenantId: string
  addonKey: SuiteAddonKey
}) {
  const customerAccountId = await resolveSuiteCustomerAccountId(input)
  if (!customerAccountId) return null
  return getSuiteAddonEntitlement({ customerAccountId, addonKey: input.addonKey })
}

export async function setSuiteAddonEntitlementSource(input: {
  customerAccountId: string
  addonKey: SuiteAddonKey
  sourceProductKey: SuiteProductKey
  sourceExternalTenantId: string
  status: SuiteAddonStatus
  activatedAt?: string | null
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}) {
  const db = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await db.from("suite_addon_entitlement_sources").upsert(
    {
      customer_account_id: input.customerAccountId,
      addon_key: input.addonKey,
      source_product_key: input.sourceProductKey,
      source_external_tenant_id: input.sourceExternalTenantId.trim(),
      status: input.status,
      activated_at:
        input.status === "active" || input.status === "trial"
          ? input.activatedAt ?? now
          : input.activatedAt ?? null,
      expires_at: input.expiresAt ?? null,
      metadata: input.metadata ?? {},
      updated_at: now,
    },
    { onConflict: "customer_account_id,addon_key,source_product_key,source_external_tenant_id" },
  )
  if (error) throw error

  const { error: refreshError } = await db.rpc("refresh_suite_addon_entitlement", {
    p_customer_account_id: input.customerAccountId,
    p_addon_key: input.addonKey,
  })
  if (refreshError) throw refreshError

  return getSuiteAddonEntitlement({ customerAccountId: input.customerAccountId, addonKey: input.addonKey })
}
