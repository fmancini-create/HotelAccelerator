/**
 * Test end-to-end del connettore Slope nativo contro la SANDBOX staging.
 * Hotel di test: "Hotel Superlusso Test" (91af5596-..., vuoto, nessun dato reale).
 *
 * Esegue: sync prenotazioni (full, primo giro) → ETL verso public.bookings →
 * report finale con verifica dei dati scritti.
 *
 * Uso: npx tsx --env-file=/vercel/share/.env.project scripts/test-slope-sandbox-sync.mts
 * (script riutilizzabile per test futuri; NON tocca hotel reali)
 */
import { createClient } from "@supabase/supabase-js"

const HOTEL_ID = "91af5596-5854-4857-a5d6-3903935c4069"

async function main() {
  // Import dinamici per rispettare "server-only" (no-op fuori da Next se stubbato)
  const { syncSlopeForHotel } = await import("../lib/connectors/slope/sync")
  const { SlopeBookingsProcessor } = await import("../lib/etl/processors/slope-bookings-processor")

  console.log("[v0] 1) SYNC prenotazioni Slope (full, sandbox)...")
  const report = await syncSlopeForHotel({ hotelId: HOTEL_ID, forceFullSync: true, reconcileDeleted: true })
  console.log("[v0] report sync:", JSON.stringify(report, null, 2))

  if (report.errors.length > 0) {
    console.error("[v0] ERRORI nel sync, mi fermo qui.")
    process.exit(1)
  }

  console.log("[v0] 2) ETL SlopeBookingsProcessor...")
  const processor = new SlopeBookingsProcessor(HOTEL_ID, `test-sandbox-${Date.now()}`)
  const etl = await processor.process()
  console.log("[v0] report ETL:", JSON.stringify(etl, null, 2))

  console.log("[v0] 3) VERIFICA dati scritti...")
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { count: rawCount } = await supabase
    .schema("connectors")
    .from("slope_raw_bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "pms_booking_id, check_in_date, check_out_date, is_cancelled, total_price, adults, children, channel, nightly_prices",
    )
    .eq("hotel_id", HOTEL_ID)
    .order("check_in_date")
    .limit(20)
  console.log(`[v0] raw rows: ${rawCount}`)
  console.log(`[v0] public.bookings (${bookings?.length ?? 0}):`)
  for (const b of bookings ?? []) {
    const nights = b.nightly_prices ? Object.keys(b.nightly_prices).length : 0
    console.log(
      `  - ${String(b.pms_booking_id).slice(0, 8)} ${b.check_in_date} -> ${b.check_out_date} | cancellata: ${b.is_cancelled} | €${b.total_price} | ${b.adults ?? "n/d"} adulti + ${b.children ?? "n/d"} bambini | ${b.channel ?? "n/d"} | ${nights} notti prezzate`,
    )
  }

  console.log("[v0] 4) TEST client: lodging types e rate plans...")
  const { SlopeClient } = await import("../lib/connectors/slope/client")
  const { slopeName } = await import("../lib/connectors/slope/types")
  const { data: pms } = await supabase
    .from("pms_integrations")
    .select("api_key, endpoint_url")
    .eq("hotel_id", HOTEL_ID)
    .maybeSingle()
  const client = new SlopeClient({ apiKey: pms!.api_key!, baseUrl: pms!.endpoint_url! })
  const lts = await client.getLodgingTypes()
  console.log(`[v0] lodging types (${lts.length}):`)
  for (const lt of lts) console.log(`  - ${lt.id.slice(0, 8)} "${slopeName(lt.name)}" nom:${lt.nominalCapacity} max:${lt.maximumCapacity} qty:${lt.quantity}`)
  const rps = await client.getRatePlans()
  console.log(`[v0] rate plans (${rps.length}):`)
  for (const rp of rps) console.log(`  - ${rp.id.slice(0, 8)} "${slopeName(rp.name)}" derived:${rp.isDerived}`)
}

main().catch((e) => {
  console.error("[v0] FATAL:", e)
  process.exit(1)
})
