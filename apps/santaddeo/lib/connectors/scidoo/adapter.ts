/**
 * Adapter Scidoo per l'interfaccia agnostica PMSConnector.
 *
 * Strategia: questo file e' un wrapper sottile sopra `pushViaScidoo` che
 * vive in lib/pricing/push-prices.ts. Non duplichiamo la logica del push:
 * la riusiamo cosi' com'e' (e' codice testato, contiene fix storici di
 * Massabò 29-30/04/2026 su occ-out-of-range, batching, post-push verify).
 *
 * Quando in futuro estrarremo TUTTA la logica push fuori dal dispatcher
 * monolitico, sposteremo direttamente il codice qui dentro. Per ora
 * deleghiamo per evitare di rompere comportamenti.
 */

import type {
  PMSConnector,
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { pushViaScidoo } from "./push-impl"

export const scidooConnector: PMSConnector = {
  code: "scidoo",
  displayName: "Scidoo",
  capabilities: new Set([
    "pull_reservations",
    "pull_room_types",
    "pull_rate_plans",
    "pull_occupancy",
    "pull_production",
    "pull_minstay",
    "push_rates",
  ]),

  async pushRates(
    pms: PMSIntegration,
    changes: PriceChange[],
    roomTypeMappings: RoomTypeMapping[],
    rateMappings: RateMapping[],
  ): Promise<PushResult> {
    return pushViaScidoo(pms, changes, roomTypeMappings, rateMappings)
  },
}
