/**
 * Codice cliente usato nella suite 4 BID.
 *
 * Il numero e' unico per l'account di suite; il prefisso identifica il
 * prodotto. Al telefono il cliente digita il numero di sette cifre dopo aver
 * scelto il prodotto nel menu. Il codice identifica il tenant, ma NON e' una
 * password.
 */
import { getSuiteProduct, getSuiteProductByPrefix, type SuiteProductKey } from "@/lib/customer-codes/product"

export const CUSTOMER_CODE_DIGITS = 7

export function normalizeCustomerCode(
  value: string | number | null | undefined,
  expectedProductKey?: SuiteProductKey,
): string | null {
  if (value === null || value === undefined) return null

  const raw = String(value).trim().toUpperCase().replace(/\s+/g, "")
  const withPrefix = raw.match(/^([A-Z]{2,3})-?(\d{7})$/)
  const digitsOnly = raw.match(/^(\d{7})$/)

  if (withPrefix) {
    const product = getSuiteProductByPrefix(withPrefix[1])
    if (!product || (expectedProductKey && product.key !== expectedProductKey)) return null
    return `${product.prefix}-${withPrefix[2]}`
  }

  if (!digitsOnly || !expectedProductKey) return null
  const product = getSuiteProduct(expectedProductKey)
  return product ? `${product.prefix}-${digitsOnly[1]}` : null
}

export function customerCodeDigits(value: string | number | null | undefined, productKey?: SuiteProductKey): string | null {
  const normalized = normalizeCustomerCode(value, productKey)
  return normalized?.match(/(\d{7})$/)?.[1] ?? null
}
