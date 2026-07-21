/**
 * Implementazione push tariffe verso BRiG.
 *
 * Flow:
 *   1. risolve credenziali (api_key + structureId/property_id) come per il sync
 *   2. mappa ogni PriceChange RMS in BrigRateUpdateItem (roomCode + ratePlanCode + date + amount)
 *      tramite roomTypeMappings.brig_room_code e rateMappings.brig_rate_code
 *   3. batcha a 200 items e chiama BrigClient.updateRates per ogni batch
 *   4. aggrega risultati (success se nessun batch ha throwato)
 *
 * NOTE:
 *   - Niente post-push verification: BRiG non espone un endpoint per leggere
 *     le tariffe gia' caricate (getRatePlans torna solo i piani, non i prezzi
 *     per data). Se in futuro l'API la espone, replicheremo il pattern Scidoo
 *     (sample 50, soglia 20%).
 *   - Niente guard occ-out-of-range come Scidoo: BRiG non accetta `occupancy`
 *     nel PUT, quindi se il PriceChange ha occupancy != null lo collassiamo
 *     scegliendo l'occupanza max (di solito quella che corrisponde alla
 *     tariffa "rack" della camera). Questa decisione e' annotata sotto.
 */

import { BrigClient, BrigError } from "./client"
import type { BrigRateUpdateItem } from "./types"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import type {
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"

export async function pushViaBrig(
  pms: PMSIntegration,
  changes: PriceChange[],
  roomTypeMappings: RoomTypeMapping[],
  rateMappings: RateMapping[],
): Promise<PushResult> {
  console.log(`[v0] [pushViaBrig] Starting BRiG push for ${changes.length} changes`)

  // BRiG: api_key e' nella colonna omonima, baseUrl nella endpoint_url,
  // structureId nella property_id (stesso pattern usato dal sync).
  if (!pms.api_key || !pms.endpoint_url || !pms.property_id) {
    console.error(`[v0] [pushViaBrig] FAIL: credenziali BRiG incomplete`)
    return {
      success: false,
      method: "brig_api",
      cellsOrRecords: 0,
      errors: [
        "Configurazione BRiG incompleta: api_key, endpoint_url o property_id (structureId) mancante",
      ],
    }
  }

  const client = new BrigClient({
    baseUrl: pms.endpoint_url,
    apiKey: pms.api_key,
    structureId: pms.property_id,
  })

  const errors: string[] = []
  const warnings: string[] = []
  const items: BrigRateUpdateItem[] = []

  // Aggreghiamo per (roomCode, ratePlanCode, date) per gestire il caso
  // occupancy: piu' PriceChange con stessa camera/data/rate ma occupanze
  // diverse. BRiG non supporta amountPerOccupancy nel PUT (a differenza di
  // Scidoo), quindi prendiamo l'amount con occupancy MAX (rack) e
  // segnaliamo come warning quanti prezzi per occupanze inferiori sono
  // stati ignorati. Se in futuro BRiG espone occupancy, basta cambiare
  // l'aggregazione qui.
  type Bucket = { item: BrigRateUpdateItem; bestOcc: number; ignoredCount: number }
  const byKey = new Map<string, Bucket>()

  for (const change of changes) {
    const rt = roomTypeMappings.find((r) => r.id === change.roomTypeId)
    if (!rt?.brig_room_code) {
      const errMsg = `Room type ${change.roomTypeName} (id=${change.roomTypeId}) non ha brig_room_code mappato`
      errors.push(errMsg)
      console.warn(`[v0] [pushViaBrig] ${errMsg}`)
      continue
    }
    const rate = rateMappings.find((r) => r.id === change.rateId)
    if (!rate?.brig_rate_code) {
      const errMsg = `Rate ${change.rateId} non ha brig_rate_code mappato`
      errors.push(errMsg)
      console.warn(`[v0] [pushViaBrig] ${errMsg}`)
      continue
    }

    const amount =
      typeof change.suggestedPrice === "string"
        ? parseFloat(change.suggestedPrice as unknown as string)
        : (change.suggestedPrice as number)
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Prezzo non valido per ${rt.code} ${change.date}: ${change.suggestedPrice}`)
      continue
    }

    const occ = typeof change.occupancy === "number" ? change.occupancy : 0
    const key = `${rt.brig_room_code}|${rate.brig_rate_code}|${change.date}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        item: {
          roomCode: rt.brig_room_code,
          ratePlanCode: rate.brig_rate_code,
          date: change.date,
          amount,
          currency: "EUR",
        },
        bestOcc: occ,
        ignoredCount: 0,
      })
    } else if (occ > existing.bestOcc) {
      existing.item.amount = amount
      existing.bestOcc = occ
      existing.ignoredCount++
    } else {
      existing.ignoredCount++
    }
  }

  let totalIgnoredOcc = 0
  for (const bucket of byKey.values()) {
    items.push(bucket.item)
    totalIgnoredOcc += bucket.ignoredCount
  }

  if (totalIgnoredOcc > 0) {
    warnings.push(
      `BRiG non supporta tariffe per occupancy: ${totalIgnoredOcc} prezzi per occupanze inferiori al massimo per (camera, rate, data) sono stati ignorati. ` +
        `Inviato solo l'amount dell'occupanza piu' alta (rack).`,
    )
  }

  console.log(
    `[v0] [pushViaBrig] Built ${items.length} unique rate items, ${errors.length} errors, ignoredOcc=${totalIgnoredOcc}`,
  )

  if (items.length === 0) {
    return {
      success: errors.length === 0,
      method: "brig_api",
      cellsOrRecords: 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // Batch a 200 items per chiamata. La doc non specifica un limite ma
  // tenere chunk piccoli aiuta in caso di gateway timeout (30s nel client).
  const batchSize = 200
  let acceptedTotal = 0
  let failedBatches = 0

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    console.log(`[v0] [pushViaBrig] Sending batch ${batchNum} with ${batch.length} items`)

    try {
      const result = await client.updateRates(batch)
      console.log(
        `[v0] [pushViaBrig] Batch ${batchNum} OK: processed=${result.processed} accepted=${result.accepted} rejected=${result.rejected}`,
      )
      acceptedTotal += result.accepted
      if (result.rejected > 0) {
        warnings.push(
          `Batch ${batchNum}: BRiG ha rifiutato ${result.rejected} item su ${result.processed}. Body: ${JSON.stringify(result.raw).slice(0, 200)}`,
        )
      }
    } catch (err) {
      failedBatches++
      const msg =
        err instanceof BrigError
          ? `Batch ${batchNum} FAILED ${err.status}: ${err.body.slice(0, 300)}`
          : `Batch ${batchNum} FAILED: ${err instanceof Error ? err.message : "errore sconosciuto"}`
      console.error(`[v0] [pushViaBrig] ${msg}`)
      errors.push(msg)
    }
  }

  return {
    success: errors.length === 0 && failedBatches === 0,
    method: "brig_api",
    cellsOrRecords: acceptedTotal,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
