/**
 * Codice cliente usato nella suite 4 BID.
 *
 * Il numero e' unico per l'account di suite; il prefisso identifica il
 * prodotto. Al telefono il cliente puo' digitare le sette cifre sulla tastiera
 * oppure scandirle a voce. Il codice identifica il tenant, ma NON e' una
 * password.
 */
import { getSuiteProduct, getSuiteProductByPrefix, type SuiteProductKey } from "@/lib/customer-codes/product"

export const CUSTOMER_CODE_DIGITS = 7

const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  uno: "1",
  un: "1",
  one: "1",
  due: "2",
  two: "2",
  tre: "3",
  three: "3",
  quattro: "4",
  four: "4",
  cinque: "5",
  five: "5",
  sei: "6",
  six: "6",
  sette: "7",
  seven: "7",
  otto: "8",
  eight: "8",
  nove: "9",
  nine: "9",
}

function spokenCustomerDigits(value: string): string | null {
  const tokens = value
    .toLocaleLowerCase("it-IT")
    .replace(/[.,;:()/_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  const result: string[] = []
  for (const token of tokens) {
    // Il prefisso puo' essere pronunciato o trascritto insieme al numero; il
    // prodotto e' comunque gia' vincolato dalla route del centralino.
    if (["ha", "hpa", "snt", "mb", "licenza", "codice"].includes(token)) continue
    if (/^\d$/.test(token)) {
      result.push(token)
      continue
    }
    const digit = SPOKEN_DIGITS[token]
    if (!digit) return null
    result.push(digit)
  }

  return result.length === CUSTOMER_CODE_DIGITS ? result.join("") : null
}

export function normalizeCustomerCode(
  value: string | number | null | undefined,
  expectedProductKey?: SuiteProductKey,
): string | null {
  if (value === null || value === undefined) return null

  const original = String(value).trim()
  const raw = original.toUpperCase().replace(/\s+/g, "")
  const withPrefix = raw.match(/^([A-Z]{2,3})-?(\d{7})$/)
  const digitsOnly = raw.match(/^(\d{7})$/)

  if (withPrefix) {
    const product = getSuiteProductByPrefix(withPrefix[1])
    if (!product || (expectedProductKey && product.key !== expectedProductKey)) return null
    return `${product.prefix}-${withPrefix[2]}`
  }

  if (!expectedProductKey) return null
  const product = getSuiteProduct(expectedProductKey)
  if (!product) return null

  if (digitsOnly) return `${product.prefix}-${digitsOnly[1]}`

  const spokenDigits = spokenCustomerDigits(original)
  return spokenDigits ? `${product.prefix}-${spokenDigits}` : null
}

export function customerCodeDigits(value: string | number | null | undefined, productKey?: SuiteProductKey): string | null {
  const normalized = normalizeCustomerCode(value, productKey)
  return normalized?.match(/(\d{7})$/)?.[1] ?? null
}
