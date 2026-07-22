/**
 * Backfill K-values per Villa I Barronci a 365 giorni avanti.
 *
 * Bypassa la rete: chiama direttamente le funzioni del service.
 * Usa il SERVICE_ROLE_KEY gia' presente in /vercel/share/.env.project.
 */
import { calculateAllKVariables, storeKVariableValues } from "@/lib/pricing/k-variables-service"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { updateHotelWeatherForecasts } from "@/lib/services/weather-service"

const BARRONCI_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
const DAYS_AHEAD = 365

async function main() {
  const supabase = await createServiceRoleClient()

  const { data: hotel, error } = await supabase
    .from("hotels")
    .select("id, name, latitude, longitude")
    .eq("id", BARRONCI_ID)
    .single()

  if (error || !hotel) {
    console.error("Hotel not found:", error)
    process.exit(1)
  }

  console.log(`[backfill] hotel=${hotel.name} days=${DAYS_AHEAD}`)

  if (hotel.latitude && hotel.longitude) {
    try {
      await updateHotelWeatherForecasts(hotel.id, hotel.latitude, hotel.longitude)
      console.log("[backfill] weather updated")
    } catch (e) {
      console.warn("[backfill] weather skipped:", (e as Error).message)
    }
  }

  const today = new Date()
  let ok = 0
  let fail = 0
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split("T")[0]
    try {
      const kvals = await calculateAllKVariables(supabase, hotel.id, dateStr)
      await storeKVariableValues(hotel.id, dateStr, kvals.variables)
      ok++
      if (ok % 30 === 0) console.log(`[backfill] ${ok}/${DAYS_AHEAD + 1}`)
    } catch (e) {
      fail++
      console.error(`[backfill] ${dateStr} failed:`, (e as Error).message)
    }
  }

  console.log(`[backfill] done: ok=${ok} fail=${fail}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
