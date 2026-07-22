/**
 * Registry centrale dei PMS Connector.
 *
 * REGOLA: l'unico file in tutto il codebase che mappa una PMSIntegration
 * a un'implementazione concreta deve essere questo. Niente switch sul
 * pms_name in dispatcher, route, UI o servizi: chiamano sempre
 * `getConnector(pms)` e lavorano sull'interfaccia.
 *
 * Aggiungere un nuovo provider = creare un adapter che implementi
 * `PMSConnector` + aggiungere una riga qui sotto + INSERT in pms_providers.
 */

import type { PMSConnector, PMSIntegration } from "./connector"
import { scidooConnector } from "./scidoo/adapter"
import { brigConnector } from "./brig/adapter"
import { gsheetsConnector } from "./gsheets/adapter"
import { slopeConnector } from "./slope/adapter"

const REGISTRY: Record<string, PMSConnector> = {
  [scidooConnector.code]: scidooConnector,
  [brigConnector.code]: brigConnector,
  [gsheetsConnector.code]: gsheetsConnector,
  [slopeConnector.code]: slopeConnector,
}

/**
 * Risolve il connector giusto per una PMSIntegration.
 *
 * Logica:
 *  - integration_mode === "gsheets" / "bedzzle_gdocs"  →  gsheets connector
 *    (alcuni PMS come Bedzzle non hanno API native: il "modo" Google Sheets
 *    e' il transport reale, indipendentemente dal pms_name).
 *  - altrimenti lookup per pms_name (case-insensitive, trim).
 *
 * Ritorna null se non c'e' un connector registrato. I caller decidono come
 * gestirlo (errore 4xx, fallback, ecc.) — questo file non deve avere business logic.
 */
export function getConnector(pms: PMSIntegration): PMSConnector | null {
  const mode = pms.integration_mode?.toLowerCase().trim()
  if (mode === "gsheets" || mode === "bedzzle_gdocs") {
    return REGISTRY[gsheetsConnector.code] ?? null
  }
  const code = pms.pms_name?.toLowerCase().trim()
  return code ? REGISTRY[code] ?? null : null
}

/** Versione che ritorna il connector o lancia un errore esplicito. */
export function requireConnector(pms: PMSIntegration): PMSConnector {
  const c = getConnector(pms)
  if (!c) {
    throw new Error(
      `Nessun connector registrato per pms_name="${pms.pms_name}" integration_mode="${pms.integration_mode}". ` +
        `Aggiungilo in lib/connectors/registry.ts.`,
    )
  }
  return c
}

/** Per UI/diagnostica: elenco di tutti i connector disponibili. */
export function listConnectors(): PMSConnector[] {
  return Object.values(REGISTRY)
}
