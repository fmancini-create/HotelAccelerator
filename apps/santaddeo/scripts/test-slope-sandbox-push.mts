/**
 * Test push tariffe sulla SANDBOX Slope (staging): un aggiornamento di prova
 * su "Camera matrimoniale standard" x "Bed & Breakfast" (non derivato).
 * Uso: npx tsx --env-file=/vercel/share/.env.project --tsconfig scripts/tsconfig.slope-test.json scripts/test-slope-sandbox-push.mts
 */
const LODGING_STANDARD = "3fea4cd0" // prefisso, risolto a runtime
const RATE_BB = "518fa49b"

async function main() {
  const { SlopeClient } = await import("../lib/connectors/slope/client")
  const { slopeName } = await import("../lib/connectors/slope/types")

  const client = new SlopeClient({
    apiKey: "e6255f9af801704c42a1ea6ac1b5326e",
    baseUrl: "https://api.staging.slope.it",
  })

  const lts = await client.getLodgingTypes()
  const lt = lts.find((l) => l.id.startsWith(LODGING_STANDARD))!
  const rps = await client.getRatePlans()
  const rp = rps.find((r) => r.id.startsWith(RATE_BB))!
  console.log(`[v0] push su "${slopeName(lt.name)}" (max ${lt.maximumCapacity}) x "${slopeName(rp.name)}" (derived: ${rp.isDerived})`)

  // 2 giorni futuri, prezzi test per occupancy 1..maximumCapacity
  const start = "2026-08-01"
  const end = "2026-08-03" // [start; end) => 1 e 2 agosto
  // NB: rate DEVE essere una Money-string a 2 decimali ("125.00"), non un
  // numero JSON — verificato live: numero => 400 invalid.data, stringa => 202.
  const rates = Array.from({ length: lt.maximumCapacity }, (_, i) => ({
    occupancy: i + 1,
    rate: (100 + (i + 1) * 25).toFixed(2), // "125.00" / "150.00" / "175.00"
  }))

  await client.postRatesAndAvailabilityUpdates(lt.id, {
    rateUpdates: [{ dateRange: { start, end }, ratePlanId: rp.id, rates }],
  })
  console.log(`[v0] PUSH ACCETTATO (202) per ${start}..${end} rates=${JSON.stringify(rates)}`)
}

main().catch((e) => {
  console.error("[v0] FATAL:", e?.status ?? "", e?.body ?? e)
  process.exit(1)
})
