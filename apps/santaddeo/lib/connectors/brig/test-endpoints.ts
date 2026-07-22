/**
 * Catalogo endpoint testabili per BRiG.
 *
 * Fonte: lib/connectors/brig/client.ts (metodi reali). Base URL =
 * `endpoint_url`, header `x-api-key`, structureId = `property_id` o
 * `config.structure_id`.
 *
 * ATTENZIONE QUOTA: BRiG impone un limite di richieste GIORNALIERE (sandbox
 * 100, prod ~200). Ogni "Verifica" consuma una chiamata reale; "Verifica
 * tutti" ne consuma 3. La UI lo segnala. L'unico endpoint di scrittura
 * (updateRates) e' elencato ma NON eseguibile.
 */

import { BrigClient } from "./client"
import type { EndpointTest, TestIntegration } from "../test-endpoint-types"
import { runTimed } from "../test-endpoint-types"

function makeClient(pms: TestIntegration): BrigClient {
  const structureId = pms.property_id || (pms.config as { structure_id?: string } | null)?.structure_id || ""
  return new BrigClient({
    baseUrl: pms.endpoint_url || "",
    apiKey: pms.api_key || "",
    structureId,
  })
}

/** Conta gli elementi da una risposta BRiG (array o { data/items: [] }). */
function countItems(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length
  const obj = raw as { data?: unknown[]; items?: unknown[] } | null
  if (Array.isArray(obj?.data)) return obj.data.length
  if (Array.isArray(obj?.items)) return obj.items.length
  return 0
}

export const brigTestEndpoints: EndpointTest[] = [
  {
    key: "getReservations",
    method: "POST",
    path: "/api/ext/reservations/daily-occupancy-filters",
    description: "Prenotazioni (pagina 1, 5 elementi)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const res = await makeClient(pms).getReservations({ page: 1, pageSize: 5 })
        const items = countItems(res)
        const total = (res as { total?: number; totalCount?: number } | null)?.total ??
          (res as { totalCount?: number } | null)?.totalCount
        return {
          summary: total != null ? `${total} prenotazioni totali` : `${items} prenotazioni (pag. 1)`,
        }
      }),
  },
  {
    key: "getRoomTypes",
    method: "GET",
    path: "/api/nol/roomtypes/list",
    description: "Tipologie camera (?sid=structureId)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const raw = await makeClient(pms).getRoomTypes()
        return { summary: `${countItems(raw)} tipologie camera` }
      }),
  },
  {
    key: "getRatePlans",
    method: "GET",
    path: "/api/nol/rateplans/list",
    description: "Piani tariffari (?sid=structureId)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const raw = await makeClient(pms).getRatePlans()
        return { summary: `${countItems(raw)} piani tariffari` }
      }),
  },
  {
    key: "updateRates",
    method: "PUT",
    path: "/api/nol/rates/update/{sid}",
    description: "Push tariffe giornaliere sul PMS",
    readOnly: false,
  },
]
