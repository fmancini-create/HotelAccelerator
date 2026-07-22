/**
 * Reconcile sent prices — DRIFT repair grid ↔ last_sent_prices.
 *
 * ## Perche' esiste (incident 29/06/2026)
 * La pipeline di recalc (`recalculate-queued-prices.ts`) calcola il "prezzo
 * vecchio" confrontando il nuovo valore contro `pricing_grid` (riga 569),
 * NON contro `last_sent_prices` (cio' che il PMS ha davvero ricevuto). Se un
 * push fallisce DOPO che la grid e' stata aggiornata, `pricing_grid` e
 * `last_sent_prices` divergono: il recalc successivo trova grid == nuovo
 * prezzo, conclude "nessuna variazione", e non riaccoda mai il push. Risultato:
 * Scidoo resta bloccato su un prezzo vecchio all'infinito.
 *
 * Inoltre il coverage report (`coverage-report.ts`) confronta le DATE pushate,
 * non i VALORI: una data pushata una volta (poi divergente) risulta "coperta"
 * al 100% e l'anomalia non emerge mai.
 *
 * ## Cosa fa
 * Per ogni hotel in mode='autopilot', trova le celle dove
 * `pricing_grid.price` differisce da `last_sent_prices.last_price` (solo
 * tariffe MADRI — le derivate le ricalcola Scidoo dalla madre; solo celle GIA'
 * inviate almeno una volta, lsp NOT NULL — i veri "buchi" greenfield restano
 * gestiti dal flusso normale / coverage) e RIACCODA il push verso il PMS
 * riusando `/api/autopilot/push` (che rilegge i prezzi autoritativi da grid e
 * aggiorna `last_sent_prices` al successo).
 *
 * E' SELF-TERMINATING: una volta che il push aggiorna `last_sent`, grid ==
 * last_sent e il giro successivo non trova piu' nulla. Non tocca il motore di
 * recalc (area fragile). NON agisce sugli hotel in mode='notify'/'disabled':
 * per quelli l'autopilot non pusha al PMS per scelta dell'utente.
 *
 * "Dati certi": riallinea solo dove SAPPIAMO che il PMS ha un valore diverso
 * (lsp NOT NULL && grid != lsp). Niente invenzioni.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import type { PriceChange } from "./calculate-suggested-price"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Grazia anti-race: non riallineare celle la cui grid e' stata aggiornata
 * negli ultimi minuti. Un recalc potrebbe essere in corso e stiamo per
 * vedere un valore intermedio. 2 minuti coprono ampiamente un recalc.
 */
const GRID_FRESHNESS_GRACE_MIN = 2

/**
 * Cap difensivo di celle riallineate per hotel in un singolo giro, per
 * rispettare il budget lambda. Il giro successivo riprende il resto.
 */
const MAX_CELLS_PER_HOTEL = 5000

/** Dimensione chunk per le POST a /api/autopilot/push. */
const PUSH_CHUNK = 800

function resolveAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? process.env.VERCEL_URL.trim() : "") ||
    "http://localhost:3000"
  const withSchema = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withSchema.replace(/\/+$/, "")
}

export interface ReconcileHotelResult {
  hotelId: string
  mode: string
  /** Celle in drift trovate (grid != last_sent, madri, gia' inviate). */
  driftFound: number
  /** Celle effettivamente inviate (somma cellsOrRecords dei push riusciti). */
  pushedCells: number
  /** Chunk di push con success=true. */
  chunksOk: number
  /** Chunk di push falliti. */
  chunksFailed: number
  skipped?: string
  error?: string
}

interface DriftRow {
  room_type_id: string
  rate_id: string
  occupancy: number
  date: string
  price: number
  last_price: number
}

/**
 * Riallinea un singolo hotel. Ritorna un summary. Non lancia: incapsula gli
 * errori nel risultato cosi' il batch puo' proseguire sugli altri hotel.
 */
