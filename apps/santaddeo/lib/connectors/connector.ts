/**
 * PMS Connector — interfaccia agnostica.
 *
 * Bug 20/05/2026: il codebase aveva almeno 6 punti diversi con switch
 * hardcoded `pms_name === "scidoo"` (push-prices, test-etl, settings/pms,
 * connector-health, room-types/sync, rates/sync). Aggiungere un nuovo
 * provider richiedeva di toccare N file. Ora ogni provider implementa
 * questa interfaccia, si registra nel registry e tutto il resto del codice
 * fa solo `getConnector(pms).pushRates(...)` o `connector.capabilities.has("push_rates")`.
 *
 * Ogni metodo e' OPZIONALE: se il provider non supporta una capability,
 * non implementa il metodo e il chiamante ottiene un errore tipato
 * "PMS non supporta X" via assertCapability(). Mai ramificare con
 * `if (connector.code === ...)` nel codice consumer.
 */

import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"

export type ConnectorCapability =
  | "pull_reservations"
  | "pull_room_types"
  | "pull_rate_plans"
  | "pull_occupancy"
  | "pull_production"
  | "pull_minstay"
  | "push_rates"
  | "push_availability"
  | "push_restrictions"

/** Forma minima di pms_integrations passata ai connector. Tieni allineato a DB. */
export interface PMSIntegration {
  integration_mode: string
  pms_name: string
  api_key?: string | null
  endpoint_url?: string | null
  property_id?: string | null
  config?: Record<string, any> | null
  // gsheets
  gsheet_spreadsheet_id?: string | null
}

export interface RoomTypeMapping {
  id: string
  code: string
  name: string
  /** Provider-specific ids: scidoo_room_type_id, brig_room_code, ecc. Il connector estrae
   *  il campo che gli serve. Niente dipendenze cross-provider qui. */
  scidoo_room_type_id?: number | null
  brig_room_code?: string | null
  min_occupancy?: number | null
  max_occupancy?: number | null
  [key: string]: unknown
}

export interface RateMapping {
  id: string
  name: string
  scidoo_rate_id?: number | null
  /**
   * Codice BRiG del rate plan (tariffa), es. "39132" per "Camera e Colazione B&B".
   * In DB la colonna si chiama `brig_rate_code` (NON `brig_rate_plan_code`):
   * il nome del campo qui DEVE essere identico al nome della colonna del SELECT
   * delle 5 route che caricano il mapping (`autopilot/push`, `push-range`,
   * `sync`, `trigger`, `superadmin/push-prices-range`). Bug 27/05/2026:
   * push-impl Brig leggeva `brig_rate_plan_code` su un oggetto che aveva
   * `brig_rate_code` -> sempre undefined -> 48 push falliti.
   */
  brig_rate_code?: string | null
  [key: string]: unknown
}

export interface PingResult {
  ok: boolean
  message: string
  /** Diagnostica facoltativa (es. n. room types ricevuti, version API, ecc.). */
  meta?: Record<string, unknown>
}

export interface PushResult {
  success: boolean
  /** Identifica il canale usato (es. "scidoo_api", "brig_api", "gsheets").
   *  Stringa libera, e' il connector a sceglierla. */
  method: string
  cellsOrRecords: number
  errors: string[]
  /** Warning soft che NON fanno fallire il push (es. occ fuori range camera).
   *  Vedi commento storico in pricing/push-prices.ts (Massabò 30/04/2026). */
  warnings?: string[]
  /**
   * true quando il push NON e' stato eseguito perche' un altro push per lo
   * stesso hotel era gia' in corso (lock di concorrenza, incident 04/07/2026).
   * NON e' un fallimento: le righe vanno lasciate cosi' come sono (action_taken
   * invariato) e verranno riprovate al giro successivo. I caller NON devono
   * marcarle failed (non bruciare il budget di retry) ne' 'pms' (non erano
   * inviate). Vedi lib/pricing/push-lock.ts.
   */
  deferred?: boolean
}

export interface PMSConnector {
  /** Codice univoco usato come chiave in pms_providers.code e nel registry. */
  readonly code: string
  readonly displayName: string
  readonly capabilities: ReadonlySet<ConnectorCapability>

  /**
   * Ping di salute al PMS. Usato da /api/superadmin/test-etl.
   * Il connector decide cosa testare (di solito un GET cheap come getRoomTypes).
   */
  ping?(pms: PMSIntegration): Promise<PingResult>

  /**
   * Push tariffe verso il PMS. Solo se capabilities ha "push_rates".
   * I mappings sono passati dal chiamante (gia' caricati dal DB) cosi' il
   * connector non deve sapere dello schema applicativo.
   */
  pushRates?(
    pms: PMSIntegration,
    changes: PriceChange[],
    roomTypeMappings: RoomTypeMapping[],
    rateMappings: RateMapping[],
  ): Promise<PushResult>
}

/**
 * Throwa un errore tipato se il connector non supporta una capability.
 * Usalo nel codice consumer per evitare di chiamare metodi opzionali a vuoto.
 */
export class CapabilityNotSupportedError extends Error {
  constructor(public readonly connectorCode: string, public readonly capability: ConnectorCapability) {
    super(`Il connector "${connectorCode}" non supporta la capability "${capability}"`)
    this.name = "CapabilityNotSupportedError"
  }
}

export function assertCapability(connector: PMSConnector, capability: ConnectorCapability): void {
  if (!connector.capabilities.has(capability)) {
    throw new CapabilityNotSupportedError(connector.code, capability)
  }
}
