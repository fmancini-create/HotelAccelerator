import { describe, expect, it } from "vitest"
import { getSuiteProduct, getSuiteProductByPrefix } from "@/lib/customer-codes/product"
import { customerCodeDigits, normalizeCustomerCode } from "@/lib/telephony/customer-code"

describe("codice cliente 4 BID", () => {
  it("normalizza il codice mostrato e le sole cifre digitate dopo la scelta del prodotto", () => {
    expect(normalizeCustomerCode("snt - 3493840")).toBe("SNT-3493840")
    expect(normalizeCustomerCode("3493840", "hotelaccelerator")).toBe("HA-3493840")
    expect(customerCodeDigits("HA-3493840", "hotelaccelerator")).toBe("3493840")
  })

  it("accetta le sette cifre scandite a voce in italiano o inglese", () => {
    expect(normalizeCustomerCode("tre quattro nove tre otto quattro zero", "hotelaccelerator")).toBe("HA-3493840")
    expect(normalizeCustomerCode("three four nine three eight four zero", "hotelprofitai")).toBe("HPA-3493840")
    expect(normalizeCustomerCode("licenza 3 4 9 3 8 4 0", "manubot")).toBe("MB-3493840")
  })

  it("rifiuta formati incompleti, prefissi sconosciuti e prefissi non coerenti con il menu", () => {
    expect(normalizeCustomerCode("HA-123456")).toBeNull()
    expect(normalizeCustomerCode("XX-1234567")).toBeNull()
    expect(normalizeCustomerCode("SNT-3493840", "hotelaccelerator")).toBeNull()
    expect(normalizeCustomerCode("tre quattro nove", "hotelaccelerator")).toBeNull()
  })

  it("mantiene stabili i quattro prefissi di prodotto", () => {
    expect(getSuiteProduct("hotelaccelerator")?.prefix).toBe("HA")
    expect(getSuiteProduct("santaddeo")?.prefix).toBe("SNT")
    expect(getSuiteProduct("hotelprofitai")?.prefix).toBe("HPA")
    expect(getSuiteProduct("manubot")?.prefix).toBe("MB")
    expect(getSuiteProductByPrefix("MB")?.key).toBe("manubot")
  })
})
