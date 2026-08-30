import { describe, expect, it } from "vitest"
import {
  applyPercentageDiscount,
  getCrossSellOffer,
  type SuiteCommercialContext,
  type SuiteProduct,
} from "@/lib/suite-commercial"

function context(products: SuiteProduct[], enabled = true, discount = 10): SuiteCommercialContext {
  return {
    settings: {
      crossSellEnabled: enabled,
      crossSellDiscountPercent: discount,
      allowPromotionStacking: false,
    },
    customerProducts: new Set(products),
  }
}

describe("suite cross-sell", () => {
  it("applica il 10% al nuovo prodotto di un cliente HotelAccelerator", () => {
    const offer = getCrossSellOffer(context(["hotelaccelerator"]), "santaddeo")
    expect(offer.eligible).toBe(true)
    expect(offer.discountPercent).toBe(10)
    expect(offer.sourceProducts).toEqual(["hotelaccelerator"])
  })

  it("riconosce un cliente satellite che acquista HotelAccelerator", () => {
    const offer = getCrossSellOffer(context(["manubot"]), "hotelaccelerator")
    expect(offer.eligible).toBe(true)
    expect(offer.discountPercent).toBe(10)
  })

  it("non sconta un prodotto gia posseduto", () => {
    const offer = getCrossSellOffer(context(["hotelaccelerator", "santaddeo"]), "santaddeo")
    expect(offer.eligible).toBe(false)
    expect(offer.discountPercent).toBe(0)
  })

  it("non considera il solo prodotto target come cross-sell", () => {
    expect(getCrossSellOffer(context(["manubot"]), "manubot").eligible).toBe(false)
  })

  it("rispetta la disattivazione superadmin", () => {
    expect(getCrossSellOffer(context(["hotelaccelerator"], false), "hotelprofitai").eligible).toBe(false)
  })

  it("calcola lo sconto in centesimi senza floating point sul risultato", () => {
    expect(applyPercentageDiscount(10_000, 10)).toBe(9_000)
    expect(applyPercentageDiscount(9_900, 10)).toBe(8_910)
  })
})
