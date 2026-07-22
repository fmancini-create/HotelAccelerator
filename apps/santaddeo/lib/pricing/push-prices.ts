/**
 * Dispatcher push prezzi verso PMS.
 *
 * REFACTOR 20/05/2026: tutta la logica concreta vive ora in
 * lib/connectors/<provider>/push-impl.ts e nei rispettivi adapter dietro
 * l'interfaccia PMSConnector. Questo file e' un wrapper sottile sopra il
 * registry che:
 *   1. mantiene la firma originale `pushPricesToPMS(pms, changes, ...)`
 *      cosi' i 5 caller esistenti (autopilot/push, push-range, sync,
 *      trigger, superadmin/push-prices-range) NON cambiano;
 *   2. usa getConnector() per scegliere l'implementazione, niente piu'
 *      switch hardcoded `pms_name === "scidoo"`.
 *
 * Aggiungere un nuovo PMS = creare adapter + entry in registry.ts. Questo
 * file resta intoccato.
 *
 * Storia precedente: il file era una funzione monolitica con 3 rami
 * hardcoded (Scidoo / GSheets / fallback errore) e 500 righe di logica
 * inlined per Scidoo, scoperto come anti-pattern il 20/05/2026 (push BRiG
 * impossibile senza toccare 6 file diversi).
 */

import { getConnector } from "@/lib/connectors/registry"
import type { PMSConnector, PushResult, RateMapping, RoomTypeMapping, PMSIntegration } from "@/lib/connectors/connector"
import type { PriceChange } from "./calculate-suggested-price"
import { tryAcquirePushLock, releasePushLock, makePushLockHolder } from "./push-lock"

// Re-export i tipi cosi' i caller esistenti continuano a importare da
// "@/lib/pricing/push-prices" senza dover essere riscritti.
export type { PushResult, RoomTypeMapping, RateMapping, PMSIntegration }

/**
 * Restituisce true se il PMS dell'hotel ha un push-tariffe implementato.
 * Usalo dalla UI per nascondere/disabilitare il pulsante "Pubblica tariffe"
 * invece di mostrare errori al click.
 */
export function pushSupports(pms: PMSIntegration): boolean {
  const connector = getConnector(pms)
  return !!connector?.capabilities.has("push_rates") && typeof connector.pushRates === "function"
}

/** Connector risolto + meta per UI/diagnostica. Non sostituisce `getConnector` direttamente: serve solo a chi vuole un'unica chiamata. */
export function describePush(pms: PMSIntegration): { connector: PMSConnector | null; supported: boolean } {
  const connector = getConnector(pms)
  return {
    connector,
    supported: !!connector?.capabilities.has("push_rates") && typeof connector?.pushRates === "function",
  }
}

export async function pushPricesToPMS(
  pms: PMSIntegration,
  changes: PriceChange[],
  roomTypeMappings: RoomTypeMapping[],
  rateMappings: RateMapping[] = [],
  /**
   * FIX 04/07/2026 (incident storm 429/504): quando passato, serializza il
   * push per hotel con un lock in Postgres. Se un altro push per lo stesso
   * hotel e' gia' in corso, ritorna { deferred:true } SENZA toccare il PMS e
   * senza fallire: il backlog resta per il giro successivo. `source` serve
   * solo a etichettare l'holder nei log. Omettere hotelId = nessun lock
   * (retrocompat per eventuali caller non ancora migrati).
   */
  opts?: { hotelId?: string; source?: string },
): Promise<PushResult> {
  console.log(`[v0] [pushPricesToPMS] Starting push for ${changes.length} changes`)
  console.log(
    `[v0] [pushPricesToPMS] PMS config: pms_name=${pms.pms_name}, integration_mode=${pms.integration_mode}, has_api_key=${!!pms.api_key}`,
  )

  if (changes.length === 0) {
    return { success: true, method: "none", cellsOrRecords: 0, errors: [] }
  }

  const connector = getConnector(pms)
  if (!connector) {
    return {
      success: false,
      method: "none",
      cellsOrRecords: 0,
      errors: [
        `Nessun connector registrato per pms_name="${pms.pms_name}" integration_mode="${pms.integration_mode}". ` +
          `Aggiungilo in lib/connectors/registry.ts.`,
      ],
    }
  }

  if (!connector.capabilities.has("push_rates") || !connector.pushRates) {
    return {
      success: false,
      method: "none",
      cellsOrRecords: 0,
      errors: [
        `Il PMS "${connector.displayName}" non supporta il push tariffe. ` +
          `Capabilities disponibili: ${Array.from(connector.capabilities).join(", ") || "nessuna"}.`,
      ],
    }
  }

  console.log(`[v0] [pushPricesToPMS] Using connector "${connector.code}" (${connector.displayName})`)

  // Senza hotelId non possiamo prendere il lock: comportamento storico.
  const hotelId = opts?.hotelId
  if (!hotelId) {
    return connector.pushRates(pms, changes, roomTypeMappings, rateMappings)
  }

  // Lock di concorrenza per-hotel: un solo push alla volta tocca il PMS.
  // Vedi lib/pricing/push-lock.ts (incident 04/07/2026).
  const holder = makePushLockHolder(opts?.source || "push")
  const gotLock = await tryAcquirePushLock(hotelId, holder)
  if (!gotLock) {
    console.warn(
      `[v0] [pushPricesToPMS] Lock occupato per hotel ${hotelId}: push RIMANDATO ` +
        `(${changes.length} variazioni restano per il prossimo giro).`,
    )
    return {
      success: false,
      deferred: true,
      method: connector.code,
      cellsOrRecords: 0,
      errors: ["Un altro push verso il PMS è già in corso per questo hotel: rimandato al prossimo ciclo."],
    }
  }

  try {
    return await connector.pushRates(pms, changes, roomTypeMappings, rateMappings)
  } finally {
    await releasePushLock(hotelId, holder)
  }
}
