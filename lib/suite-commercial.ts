import type { SupabaseClient } from "@supabase/supabase-js"

export const SUITE_PRODUCTS = ["hotelaccelerator", "santaddeo", "hotelprofitai", "manubot"] as const
export type SuiteProduct = (typeof SUITE_PRODUCTS)[number]

const SATELLITE_PRODUCTS = new Set<SuiteProduct>(["santaddeo", "hotelprofitai", "manubot"])

export interface SuiteCommercialSettings {
  crossSellEnabled: boolean
  crossSellDiscountPercent: number
  allowPromotionStacking: boolean
}

export interface SuiteCommercialContext {
  settings: SuiteCommercialSettings
  customerProducts: Set<SuiteProduct>
}

export interface CrossSellOffer {
  eligible: boolean
  discountPercent: number
  allowPromotionStacking: boolean
  sourceProducts: SuiteProduct[]
}

const DEFAULT_SETTINGS: SuiteCommercialSettings = {
  crossSellEnabled: true,
  crossSellDiscountPercent: 10,
  allowPromotionStacking: false,
}

export async function getSuiteCommercialSettings(
  supabase: SupabaseClient,
): Promise<SuiteCommercialSettings> {
  const { data, error } = await supabase
    .from("suite_commercial_settings")
    .select("cross_sell_enabled, cross_sell_discount_percent, allow_promotion_stacking")
    .eq("id", "default")
    .maybeSingle()

  if (error) throw new Error(`getSuiteCommercialSettings: ${error.message}`)
  if (!data) return DEFAULT_SETTINGS

  return {
    crossSellEnabled: data.cross_sell_enabled !== false,
    crossSellDiscountPercent: Number(data.cross_sell_discount_percent ?? 10),
    allowPromotionStacking: data.allow_promotion_stacking === true,
  }
}

export async function getSuiteCommercialContext(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<SuiteCommercialContext> {
  const [settings, propertyResult, modulesResult, accountResult] = await Promise.all([
    getSuiteCommercialSettings(supabase),
    supabase.from("properties").select("subscription_status").eq("id", propertyId).maybeSingle(),
    supabase
      .from("tenant_modules")
      .select("module_key, status, expires_at")
      .eq("property_id", propertyId)
      .in("module_key", ["santaddeo", "hotelprofitai", "manubot"]),
    supabase.from("customer_accounts").select("id").eq("property_id", propertyId).maybeSingle(),
  ])

  if (propertyResult.error) throw new Error(`getSuiteCommercialContext property: ${propertyResult.error.message}`)
  if (modulesResult.error) throw new Error(`getSuiteCommercialContext modules: ${modulesResult.error.message}`)
  if (accountResult.error) throw new Error(`getSuiteCommercialContext account: ${accountResult.error.message}`)

  const customerProducts = new Set<SuiteProduct>()
  if (propertyResult.data?.subscription_status === "active") customerProducts.add("hotelaccelerator")

  const now = Date.now()
  for (const row of modulesResult.data ?? []) {
    if (row.status !== "active") continue
    if (row.expires_at && new Date(row.expires_at).getTime() < now) continue
    const key = row.module_key as SuiteProduct
    if (SATELLITE_PRODUCTS.has(key)) customerProducts.add(key)
  }

  if (accountResult.data?.id) {
    const { data: links, error: linksError } = await supabase
      .from("suite_tenant_links")
      .select("product_key")
      .eq("customer_account_id", accountResult.data.id)
    if (linksError) throw new Error(`getSuiteCommercialContext links: ${linksError.message}`)
    for (const link of links ?? []) {
      const key = link.product_key as SuiteProduct
      if (SATELLITE_PRODUCTS.has(key)) customerProducts.add(key)
    }
  }

  return { settings, customerProducts }
}

export function getCrossSellOffer(
  context: SuiteCommercialContext,
  targetProduct: SuiteProduct,
): CrossSellOffer {
  const sourceProducts = [...context.customerProducts].filter((product) => product !== targetProduct)
  const eligible =
    context.settings.crossSellEnabled &&
    context.settings.crossSellDiscountPercent > 0 &&
    sourceProducts.length > 0

  return {
    eligible,
    discountPercent: eligible ? context.settings.crossSellDiscountPercent : 0,
    allowPromotionStacking: context.settings.allowPromotionStacking,
    sourceProducts,
  }
}

export function applyPercentageDiscount(amountCents: number, discountPercent: number): number {
  if (!Number.isFinite(amountCents) || amountCents < 0) return amountCents
  const boundedPercent = Math.min(100, Math.max(0, discountPercent))
  return Math.round(amountCents * (1 - boundedPercent / 100))
}
