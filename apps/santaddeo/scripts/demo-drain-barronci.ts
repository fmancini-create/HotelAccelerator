// DEMO PREP - 13/05/2026
// Drain immediato della coda pricing per Villa I Barronci.
// Usa la STESSA funzione del cron: processPendingPricingQueue.
import { processPendingPricingQueue } from "../lib/pricing/process-queue"

const BARRONCI = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"

async function main() {
  const start = Date.now()
  console.log("[demo-drain] hotel:", BARRONCI)
  console.log("[demo-drain] SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  console.log("[demo-drain] SERVICE_ROLE_KEY present:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Drena in piu' pass finche' la coda non e' vuota per questo hotel.
  let totalProcessed = 0
  let totalSucceeded = 0
  let totalFailed = 0
  for (let pass = 1; pass <= 5; pass++) {
    const res = await processPendingPricingQueue({ hotelId: BARRONCI, maxItems: 50 })
    console.log(`[demo-drain] pass ${pass}: processed=${res.processed} succeeded=${res.succeeded} failed=${res.failed}`)
    if (res.items.length > 0) {
      console.log(`[demo-drain] items:`, JSON.stringify(res.items, null, 2))
    }
    totalProcessed += res.processed
    totalSucceeded += res.succeeded
    totalFailed += res.failed
    if (res.processed === 0) break
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[demo-drain] DONE in ${elapsed}s. total_processed=${totalProcessed} succeeded=${totalSucceeded} failed=${totalFailed}`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("[demo-drain] FATAL:", err)
  process.exit(1)
})