export async function reconcileSentPricesForHotel(
  hotelId: string,
  supabaseClient?: any,
): Promise<ReconcileHotelResult> {
  const base: ReconcileHotelResult = {
    hotelId,
    mode: "unknown",
    driftFound: 0,
    pushedCells: 0,
    chunksOk: 0,
    chunksFailed: 0,
  }

  if (!UUID_RE.test(hotelId)) {
    return { ...base, error: `hotelId non e' un UUID valido: ${hotelId}` }
  }

  try {
    const supabase = supabaseClient || (await createServiceRoleClient())

    // 1. Solo hotel in autopilot reale (push al PMS). notify/disabled esclusi.
    const { data: apConfig, error: apErr } = await supabase
      .from("autopilot_configs")
      .select("mode")
      .eq("hotel_id", hotelId)
      .maybeSingle()
    if (apErr) {
      return { ...base, error: `read autopilot_configs: ${apErr.message}` }
    }
    const mode = (apConfig?.mode as string) || "disabled"
    base.mode = mode
    if (mode !== "autopilot") {
      return { ...base, skipped: `mode='${mode}' (no PMS push)` }
    }

    // 2. Celle in drift: grid != last_sent, SOLO tariffe madri, SOLO celle
    //    gia' inviate (lsp NOT NULL), date future, grid non freschissima.
    //    UUID gia' validato sopra -> safe nell'interpolazione.
    const driftSql =
      `SELECT pg.room_type_id, pg.rate_id, pg.occupancy, ` +
      `pg.date::text AS date, pg.price::float8 AS price, ` +
      `lsp.last_price::float8 AS last_price ` +
      `FROM pricing_grid pg ` +
      `JOIN rates r ON r.id = pg.rate_id AND r.hotel_id = pg.hotel_id ` +
      `JOIN last_sent_prices lsp ON lsp.hotel_id = pg.hotel_id ` +
      `AND lsp.room_type_id = pg.room_type_id AND lsp.rate_id = pg.rate_id ` +
      `AND lsp.occupancy = pg.occupancy AND lsp.target_date = pg.date ` +
      `WHERE pg.hotel_id = '${hotelId}' ` +
      `AND pg.date >= CURRENT_DATE ` +
      `AND r.parent_rate_id IS NULL ` +
      `AND r.is_active = true ` +
      `AND pg.price IS DISTINCT FROM lsp.last_price ` +
      `AND pg.updated_at < (now() - interval '${GRID_FRESHNESS_GRACE_MIN} minutes') ` +
      `ORDER BY pg.date, pg.room_type_id, pg.rate_id, pg.occupancy ` +
      `LIMIT ${MAX_CELLS_PER_HOTEL}`

    const { data: driftData, error: driftErr } = await supabase.rpc(
      "exec_sql_returning_json",
      { query: driftSql },
    )
    if (driftErr) {
      return { ...base, error: `drift query: ${driftErr.message}` }
    }

    const rows: DriftRow[] = Array.isArray(driftData)
      ? (driftData as DriftRow[])
      : []
    base.driftFound = rows.length
    if (rows.length === 0) {
      return base
    }

    console.log(
      `[v0] [reconcile-sent] Hotel ${hotelId}: ${rows.length} celle in drift (grid != last_sent) da riallineare`,
    )

    // 3. Costruisci i PriceChange. La push route rilegge comunque il prezzo
    //    autoritativo da grid; passiamo grid.price come suggestedPrice e
    //    last_price come currentPrice (per la mail di conferma).
    const changes: PriceChange[] = rows.map((r) => ({
      date: r.date,
      roomTypeId: r.room_type_id,
      rateId: r.rate_id,
      occupancy: r.occupancy,
      currentPrice: r.last_price,
      suggestedPrice: r.price,
    }))

    // 4. Push a chunk verso /api/autopilot/push (chiamata interna).
    const appUrl = resolveAppUrl()
    const internalToken = process.env.CRON_SECRET || ""

    for (let i = 0; i < changes.length; i += PUSH_CHUNK) {
      const chunk = changes.slice(i, i + PUSH_CHUNK)
      try {
        const resp = await fetch(`${appUrl}/api/autopilot/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
          },
          body: JSON.stringify({ hotelId, changes: chunk }),
        })
        const result = await resp.json().catch(() => ({}))
        if (resp.ok && result?.success === true) {
          base.chunksOk++
          base.pushedCells += Number(result?.cellsOrRecords) || chunk.length
        } else {
          base.chunksFailed++
          console.error(
            `[v0] [reconcile-sent] Hotel ${hotelId}: chunk ${i}..${i + chunk.length} push fallito:`,
            (Array.isArray(result?.errors) ? result.errors.join(" | ") : result?.error) ||
              `HTTP ${resp.status}`,
          )
        }
      } catch (chunkErr) {
        base.chunksFailed++
        console.error(
          `[v0] [reconcile-sent] Hotel ${hotelId}: chunk ${i}..${i + chunk.length} threw:`,
          chunkErr instanceof Error ? chunkErr.message : chunkErr,
        )
      }
    }

    return base
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export interface ReconcileBatchResult {
  hotelsScanned: number
  hotelsWithDrift: number
  totalDriftCells: number
  totalPushedCells: number
  perHotel: ReconcileHotelResult[]
}

/**
 * Riallinea TUTTI gli hotel in mode='autopilot'. Usato dal cron.
 */
export async function reconcileSentPricesForAllAutopilotHotels(): Promise<ReconcileBatchResult> {
  const supabase = await createServiceRoleClient()

  const { data: configs, error } = await supabase
    .from("autopilot_configs")
    .select("hotel_id")
    .eq("mode", "autopilot")

  if (error) {
    throw new Error(`reconcile-sent: read autopilot_configs: ${error.message}`)
  }

  const hotelIds = (configs || [])
    .map((c: { hotel_id: string }) => c.hotel_id)
    .filter((id: string) => UUID_RE.test(id))

  const perHotel: ReconcileHotelResult[] = []
  for (const hotelId of hotelIds) {
    // Sequenziale: ogni hotel fa push verso il PMS, evitiamo di saturare il
    // connettore e di superare il budget lambda con paralleli pesanti.
    const res = await reconcileSentPricesForHotel(hotelId, supabase)
    perHotel.push(res)
  }

  return {
    hotelsScanned: hotelIds.length,
    hotelsWithDrift: perHotel.filter((h) => h.driftFound > 0).length,
    totalDriftCells: perHotel.reduce((s, h) => s + h.driftFound, 0),
    totalPushedCells: perHotel.reduce((s, h) => s + h.pushedCells, 0),
    perHotel,
  }
}
