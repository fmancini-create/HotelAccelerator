/**
 * Implementazione concreta del push tariffe verso Scidoo.
 *
 * Estratto da lib/pricing/push-prices.ts il 20/05/2026 durante il refactor
 * agnostico (PMSConnector + registry). La logica e' identica all'originale
 * per non perdere i fix storici:
 *  - 29/04/2026 Massabò: skip occ fuori range camera con warning aggregato
 *  - 30/04/2026 Massabò: setDayPrices strict + batch error tracking +
 *    post-push verification con getPrices (max 50 sample, soglia 20%)
 *
 * Non chiamare direttamente: passa attraverso scidooConnector.pushRates.
 */

import { ScidooClient } from "./client"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import type {
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"

type ScidooPriceRecord = {
  room_type_id: number
  price_id: number
  occupancy?: number
  day_price: number
  from: string
  to: string
}

/**
 * Invia un batch a Scidoo isolando i record invalidi (FIX 17/07/2026).
 *
 * Contesto: i log di Barronci del 17/07 mostravano che su ~34 chiamate
 * setDayPrices solo 2 andavano a buon fine (sempre il primo batch di ogni run),
 * tutte le altre respinte con 400 "invalid data" — anche con record IDENTICI e
 * validi (stesso room/occ/prezzo passava in un batch e falliva in un altro).
 * Il rifiuto e' quindi a livello di BATCH: un singolo record "cattivo" tra i 25
 * faceva perdere anche gli altri 24.
 *
 * Strategia: su errore NON di rate-limit (tipicamente 400 "invalid data")
 * bisezioniamo il batch ricorsivamente finche' non isoliamo il/i record che
 * Scidoo rifiuta. I record isolati vengono loggati col payload COMPLETO e
 * restituiti in `invalid` (per il report), mentre tutti gli altri vengono
 * inviati correttamente.
 *
 * I 429 (rate limit) sono gia' ritentati dentro client.request(): qui NON
 * bisezioniamo (moltiplicherebbe solo le richieste), contiamo il batch come
 * fallito e restituiamo l'errore cosi' il chiamante lo segnala.
 */
async function sendBatchWithBisect(
  client: ScidooClient,
  batch: ScidooPriceRecord[],
  label: string,
  sleep: (ms: number) => Promise<void>,
  delayMs: number,
  budget: { remaining: number },
): Promise<{
  processed: number
  invalid: ScidooPriceRecord[]
  rateLimited: boolean
  budgetExhausted: boolean
  genericErrors: string[]
}> {
  // Guard budget (FIX 17/07/2026): evita che una bisezione patologica (es. un
  // intero gruppo room_type con mapping stale = tutti record invalidi) esploda
  // il numero di chiamate e sfori maxDuration. Oltre il budget, il batch e'
  // contato come fallito senza ulteriori chiamate.
  if (budget.remaining <= 0) {
    console.error(`[v0] [pushViaScidoo] ${label} SALTATO: budget chiamate Scidoo esaurito`)
    return { processed: 0, invalid: [], rateLimited: false, budgetExhausted: true, genericErrors: [] }
  }
  budget.remaining--

  try {
    const result = await client.setDayPrices(batch)
    return { processed: result.processed, invalid: [], rateLimited: false, budgetExhausted: false, genericErrors: [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isRateLimit = /\b429\b|Too Many Requests/i.test(msg)

    // Rate limit: non bisezionare, segnala e basta.
    if (isRateLimit) {
      console.error(`[v0] [pushViaScidoo] ${label} FAILED (rate limit, no bisect): ${msg}`)
      return { processed: 0, invalid: [], rateLimited: true, budgetExhausted: false, genericErrors: [] }
    }

    // Bisezioniamo SOLO sui rifiuti-dati di Scidoo (400 "invalid data", partial
    // failure, mancata conferma). Errori transitori/infrastrutturali (5xx,
    // rete, non-JSON) NON vanno bisezionati: rischieremmo di etichettare come
    // "invalid data" un record valido colpito da un errore temporaneo, e di
    // martellare Scidoo. Quelli diventano errori generici del batch.
    const isDataRejection = /\b400\b|invalid data|invalid_parameter|partial failure|did NOT confirm/i.test(msg)
    if (!isDataRejection) {
      console.error(`[v0] [pushViaScidoo] ${label} FAILED (errore non-dati, no bisect): ${msg}`)
      return { processed: 0, invalid: [], rateLimited: false, budgetExhausted: false, genericErrors: [`${label}: ${msg}`] }
    }

    // Singolo record: e' lui il colpevole. Logga il payload COMPLETO.
    if (batch.length <= 1) {
      console.error(
        `[v0] [pushViaScidoo] ${label} record RIFIUTATO da Scidoo (${msg}) | payload=${JSON.stringify(batch[0] ?? null)}`,
      )
      return { processed: 0, invalid: batch.slice(), rateLimited: false, budgetExhausted: false, genericErrors: [] }
    }

    // Bisezione: dividi a meta' e ritenta ciascuna meta'.
    const mid = Math.floor(batch.length / 2)
    const left = batch.slice(0, mid)
    const right = batch.slice(mid)
    console.warn(
      `[v0] [pushViaScidoo] ${label} (${batch.length} record) rifiutato: bisezione ${left.length}+${right.length} per isolare il record invalido (${msg})`,
    )
    await sleep(delayMs)
    const l = await sendBatchWithBisect(client, left, `${label}.L`, sleep, delayMs, budget)
    await sleep(delayMs)
    const r = await sendBatchWithBisect(client, right, `${label}.R`, sleep, delayMs, budget)
    return {
      processed: l.processed + r.processed,
      invalid: [...l.invalid, ...r.invalid],
      rateLimited: l.rateLimited || r.rateLimited,
      budgetExhausted: l.budgetExhausted || r.budgetExhausted,
      genericErrors: [...l.genericErrors, ...r.genericErrors],
    }
  }
}

export async function pushViaScidoo(
  pms: PMSIntegration,
  changes: PriceChange[],
  roomTypeMappings: RoomTypeMapping[],
  rateMappings: RateMapping[],
): Promise<PushResult> {
  console.log(`[v0] [pushViaScidoo] Starting Scidoo push for ${changes.length} changes`)
  console.log(
    `[v0] [pushViaScidoo] Credentials check: api_key=${!!pms.api_key}, endpoint_url=${pms.endpoint_url}, property_id=${pms.property_id}`,
  )
  console.log(
    `[v0] [pushViaScidoo] Room type mappings: ${roomTypeMappings.length} types, rate mappings: ${rateMappings.length} rates`,
  )

  if (!pms.api_key || !pms.endpoint_url || !pms.property_id) {
    console.error(`[v0] [pushViaScidoo] FAIL: Missing credentials`)
    return {
      success: false,
      method: "scidoo_api",
      cellsOrRecords: 0,
      errors: ["Configurazione Scidoo incompleta: api_key, endpoint_url o property_id mancante"],
    }
  }

  const client = new ScidooClient({
    pms_name: "scidoo",
    api_key: pms.api_key,
    endpoint_url: pms.endpoint_url,
    property_id: pms.property_id,
  })

  const errors: string[] = []
  // FIX 30/04/2026: warning soft (skip per occ fuori range della camera) NON
  // fanno fallire il push. Sono dati legacy in pricing_grid che vanno solo
  // ignorati. Vedi commento PushResult.warnings.
  const warnings: string[] = []
  const prices: {
    room_type_id: number
    price_id: number
    occupancy?: number
    day_price: number
    from: string
    to: string
  }[] = []

  console.log(
    `[v0] [pushViaScidoo] Available room type mappings:`,
    roomTypeMappings.map((r) => ({ id: r.id, code: r.code, scidoo_id: r.scidoo_room_type_id })),
  )
  console.log(
    `[v0] [pushViaScidoo] Available rate mappings:`,
    rateMappings.map((r) => ({ id: r.id, name: r.name, scidoo_id: r.scidoo_rate_id })),
  )

  // Contatori per il summary di warning sulle occ out-of-range. Aggreghiamo
  // per (camera, occ) per non spammare il log con 100+ righe identiche.
  const skippedByOccRange: Map<
    string,
    { roomName: string; occ: number; minOcc: number; maxOcc: number; count: number }
  > = new Map()

  for (const change of changes) {
    const rt = roomTypeMappings.find((r) => r.id === change.roomTypeId)
    if (!rt?.scidoo_room_type_id) {
      const errMsg = `Room type ${change.roomTypeName} (id=${change.roomTypeId}) non ha scidoo_room_type_id mappato`
      console.warn(`[v0] [pushViaScidoo] ${errMsg}`)
      errors.push(errMsg)
      continue
    }

    const rate = rateMappings.find((r) => r.id === change.rateId)
    if (!rate?.scidoo_rate_id) {
      const errMsg = `Rate ${change.rateId} non ha scidoo_rate_id mappato`
      console.warn(`[v0] [pushViaScidoo] ${errMsg}`)
      errors.push(errMsg)
      continue
    }

    // Guard difensivo: occupanza fuori range della camera. Salta con warning
    // aggregato invece di mandare a Scidoo (che la scarterebbe in silenzio).
    if (typeof change.occupancy === "number" && change.occupancy > 0) {
      const minOcc = rt.min_occupancy ?? 1
      const maxOcc = rt.max_occupancy ?? null
      if (change.occupancy < minOcc || (maxOcc !== null && change.occupancy > maxOcc)) {
        const key = `${rt.id}|${change.occupancy}`
        const existing = skippedByOccRange.get(key)
        if (existing) {
          existing.count++
        } else {
          skippedByOccRange.set(key, {
            roomName: rt.name || change.roomTypeName,
            occ: change.occupancy,
            minOcc,
            maxOcc: maxOcc ?? -1,
            count: 1,
          })
        }
        continue
      }
    }

    // Convert all values to proper numeric types (Scidoo API expects numeric values, not strings)
    const scidooRoomTypeId =
      typeof rt.scidoo_room_type_id === "string"
        ? parseInt(rt.scidoo_room_type_id, 10)
        : rt.scidoo_room_type_id
    const scidooRateId =
      typeof rate.scidoo_rate_id === "string" ? parseInt(rate.scidoo_rate_id, 10) : rate.scidoo_rate_id
    const dayPrice =
      typeof change.suggestedPrice === "string" ? parseFloat(change.suggestedPrice) : change.suggestedPrice
    const occupancy =
      change.occupancy != null
        ? typeof change.occupancy === "string"
          ? parseInt(change.occupancy, 10)
          : change.occupancy
        : undefined

    const priceObj: {
      room_type_id: number
      price_id: number
      day_price: number
      from: string
      to: string
      occupancy?: number
    } = {
      room_type_id: scidooRoomTypeId,
      price_id: scidooRateId,
      day_price: dayPrice,
      from: change.date,
      to: change.date,
    }

    if (occupancy !== undefined && occupancy !== null) {
      priceObj.occupancy = occupancy
    }

    prices.push(priceObj)
  }

  if (skippedByOccRange.size > 0) {
    for (const s of skippedByOccRange.values()) {
      const maxLabel = s.maxOcc >= 0 ? `${s.maxOcc}` : "n/a"
      const msg = `${s.roomName}: skippati ${s.count} prezzi per occupanza ${s.occ} (range camera ${s.minOcc}-${maxLabel}). La camera non accetta questa pax: aggiorna max_occupancy della camera nel PMS o non compilare quella riga.`
      console.warn(`[v0] [pushViaScidoo] OCC OUT-OF-RANGE: ${msg}`)
      warnings.push(msg)
    }
  }

  console.log(
    `[v0] [pushViaScidoo] Built ${prices.length} price records to send, ${errors.length} hard errors, ${warnings.length} soft warnings, ${skippedByOccRange.size} unique occ out-of-range groups`,
  )

  if (prices.length === 0) {
    console.warn(
      `[v0] [pushViaScidoo] No valid prices to send (errors=${errors.length}, warnings=${warnings.length})`,
    )
    return {
      success: errors.length === 0,
      method: "scidoo_api",
      cellsOrRecords: 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // FIX 02/07/2026: pausa tra i batch per non saturare il rate limit di Scidoo
  // (429 "Too Many Requests"). Prima i batch partivano tutti di fila e, su
  // modifiche estese (molti giorni), Scidoo bloccava dal ~batch 7 in poi.
  // AGGIORNAMENTO (margine prudenziale): batch piu' piccoli (25) e pausa piu'
  // lunga (750ms) per stare piu' larghi sul limite. Caso peggiore ~1500 prezzi
  // = ~60 batch x 750ms ≈ 45s di pause, ampiamente dentro maxDuration=300s.
  const batchSize = 25
  const INTER_BATCH_DELAY_MS = 750
  const BISECT_DELAY_MS = 300
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  // BATCH OMOGENEI PER ROOM TYPE (FIX 17/07/2026): Scidoo respingeva interi
  // batch con 400 "invalid data" quando il batch conteneva PIU' room_type_id.
  // Log Barronci 17/07: solo il 1o batch di ogni run passava, il resto 400
  // anche con record identici e validi (stessa tariffa valida per tutte le
  // camere, occ dentro capienza -> escluse come causa nell'indagine). Il
  // rifiuto e' a livello di batch: raggruppiamo i prezzi per room_type_id e
  // mandiamo batch OMOGENEI. In piu' sendBatchWithBisect isola via bisezione
  // l'eventuale singolo record invalido senza perdere gli altri 24.
  const byRoomType = new Map<number, ScidooPriceRecord[]>()
  for (const p of prices) {
    const arr = byRoomType.get(p.room_type_id)
    if (arr) arr.push(p)
    else byRoomType.set(p.room_type_id, [p])
  }

  let successCount = 0
  let failedBatches = 0
  let rateLimitedBatches = 0
  let budgetHit = false
  const invalidRecords: ScidooPriceRecord[] = []
  // Budget massimo di chiamate setDayPrices per push: copre il caso normale
  // (~60 batch) + bisezione, ma evita esplosioni patologiche (vedi guard).
  const callBudget = { remaining: 250 }
  let batchNum = 0
  let isFirstBatch = true
  for (const [roomTypeId, group] of byRoomType) {
    for (let i = 0; i < group.length; i += batchSize) {
      const batch = group.slice(i, i + batchSize)
      batchNum++
      if (!isFirstBatch) await sleep(INTER_BATCH_DELAY_MS)
      isFirstBatch = false
      console.log(
        `[v0] [pushViaScidoo] Sending batch ${batchNum} (room_type ${roomTypeId}) with ${batch.length} prices`,
      )
      console.log(`[v0] [pushViaScidoo] Sample price:`, JSON.stringify(batch[0]))

      const { processed, invalid, rateLimited, budgetExhausted, genericErrors } = await sendBatchWithBisect(
        client,
        batch,
        `Batch ${batchNum} (room_type ${roomTypeId})`,
        sleep,
        BISECT_DELAY_MS,
        callBudget,
      )
      successCount += processed
      if (invalid.length > 0) invalidRecords.push(...invalid)
      if (genericErrors.length > 0) errors.push(...genericErrors)
      if (budgetExhausted) budgetHit = true
      if (processed < batch.length) {
        failedBatches++
        if (rateLimited) rateLimitedBatches++
      }
      if (processed > 0) {
        console.log(`[v0] [pushViaScidoo] Batch ${batchNum} confirmed: ${processed}/${batch.length} records`)
      }
    }
  }

  if (invalidRecords.length > 0) {
    const sample = invalidRecords.slice(0, 10).map((r) => JSON.stringify(r)).join("; ")
    const invMsg =
      `Scidoo ha rifiutato ${invalidRecords.length} prezzi come "invalid data" (isolati via bisezione, ` +
      `gli altri prezzi del batch sono stati inviati). Esempi: ${sample}. ` +
      `Verifica su Scidoo la validita' di tariffa/occupanza/periodo per queste celle.`
    console.error(`[v0] [pushViaScidoo] INVALID RECORDS: ${invMsg}`)
    errors.push(invMsg)
  }
  if (rateLimitedBatches > 0) {
    const rlMsg = `${rateLimitedBatches} batch non inviati per rate limit Scidoo (429) dopo i retry.`
    console.warn(`[v0] [pushViaScidoo] ${rlMsg}`)
    errors.push(rlMsg)
  }
  if (budgetHit) {
    const budgetMsg =
      "Budget chiamate Scidoo esaurito durante l'isolamento dei record invalidi: " +
      "alcuni prezzi potrebbero non essere stati inviati. Rilancia il push o verifica i mapping room_type/tariffe."
    console.error(`[v0] [pushViaScidoo] ${budgetMsg}`)
    errors.push(budgetMsg)
  }

  console.log(
    `[v0] [pushViaScidoo] Push phase complete: ${successCount}/${prices.length} confirmed, ` +
      `${failedBatches} failed batches, ${invalidRecords.length} invalid records`,
  )

  // POST-PUSH VERIFICATION (FIX 30/04/2026):
  // Anche con setDayPrices strict, l'esperienza ci ha insegnato che Scidoo a
  // volte accetta payload e li scarta silenziosamente lato applicativo (es.
  // tariffe chiuse, periodi bloccati). Per chiudere il cerchio rileggiamo
  // un sample (max 50 records) tramite getPrices() e confrontiamo. Se la
  // discrepanza supera il 20% del sample, la consideriamo un'anomalia da
  // segnalare nei warning del PushResult senza far fallire l'intero push
  // (perché abbiamo gia' avuto conferma success=true dai batch).
  const verificationWarnings: string[] = []
  if (successCount > 0 && prices.length > 0) {
    try {
      const allDates = prices.map((p) => p.from).sort()
      const dateFrom = allDates[0]
      const dateTo = allDates[allDates.length - 1]

      console.log(`[v0] [pushViaScidoo] Post-push verification: reading getPrices(${dateFrom}, ${dateTo})`)
      const remotePrices = await client.getPrices(dateFrom, dateTo)
      console.log(`[v0] [pushViaScidoo] Verification: got ${remotePrices.length} prices from Scidoo`)

      const remoteIndex = new Map<string, number>()
      for (const r of remotePrices) {
        const rtId = String(r.room_type_id)
        const prId = String(r.price_id)
        const occ = r.occupancy != null ? String(r.occupancy) : "*"
        const price = typeof r.day_price === "string" ? parseFloat(r.day_price) : r.day_price
        const start = new Date((r.date || r.from) + "T00:00:00Z")
        const end = new Date((r.to || r.date || r.from) + "T00:00:00Z")
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0]
          const key = `${rtId}|${prId}|${occ}|${dateStr}`
          remoteIndex.set(key, price)
          const keyAnyOcc = `${rtId}|${prId}|*|${dateStr}`
          if (!remoteIndex.has(keyAnyOcc)) remoteIndex.set(keyAnyOcc, price)
        }
      }

      // Escludiamo dalla verifica i record isolati come invalidi (non li
      // abbiamo inviati): altrimenti risulterebbero "mancanti" su Scidoo e
      // gonfierebbero il warning post-push, che duplicherebbe l'errore gia'
      // riportato per gli invalidi.
      const invalidSet = new Set(invalidRecords)
      const verifyPrices = invalidSet.size > 0 ? prices.filter((p) => !invalidSet.has(p)) : prices
      const sampleSize = Math.min(50, verifyPrices.length)
      const stride = Math.max(1, Math.floor(verifyPrices.length / sampleSize))
      let missingCount = 0
      let mismatchCount = 0
      const sampledMissing: string[] = []
      for (let i = 0; i < verifyPrices.length; i += stride) {
        const sent = verifyPrices[i]
        const occKey = sent.occupancy != null ? String(sent.occupancy) : "*"
        const key = `${sent.room_type_id}|${sent.price_id}|${occKey}|${sent.from}`
        const keyAnyOcc = `${sent.room_type_id}|${sent.price_id}|*|${sent.from}`
        const remotePrice = remoteIndex.get(key) ?? remoteIndex.get(keyAnyOcc)
        if (remotePrice == null) {
          missingCount++
          if (sampledMissing.length < 5) {
            sampledMissing.push(
              `room=${sent.room_type_id} rate=${sent.price_id} occ=${sent.occupancy ?? "n/d"} ${sent.from}=€${sent.day_price}`,
            )
          }
        } else if (Math.abs(remotePrice - sent.day_price) > 0.5) {
          mismatchCount++
        }
      }

      const sampledTotal = Math.ceil(verifyPrices.length / stride)
      const missingPct = sampledTotal > 0 ? (missingCount / sampledTotal) * 100 : 0
      console.log(
        `[v0] [pushViaScidoo] Verification result: sampled=${sampledTotal} missing=${missingCount} (${missingPct.toFixed(1)}%) mismatched=${mismatchCount}`,
      )

      if (missingPct > 20) {
        const warnMsg =
          `Verifica post-push: ${missingCount}/${sampledTotal} prezzi NON trovati su Scidoo ` +
          `(${missingPct.toFixed(1)}%). Esempi: ${sampledMissing.join("; ")}. ` +
          `Possibili cause: tariffa non valida per quella camera, periodo bloccato, ` +
          `mapping room_type/rate errato.`
        console.warn(`[v0] [pushViaScidoo] ${warnMsg}`)
        verificationWarnings.push(warnMsg)
      }
      if (mismatchCount > 0) {
        verificationWarnings.push(
          `Verifica post-push: ${mismatchCount} prezzi presenti su Scidoo ma con valore diverso da quello inviato.`,
        )
      }
    } catch (verifyErr) {
      // Non-blocking: il push e' gia' confermato success dai batch. Logghiamo
      // solo il messaggio (non l'oggetto grezzo, che puo' contenere blob HTML
      // in caso di outage gateway) e a livello warn, non error.
      const verifyMsg = verifyErr instanceof Error ? verifyErr.message : "errore"
      console.warn(`[v0] [pushViaScidoo] Verification non disponibile (non-blocking): ${verifyMsg}`)
      verificationWarnings.push(`Verifica post-push non disponibile: ${verifyMsg}`)
    }
  }

  const hasVerificationFailure = verificationWarnings.some((w) => w.includes("NON trovati"))
  if (hasVerificationFailure) {
    errors.push(...verificationWarnings)
  }

  return {
    success: errors.length === 0 && failedBatches === 0,
    method: "scidoo_api",
    cellsOrRecords: successCount,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
