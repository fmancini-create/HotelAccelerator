/**
 * Catalogo aggregato degli endpoint testabili per connettore.
 *
 * Come il registry (`registry.ts`) e' l'unico punto che mappa un connettore
 * alla sua implementazione, questo file e' l'unico punto che mappa un codice
 * connettore alla sua lista di endpoint di test. Route e UI lavorano SOLO su
 * questo catalogo: niente switch su pms_name sparsi nel codice.
 *
 * La chiave e' il `code` del connettore (stesso valore di registry / pms_name
 * normalizzato). GSheets non e' incluso: non ha endpoint REST classici.
 */

import type { EndpointTest, EndpointTestMetadata } from "./test-endpoint-types"
import { scidooTestEndpoints } from "./scidoo/test-endpoints"
import { brigTestEndpoints } from "./brig/test-endpoints"
import { slopeTestEndpoints } from "./slope/test-endpoints"

export interface ConnectorTestCatalogEntry {
  code: string
  label: string
  /** Nota operativa mostrata in UI (es. avviso quota BRiG). */
  note?: string
  endpoints: EndpointTest[]
}

export const TEST_CATALOG: Record<string, ConnectorTestCatalogEntry> = {
  scidoo: {
    code: "scidoo",
    label: "Scidoo",
    endpoints: scidooTestEndpoints,
  },
  brig: {
    code: "brig",
    label: "BRiG",
    note:
      "BRiG ha un limite di richieste GIORNALIERE (sandbox 100, prod ~200). " +
      "Ogni verifica consuma una chiamata reale; 'Verifica tutti' ne consuma 3.",
    endpoints: brigTestEndpoints,
  },
  slope: {
    code: "slope",
    label: "Slope",
    note: "Rate limit Slope: 30 richieste/minuto per partner.",
    endpoints: slopeTestEndpoints,
  },
}

/** Elenco dei codici connettore con catalogo di test disponibile. */
export function listTestableConnectors(): ConnectorTestCatalogEntry[] {
  return Object.values(TEST_CATALOG)
}

/** Ritorna la entry di catalogo per un codice connettore (case-insensitive). */
export function getTestCatalogEntry(code: string | null | undefined): ConnectorTestCatalogEntry | null {
  const key = code?.toLowerCase().trim()
  return key ? TEST_CATALOG[key] ?? null : null
}

/** Ritorna gli endpoint di test per un connettore, o null se non supportato. */
export function getTestEndpoints(code: string | null | undefined): EndpointTest[] | null {
  return getTestCatalogEntry(code)?.endpoints ?? null
}

/** Trova un singolo endpoint per connettore + chiave. */
export function findTestEndpoint(code: string, key: string): EndpointTest | null {
  return getTestEndpoints(code)?.find((e) => e.key === key) ?? null
}

/** Versione serializzabile del catalogo di un connettore (senza `run`). */
export function toCatalogMetadata(
  code: string | null | undefined,
): { code: string; label: string; note?: string; endpoints: EndpointTestMetadata[] } | null {
  const entry = getTestCatalogEntry(code)
  if (!entry) return null
  return {
    code: entry.code,
    label: entry.label,
    note: entry.note,
    endpoints: entry.endpoints.map((e) => ({
      key: e.key,
      method: e.method,
      path: e.path,
      description: e.description,
      readOnly: e.readOnly,
    })),
  }
}
