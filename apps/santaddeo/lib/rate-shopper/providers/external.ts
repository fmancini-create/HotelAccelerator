import type { RateShopperProvider, FetchRatesParams, NormalizedRate } from "@/lib/rate-shopper/provider"

/**
 * Scaffold per un provider di rate shopping ESTERNO (es. Lighthouse/OTA Insight,
 * RateGain, Pricepoint...). Volutamente provider-agnostico: quando si sceglie
 * il fornitore si implementa qui `fetchRates` mappando la loro risposta in
 * NormalizedRate, e si configurano le env dedicate.
 *
 * Finche' le env non ci sono, isConfigured() = false e il cron lo salta:
 * la UI continua a funzionare con l'adapter manuale.
 *
 * Env attese (placeholder, da definire col fornitore):
 *   RATE_SHOPPER_API_URL
 *   RATE_SHOPPER_API_KEY
 */
export class ExternalProvider implements RateShopperProvider {
  readonly key = "external"

  isConfigured(): boolean {
    return Boolean(process.env.RATE_SHOPPER_API_URL && process.env.RATE_SHOPPER_API_KEY)
  }

  async fetchRates(params: FetchRatesParams): Promise<NormalizedRate[]> {
    if (!this.isConfigured()) {
      console.warn("[rate-shopper:external] provider non configurato, skip")
      return []
    }

    // TODO: implementare la chiamata reale al provider scelto e mappare la
    // risposta in NormalizedRate[]. Struttura tipica:
    //
    // const res = await fetch(`${process.env.RATE_SHOPPER_API_URL}/rates`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${process.env.RATE_SHOPPER_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     property_refs: params.competitors.map((c) => c.externalRef).filter(Boolean),
    //     check_in_from: params.from,
    //     check_in_to: params.to,
    //     los: params.los ?? 1,
    //     occupancy: params.occupancy ?? 2,
    //   }),
    // })
    // const data = await res.json()
    // return data.rates.map((r) => ({ competitorRef: r.property_ref, stayDate: r.date, ... }))

    console.warn("[rate-shopper:external] fetchRates non ancora implementato")
    return []
  }
}
