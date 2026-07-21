/**
 * Catalogo endpoint testabili per Slope (Partner API v1).
 *
 * Fonte: lib/connectors/slope/client.ts (metodi reali). Base URL =
 * `endpoint_url` o https://api.slope.it, header `Authorization: bearer`
 * (token PER STRUTTURA, niente property_id separato).
 *
 * `deleted-resources` e' un POST ma semanticamente READ-ONLY: dato un set di
 * id ritorna quelli eliminati, senza mutare nulla. Lo testiamo con un UUIDv4
 * casuale (NON il nil UUID, che Slope rifiuta con 400; attesa: 0 eliminati).
 * L'endpoint di scrittura vero (rates-and-availability-updates) e' elencato
 * ma NON eseguibile.
 */

import { SlopeClient, SLOPE_PROD_BASE_URL } from "./client"
import { slopeName } from "./types"
import type { EndpointTest, TestIntegration } from "../test-endpoint-types"
import { runTimed } from "../test-endpoint-types"

function makeClient(pms: TestIntegration): SlopeClient {
  return new SlopeClient({
    apiKey: pms.api_key || "",
    baseUrl: pms.endpoint_url || SLOPE_PROD_BASE_URL,
  })
}

export const slopeTestEndpoints: EndpointTest[] = [
  {
    key: "getEstablishment",
    method: "GET",
    path: "/v1/establishment",
    description: "Identita' struttura (ping)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const est = await makeClient(pms).getEstablishment()
        return { summary: `Struttura "${est.name ?? est.id}"` }
      }),
  },
  {
    key: "getLodgingTypes",
    method: "GET",
    path: "/v1/lodging-types",
    description: "Tipologie alloggio",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const types = await makeClient(pms).getLodgingTypes()
        const sample = types[0] ? ` (es. "${slopeName(types[0].name)}")` : ""
        return { summary: `${types.length} tipologie alloggio${sample}` }
      }),
  },
  {
    key: "getRatePlans",
    method: "GET",
    path: "/v1/rate-plans",
    description: "Piani tariffari",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const plans = await makeClient(pms).getRatePlans()
        return { summary: `${plans.length} piani tariffari` }
      }),
  },
  {
    key: "getReservations",
    method: "GET",
    path: "/v1/lodging-reservations",
    description: "Prenotazioni (pagina 1)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const page = await makeClient(pms).getReservationsPage({ page: 1 })
        const more = page.pagination?.hasNextPage ? " (altre pagine disponibili)" : ""
        return { summary: `${page.data.length} prenotazioni in pagina 1${more}` }
      }),
  },
  {
    key: "getDeletedResources",
    method: "POST",
    path: "/v1/deleted-resources",
    description: "Riconciliazione eliminati (read-only, id fittizio)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        // NB: usiamo un UUIDv4 CASUALE, non il nil UUID
        // (00000000-...): Slope valida gli id con un check stretto che rifiuta
        // il nil UUID ("This value is not a valid UUID", HTTP 400) perche' il
        // nibble di versione e' 0. Un v4 casuale passa la validazione e, non
        // esistendo, torna 0 eliminati (comportamento atteso del test).
        const deleted = await makeClient(pms).getDeletedResources(
          [crypto.randomUUID()],
          "LODGING_RESERVATIONS",
        )
        return { summary: `${deleted.length} eliminati sul set di test` }
      }),
  },
  {
    key: "postRatesAndAvailabilityUpdates",
    method: "POST",
    path: "/v1/lodging-types/{id}/rates-and-availability-updates",
    description: "Push tariffe / disponibilita' sul PMS",
    readOnly: false,
  },
]
