import { describe, expect, it } from "vitest"
import { DEFAULT_COOKIE_POLICY, DEFAULT_PRIVACY_POLICY, legalDetails, mapPropertyToSiteSettings } from "./tenant-site-settings"

describe("tenant site legal settings", () => {
  it("maps existing billing fields into the public legal footer", () => {
    const settings = mapPropertyToSiteSettings({
      billing_company_name: "Hotel Example S.r.l.",
      billing_vat: "01234567890",
      billing_address: "Via Roma 1",
      billing_city: "Firenze",
      billing_postal_code: "50100",
      billing_province: "FI",
      legal_rea: "FI-123456",
    }, false)

    expect(legalDetails(settings)).toContain("P. IVA 01234567890")
    expect(legalDetails(settings)).toContain("REA FI-123456")
    expect(settings.whiteLabel).toBe(false)
  })

  it("uses safe defaults when a tenant has not customised the policies", () => {
    const settings = mapPropertyToSiteSettings({}, true)
    expect(settings.privacyPolicy).toBe(DEFAULT_PRIVACY_POLICY)
    expect(settings.cookiePolicy).toBe(DEFAULT_COOKIE_POLICY)
    expect(settings.whiteLabel).toBe(true)
  })
})
