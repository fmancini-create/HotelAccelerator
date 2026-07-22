/**
 * Adapter GSheets (per PMS senza API native: Bedzzle e simili).
 *
 * Wrappa pushViaGSheets in lib/connectors/gsheets/push-impl.ts. Il "pms_name"
 * varia a seconda dell'hotel ("bedzzle", "octorate_legacy", ecc.) ma il
 * transport e' sempre Google Sheets, quindi nel registry lo cerchiamo via
 * integration_mode === "gsheets" | "bedzzle_gdocs" e non per pms_name.
 */

import type {
  PMSConnector,
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import { pushViaGSheets } from "./push-impl"

export const gsheetsConnector: PMSConnector = {
  // Codice sintetico del transport: il registry lo risolve via integration_mode
  // (vedi getConnector in registry.ts).
  code: "gsheets",
  displayName: "Google Sheets (Bedzzle / generico)",
  capabilities: new Set(["push_rates"]),

  async pushRates(
    pms: PMSIntegration,
    changes: PriceChange[],
    roomTypeMappings: RoomTypeMapping[],
    _rateMappings: RateMapping[],
  ): Promise<PushResult> {
    return pushViaGSheets(pms, changes, roomTypeMappings)
  },
}
