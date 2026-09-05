import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { setModuleStatus, type ModuleStatus } from "@/lib/modules"
import type { SuiteProductKey } from "@/lib/customer-codes/product"

const SATELLITE_PRODUCTS = new Set<SuiteProductKey>(["santaddeo", "hotelprofitai", "manubot"])
const ACTIVE_ENTITLEMENTS = new Set(["active", "trial"])

function localStatus(status: string): ModuleStatus {
  return status === "trial" ? "trial" : status === "active" ? "active" : "inactive"
}

export async function syncSuiteProductModule(params: {
  supabase: SupabaseClient
  customerAccountId: string
  productKey: SuiteProductKey
}) {
  const { supabase, customerAccountId, productKey } = params
  if (!SATELLITE_PRODUCTS.has(productKey)) return

  const [{ data: account, error: accountError }, { data: entitlement, error: entitlementError }, { data: link, error: linkError }] =
    await Promise.all([
      supabase.from("customer_accounts").select("property_id").eq("id", customerAccountId).maybeSingle(),
      supabase
        .from("suite_product_entitlements")
        .select("status, expires_at")
        .eq("customer_account_id", customerAccountId)
        .eq("product_key", productKey)
        .maybeSingle(),
      supabase
        .from("suite_tenant_links")
        .select("external_tenant_id")
        .eq("customer_account_id", customerAccountId)
        .eq("product_key", productKey)
        .maybeSingle(),
    ])

  if (accountError) throw accountError
  if (entitlementError) throw entitlementError
  if (linkError) throw linkError
  if (!account?.property_id) return

  const activeEntitlement =
    entitlement &&
    ACTIVE_ENTITLEMENTS.has(entitlement.status) &&
    (!entitlement.expires_at || new Date(entitlement.expires_at).getTime() >= Date.now())
      ? entitlement
      : null
  const linked = Boolean(link?.external_tenant_id)

  await setModuleStatus({
    propertyId: account.property_id,
    moduleKey: productKey,
    status: linked && activeEntitlement ? localStatus(activeEntitlement.status) : "inactive",
    expiresAt: linked && activeEntitlement ? activeEntitlement.expires_at : null,
  })
}
