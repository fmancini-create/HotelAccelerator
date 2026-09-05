import "server-only"

import type Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { setSuiteAddonEntitlementSource, type SuiteAddonStatus } from "@/lib/suite-addons/entitlements"
import type { SuiteProductKey } from "@/lib/customer-codes/product"

function toIso(seconds?: number | null) {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

function statusFromStripe(status: Stripe.Subscription.Status): SuiteAddonStatus {
  if (status === "active") return "active"
  if (status === "trialing") return "trial"
  if (status === "past_due" || status === "unpaid" || status === "paused") return "suspended"
  if (status === "canceled" || status === "incomplete_expired") return "cancelled"
  return "inactive"
}

export async function persistReviewsStripeSubscription(input: {
  subscription: Stripe.Subscription
  checkoutSessionId?: string | null
  amountCents: number
}) {
  const metadata = input.subscription.metadata || {}
  if (metadata.kind !== "suite_addon" || metadata.addon_key !== "reviews") throw new Error("invalid_suite_addon_subscription")

  const customerAccountId = metadata.customer_account_id?.trim()
  const sourceProductKey = metadata.source_product_key?.trim() as SuiteProductKey
  const sourceExternalTenantId = metadata.source_external_tenant_id?.trim()
  const billingCycle = metadata.billing_cycle === "yearly" ? "yearly" : "monthly"
  const accommodationCount = Number(metadata.accommodation_count)
  if (!customerAccountId || !sourceExternalTenantId || !["hotelaccelerator", "manubot"].includes(sourceProductKey)) {
    throw new Error("invalid_suite_addon_metadata")
  }
  if (!Number.isInteger(accommodationCount) || accommodationCount < 1) throw new Error("invalid_accommodation_count")

  const sub = input.subscription as Stripe.Subscription & { current_period_start?: number; current_period_end?: number }
  const periodStart = toIso(sub.current_period_start)
  const periodEnd = toIso(sub.current_period_end)
  const db = createServiceClient()
  const { error } = await db.from("suite_addon_commercial_subscriptions").upsert(
    {
      customer_account_id: customerAccountId,
      addon_key: "reviews",
      source_product_key: sourceProductKey,
      source_external_tenant_id: sourceExternalTenantId,
      stripe_checkout_session_id: input.checkoutSessionId ?? null,
      stripe_subscription_id: input.subscription.id,
      stripe_customer_id: typeof input.subscription.customer === "string" ? input.subscription.customer : input.subscription.customer.id,
      status: input.subscription.status,
      billing_cycle: billingCycle,
      accommodation_count: accommodationCount,
      amount_cents: input.amountCents,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: input.subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  )
  if (error) throw error

  await setSuiteAddonEntitlementSource({
    customerAccountId,
    addonKey: "reviews",
    sourceProductKey,
    sourceExternalTenantId,
    status: statusFromStripe(input.subscription.status),
    activatedAt: periodStart,
    expiresAt: periodEnd,
    metadata: {
      billing_source: "hotelaccelerator_core",
      stripe_subscription_id: input.subscription.id,
      accommodation_count: accommodationCount,
      billing_cycle: billingCycle,
    },
  })

  return { customerAccountId, sourceProductKey, sourceExternalTenantId, status: input.subscription.status, periodEnd }
}
