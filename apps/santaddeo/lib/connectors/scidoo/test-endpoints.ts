/**
 * Catalogo endpoint testabili per Scidoo.
 *
 * Fonte: lib/connectors/scidoo/client.ts (metodi reali). Base URL =
 * `endpoint_url` o https://www.scidoo.com/api/v1, header `Api-Key`.
 * Tutti gli endpoint di lettura usano una finestra piccola (oggi .. +7gg)
 * per non pesare sul rate limit. L'unico endpoint di scrittura
 * (setDayPrices) e' elencato ma NON eseguibile.
 */

import { ScidooClient } from "./client"
import type { EndpointTest, TestIntegration } from "../test-endpoint-types"
import { runTimed, windowDates, pastWindowDates } from "../test-endpoint-types"

/**
 * Scidoo lancia HTTP 400 `{"message":"no documents found"}` quando il range
 * fiscale e' GENUINAMENTE vuoto (nessuna vendita nel periodo), invece di
 * tornare 200 + lista vuota. Non e' un guasto del connettore: lo stesso
 * riconoscimento e' gia' in scidoo-sync-service.ts (isEmptyError). Qui lo
 * usiamo per NON mostrare un falso errore rosso nel tester.
 */
function isNoDocumentsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /no documents found|nessun documento/i.test(msg)
}

function makeClient(pms: TestIntegration): ScidooClient {
  return new ScidooClient({
    endpoint_url: pms.endpoint_url ?? undefined,
    api_key: pms.api_key ?? undefined,
    property_id: pms.property_id ?? undefined,
  })
}

export const scidooTestEndpoints: EndpointTest[] = [
  {
    key: "getRoomTypes",
    method: "POST",
    path: "/rooms/getRoomTypes.php",
    description: "Tipologie camera",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const rooms = await makeClient(pms).getRoomTypes()
        return { summary: `${rooms.length} tipologie camera` }
      }),
  },
  {
    key: "getAvailability",
    method: "POST",
    path: "/rooms/getAvailability.php",
    description: "Disponibilita' camere (oggi .. +7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const { from, to } = windowDates()
        const rows = await makeClient(pms).getAvailability(from, to)
        return { summary: `${rows.length} record disponibilita'` }
      }),
  },
  {
    key: "getMinStay",
    method: "POST",
    path: "/rooms/getMinstay.php",
    description: "Min stay (oggi .. +7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const { from, to } = windowDates()
        const rows = await makeClient(pms).getMinStay(from, to)
        return { summary: `${rows.length} record min stay` }
      }),
  },
  {
    key: "getRates",
    method: "POST",
    path: "/prices/getRates.php",
    description: "Tariffe / listini (oggi .. +7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const { from, to } = windowDates()
        const rows = await makeClient(pms).getRates(from, to)
        return { summary: `${rows.length} tariffe` }
      }),
  },
  {
    key: "getDayPrices",
    method: "POST",
    path: "/prices/getDayPrices.php",
    description: "Prezzi giornalieri (read-back post-push, oggi .. +7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const { from, to } = windowDates()
        const rows = await makeClient(pms).getPrices(from, to)
        return { summary: `${rows.length} prezzi giornalieri` }
      }),
  },
  {
    key: "getBookings",
    method: "POST",
    path: "/bookings/get.php",
    description: "Prenotazioni (soggiorno oggi .. +7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const { from, to } = windowDates()
        const res = await makeClient(pms).getBookings({ stay_from: from, stay_to: to })
        return { summary: `${res.count} prenotazioni` }
      }),
  },
  {
    key: "getFiscalProduction",
    method: "POST",
    path: "/invoice/getFiscalProduction.php",
    description: "Produzione fiscale (richiede partita IVA, ultimi 7gg)",
    readOnly: true,
    run: (pms) =>
      runTimed(async () => {
        const vat = pms.vat_number?.trim()
        if (!vat) {
          throw new Error("Partita IVA (vat_number) non configurata per questo hotel")
        }
        // Finestra PASSATA: i documenti fiscali sono già emessi, nel futuro
        // non esistono (oggi..+7gg tornava sempre "no documents found").
        const { from, to } = pastWindowDates()
        try {
          const data = await makeClient(pms).getFiscalProduction(from, to, vat)
          const docs = data.tax_documents?.length ?? 0
          return { summary: `${docs} documenti fiscali (ultimi 7gg)` }
        } catch (err) {
          // Range vuoto (nessuna vendita) = OK, non errore: l'endpoint risponde
          // ed è raggiungibile, semplicemente non ci sono documenti.
          if (isNoDocumentsError(err)) {
            return { summary: "0 documenti fiscali (nessuna vendita negli ultimi 7gg)" }
          }
          throw err
        }
      }),
  },
  {
    key: "setDayPrices",
    method: "POST",
    path: "/prices/setDayPrices.php",
    description: "Push prezzi giornalieri sul PMS",
    readOnly: false,
  },
]
