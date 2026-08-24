import "server-only"

import { timingSafeEqual } from "node:crypto"
import { type SuiteProductKey } from "@/lib/customer-codes/product"

const REGISTRY_KEY_BY_PRODUCT: Record<SuiteProductKey, string | undefined> = {
  hotelaccelerator: process.env.CUSTOMER_CODE_REGISTRY_KEY_HA,
  santaddeo: process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT,
  hotelprofitai: process.env.CUSTOMER_CODE_REGISTRY_KEY_HPA,
  manubot: process.env.CUSTOMER_CODE_REGISTRY_KEY_MB,
}

function sameSecret(expected: string, received: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function authenticateRegistryClient(productKey: SuiteProductKey, receivedKey: string | null): {
  ok: boolean
  configured: boolean
} {
  const expected = REGISTRY_KEY_BY_PRODUCT[productKey]
  if (!expected) return { ok: false, configured: false }
  if (!receivedKey) return { ok: false, configured: true }
  return { ok: sameSecret(expected, receivedKey), configured: true }
}
