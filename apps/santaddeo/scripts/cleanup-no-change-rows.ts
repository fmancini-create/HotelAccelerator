/**
 * FASE 2 (12/05/2026) - CLEANUP RIGHE FANTASMA
 *
 * Marca come action_taken='no_change' tutte le righe in price_change_log
 * dove old_price = new_price AND action_taken = 'none'.
 *
 * Queste righe "fantasma" non rappresentano vere variazioni e creano loop
 * infiniti nell'autopilot:
 *   1. Vengono pescate come action_taken='none' dal cron pricing
 *   2. Il push al PMS non fa nulla (0 record da cambiare)
 *   3. Le righe restano action_taken='none'
 *   4. Vengono ripescate al ciclo successivo → loop
 *
 * Il fix in FASE 1 previene la CREAZIONE di queste righe da ora in avanti.
 * Questo script pulisce quelle gia' esistenti.
 *
 * Requisiti FASE 2:
 *  - supporta DRY RUN (--dry-run)
 *  - batch da 500 righe
 *  - logga numero righe aggiornate
 *  - NON cancella dati (solo UPDATE action_taken='no_change')
 *
 * Usage:
 *   npx tsx scripts/cleanup-no-change-rows.ts --hotel=massabo --dry-run
 *   npx tsx scripts/cleanup-no-change-rows.ts --hotel=massabo
 *   npx tsx scripts/cleanup-no-change-rows.ts --all
 *   npx tsx scripts/cleanup-no-change-rows.ts --all --dry-run
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[cleanup] ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BATCH_SIZE = 500

async function findGhostRowsForHotel(hotelId: string): Promise<string[]> {
  // PostgREST non supporta confronti colonna=colonna nelle query JS,
  // quindi facciamo paginazione esplicita e filtriamo lato client.
  // Pesca solo le righe candidate (action_taken='none', old_price NOT NULL).
  const PAGE = 1000
  const ghostIds: string[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("price_change_log")
      .select("id, old_price, new_price")
      .eq("hotel_id", hotelId)
      .eq("action_taken", "none")
      .not("old_price", "is", null)
      .range(from, from + PAGE - 1)

    if (error) {
      console.error(`[cleanup] fetch error hotel=${hotelId}:`, error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const r of data) {
      if (
        r.old_price !== null &&
        r.new_price !== null &&
        Math.abs(Number(r.old_price) - Number(r.new_price)) <= 0.001
      ) {
        ghostIds.push(r.id)
      }
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  return ghostIds
}

async function closeGhostRows(ghostIds: string[], dryRun: boolean): Promise<number> {
  if (ghostIds.length === 0) return 0
  if (dryRun) return ghostIds.length

  const totalBatches = Math.ceil(ghostIds.length / BATCH_SIZE)
  let closed = 0

  for (let i = 0; i < ghostIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const chunk = ghostIds.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from("price_change_log")
      .update({ action_taken: "no_change" })
      .in("id", chunk)

    if (error) {
      console.error(`[cleanup] update batch ${batchNum}/${totalBatches} error:`, error.message)
      continue
    }
    closed += chunk.length
    console.log(`[cleanup] updated batch ${batchNum}/${totalBatches} (${chunk.length} rows)`)
  }

  return closed
}

async function main() {
  const args = process.argv.slice(2)
  const hotelArg = args.find((a) => a.startsWith("--hotel="))?.split("=")[1]
  const dryRun = args.includes("--dry-run")
  const all = args.includes("--all")

  if (!hotelArg && !all) {
    console.error("[cleanup] Usage:")
    console.error("  npx tsx scripts/cleanup-no-change-rows.ts --hotel=<name> [--dry-run]")
    console.error("  npx tsx scripts/cleanup-no-change-rows.ts --all [--dry-run]")
    process.exit(1)
  }

  const { data: hotels, error: hotelErr } = await supabase
    .from("hotels")
    .select("id, name")
    .ilike("name", all ? "%" : `%${hotelArg}%`)

  if (hotelErr || !hotels?.length) {
    console.error("[cleanup] hotel not found:", hotelErr?.message || hotelArg)
    process.exit(1)
  }

  console.log(`[cleanup] mode=${dryRun ? "DRY_RUN" : "APPLY"} hotels=${hotels.length}`)

  let totalFound = 0
  let totalUpdated = 0

  for (const hotel of hotels) {
    console.log(`[cleanup] scanning hotel=${hotel.name} (${hotel.id})`)
    const ghostIds = await findGhostRowsForHotel(hotel.id)

    if (ghostIds.length === 0) {
      console.log(`[cleanup] hotel=${hotel.name} ghost_rows=0 (clean)`)
      continue
    }

    console.log(`[cleanup] found ${ghostIds.length} ghost rows for hotel=${hotel.name}`)
    totalFound += ghostIds.length

    const updated = await closeGhostRows(ghostIds, dryRun)
    totalUpdated += updated
  }

  console.log(
    `[cleanup] completed mode=${dryRun ? "DRY_RUN" : "APPLY"} ` +
    `total_found=${totalFound} total_updated=${totalUpdated}`
  )
}

main().catch((err) => {
  console.error("[cleanup] fatal error:", err)
  process.exit(1)
})
