import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteSsoProduct } from "@/lib/suite-sso/config"
import { SuiteIdentityError } from "@/lib/suite-identity/registry"

/**
 * Preflight for satellite -> Core launch.
 *
 * If the customer already owns a HotelAccelerator property, a stale account
 * entitlement must never be able to reopen a property that the Core itself has
 * disabled, suspended or cancelled. New standalone accounts have no property
 * yet and are validated later by the atomic provisioning function.
 */
export async function assertExistingHotelAcceleratorPropertyUsable(input: {
  product: SuiteSsoProduct
  externalTenantId: string
}) {
  const sb = createServiceClient()
  const { data: tenantLink, error: tenantError } = await sb
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", input.product)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()
  if (tenantError) throw tenantError
  if (!tenantLink?.customer_account_id) return

  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("property_id")
    .eq("id", tenantLink.customer_account_id)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.property_id) return

  const { data: property, error: propertyError } = await sb
    .from("properties")
    .select("is_active, subscription_status")
    .eq("id", account.property_id)
    .maybeSingle()
  if (propertyError) throw propertyError
  if (!property || property.is_active !== true) {
    throw new SuiteIdentityError("hotelaccelerator_property_inactive", 403, "Tenant HotelAccelerator non attivo")
  }
  if (!new Set(["active", "trial"]).has(property.subscription_status ?? "")) {
    throw new SuiteIdentityError(
      "hotelaccelerator_subscription_inactive",
      403,
      "Abbonamento HotelAccelerator non attivo",
    )
  }
}
