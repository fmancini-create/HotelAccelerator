import "server-only"

export const SUITE_PRODUCTS = ["santaddeo", "hotelprofitai", "manubot"] as const
export type SuiteSsoProduct = (typeof SUITE_PRODUCTS)[number]

export const SUITE_SSO_CONFIG: Record<SuiteSsoProduct, { moduleKey: string; baseUrl: string }> = {
  santaddeo: {
    moduleKey: "santaddeo",
    baseUrl: process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com",
  },
  hotelprofitai: {
    moduleKey: "hotelprofitai",
    baseUrl: process.env.HOTELPROFITAI_APP_URL?.trim() || "https://www.hotelprofitai.com",
  },
  manubot: {
    moduleKey: "manubot",
    baseUrl: process.env.MANUBOT_APP_URL?.trim() || "https://www.manubot.it",
  },
}

export function parseSuiteSsoProduct(value: unknown): SuiteSsoProduct | null {
  return typeof value === "string" && (SUITE_PRODUCTS as readonly string[]).includes(value)
    ? (value as SuiteSsoProduct)
    : null
}
