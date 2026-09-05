import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteProductKey } from "@/lib/customer-codes/product"
import { resolveSuiteCustomerAccountId } from "@/lib/suite-addons/entitlements"

export const REVIEWS_UNIT_MONTHLY_CENTS = 50
export const REVIEWS_MIN_MONTHLY_CENTS = 500
export const REVIEWS_ANNUAL_DISCOUNT_PERCENT = 20
export const REVIEWS_STRIPE_PRODUCT_ID = "prod_VB97snP6kDRGFA"

export type ReviewsBillingCycle = "monthly" | "yearly"

export function reviewsPriceCents(accommodationCount: number, cycle: ReviewsBillingCycle) {
  const monthly = Math.max(REVIEWS_MIN_MONTHLY_CENTS, accommodationCount * REVIEWS_UNIT_MONTHLY_CENTS)
  return cycle === "yearly" ? Math.round(monthly * 12 * 0.8) : monthly
}

export async function getReviewsBillingProfile(customerAccountId: string) {
  const db = createServiceClient()
  const { data, error } = await db
    .from("suite_addon_billing_profiles")
    .select("accommodation_count,source_product_key,confirmed_at")
    .eq("customer_account_id", customerAccountId)
    .eq("addon_key", "reviews")
    .maybeSingle()
  if (error) {
    if (error.code === "42P01") return null
    throw error
  }
  return data
    ? {
        accommodationCount: Number(data.accommodation_count),
        sourceProductKey: data.source_product_key as SuiteProductKey,
        confirmedAt: data.confirmed_at as string,
      }
    : null
}

export async function saveReviewsBillingProfile(input: {
  productKey: SuiteProductKey
  externalTenantId: string
  accommodationCount: number
}) {
  if (!Number.isInteger(input.accommodationCount) || input.accommodationCount < 1 || input.accommodationCount > 10000) {
    throw new Error("invalid_accommodation_count")
  }
  const customerAccountId = await resolveSuiteCustomerAccountId(input)
  if (!customerAccountId) throw new Error("customer_account_not_linked")
  const db = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await db.from("suite_addon_billing_profiles").upsert(
    {
      customer_account_id: customerAccountId,
      addon_key: "reviews",
      accommodation_count: input.accommodationCount,
      source_product_key: input.productKey,
      confirmed_at: now,
      updated_at: now,
    },
    { onConflict: "customer_account_id,addon_key" },
  )
  if (error) throw error
  return { customerAccountId, accommodationCount: input.accommodationCount, confirmedAt: now }
}
