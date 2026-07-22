/**
 * Adapter Slope (Partner API v1, connettore NATIVO).
 *
 * Sostituisce il vecchio raggiungimento di Slope via bridge BRiG
 * (pms_name='brig' + config.brig_sub_pms='slope', mai attivato per mancanza
 * di credenziali BRiG). Da 13/07/2026 Slope ha API dirette: token bearer
 * PER STRUTTURA, staging https://api.staging.slope.it, prod https://api.slope.it.
 *
 * Capabilities:
 *  - pull_reservations  (GET /v1/lodging-reservations, delta su lastUpdateDate)
 *  - pull_room_types    (GET /v1/lodging-types)
 *  - pull_rate_plans    (GET /v1/rate-plans)
 *  - push_rates         (POST /v1/lodging-types/{id}/rates-and-availability-updates)
 *
 * NON dichiariamo pull_occupancy/pull_production: come BRiG, Slope non espone
 * un endpoint di disponibilita' aggregata; l'occupancy deriva dalle prenotazioni.
 */

import type {
  PMSConnector,
  PMSIntegration,
  PingResult,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { SlopeClient, SlopeError } from "./client"

export const slopeConnector: PMSConnector = {
  code: "slope",
  displayName: "Slope",
  capabilities: new Set([
    "pull_reservations",
    "pull_room_types",
    "pull_rate_plans",
    "push_rates",
  ]),

  async ping(pms: PMSIntegration): Promise<PingResult> {
    if (!pms.api_key) {
      return { ok: false, message: "API key Slope mancante" }
    }
    try {
      const client = new SlopeClient({
        apiKey: pms.api_key,
        baseUrl: pms.endpoint_url || "",
      })
      const est = await client.getEstablishment()
      return {
        ok: true,
        message: `Connesso a "${est.name ?? est.id}"`,
      }
    } catch (e) {
      if (e instanceof SlopeError && e.status === 401) {
        return { ok: false, message: "API key Slope non valida o revocata (401)" }
      }
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  },

  async pushRates(
    pms: PMSIntegration,
    changes: PriceChange[],
    roomTypeMappings: RoomTypeMapping[],
    rateMappings: RateMapping[],
  ): Promise<PushResult> {
    // Implementazione concreta in push-impl.ts (pattern Scidoo/BRiG).
    // Lazy import per evitare cicli di modulo.
    const { pushViaSlope } = await import("./push-impl")
    return pushViaSlope(pms, changes, roomTypeMappings, rateMappings)
  },
}
