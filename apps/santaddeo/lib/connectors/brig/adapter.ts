/**
 * Adapter BRiG.
 *
 * Capabilities di lettura (gia' implementate in BrigClient + lib/connectors/brig/sync.ts):
 *  - pull_reservations  (POST /api/ext/reservations/daily-occupancy-filters)
 *  - pull_room_types    (GET /api/nol/roomtypes/list)
 *  - pull_rate_plans    (GET /api/nol/rateplans/list)
 *
 * Capability di scrittura:
 *  - push_rates  (PUT /api/nol/rates/update/{sid})  →  vedi pushRates piu' sotto.
 *
 * Volutamente NON dichiariamo pull_occupancy / pull_production / pull_minstay:
 * l'API BRiG semplicemente non li espone (vedi memoria sync panel 20/05/2026).
 * Il registry/UI useranno capabilities per nascondere i moduli non supportati
 * invece di provare e fallire.
 */

import type {
  PMSConnector,
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"

export const brigConnector: PMSConnector = {
  code: "brig",
  displayName: "BRiG",
  capabilities: new Set([
    "pull_reservations",
    "pull_room_types",
    "pull_rate_plans",
    "push_rates",
  ]),

  async pushRates(
    pms: PMSIntegration,
    changes: PriceChange[],
    roomTypeMappings: RoomTypeMapping[],
    rateMappings: RateMapping[],
  ): Promise<PushResult> {
    // Implementazione concreta in push-impl.ts (separata per parallelo a Scidoo).
    // Lazy import per evitare cicli (push-impl importa BrigClient che importa types).
    const { pushViaBrig } = await import("./push-impl")
    return pushViaBrig(pms, changes, roomTypeMappings, rateMappings)
  },
}
