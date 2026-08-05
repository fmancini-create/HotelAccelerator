import { describe, expect, it } from "vitest"
import {
  normalizeCustomDomain,
  normalizeSubdomain,
  tenantSubdomainHost,
  validateCustomDomain,
  validateSubdomain,
} from "@/lib/domains/domain-names"

describe("domain names", () => {
  it("normalizza sottodomini e domini senza accettare URL completi", () => {
    expect(normalizeSubdomain(" Villa-I-Barronci ")).toBe("villa-i-barronci")
    expect(normalizeCustomDomain("https://WWW.Example.COM/path?q=1")).toBe("www.example.com")
  })

  it("blocca nomi riservati e sintassi non valida", () => {
    expect(validateSubdomain("admin")).toMatch(/riservato/i)
    expect(validateSubdomain("-hotel")).toMatch(/caratteri/i)
    expect(validateSubdomain("hotel-1")).toBeNull()
  })

  it("separa i domini personalizzati dai sottodomini della piattaforma", () => {
    expect(validateCustomDomain("hotel.example.com")).toBeNull()
    expect(validateCustomDomain("tenant.hotelaccelerator.com")).toMatch(/campo dedicato/i)
    expect(tenantSubdomainHost("villaibarronci")).toBe("villaibarronci.hotelaccelerator.com")
  })
})
