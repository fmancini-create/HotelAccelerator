/**
 * Catalogo dei prodotti che possono emettere un codice cliente 4 BID.
 *
 * Il numero e' assegnato una sola volta all'account di suite; il prefisso
 * identifica il prodotto dal quale il cliente sta chiedendo assistenza.
 */
export const SUITE_PRODUCTS = [
  { key: "hotelaccelerator", prefix: "HA", label: "Hotel Accelerator" },
  { key: "santaddeo", prefix: "SNT", label: "Santaddeo RMS" },
  { key: "hotelprofitai", prefix: "HPA", label: "HotelProfitAI" },
  { key: "manubot", prefix: "MB", label: "ManuBot" },
] as const

export type SuiteProduct = (typeof SUITE_PRODUCTS)[number]
export type SuiteProductKey = SuiteProduct["key"]

export function getSuiteProduct(value: string | null | undefined): SuiteProduct | null {
  const normalized = value?.trim().toLowerCase()
  return SUITE_PRODUCTS.find((product) => product.key === normalized) ?? null
}

export function getSuiteProductByPrefix(value: string | null | undefined): SuiteProduct | null {
  const normalized = value?.trim().toUpperCase()
  return SUITE_PRODUCTS.find((product) => product.prefix === normalized) ?? null
}

/** Chiave dei route point 3CX -> chiave stabile del registro di suite. */
export const VOICE_PRODUCT_TO_SUITE_PRODUCT: Record<string, SuiteProductKey> = {
  "hotel-accelerator": "hotelaccelerator",
  "santaddeo-rms": "santaddeo",
  "hotel-profit-ai": "hotelprofitai",
  manubot: "manubot",
}
