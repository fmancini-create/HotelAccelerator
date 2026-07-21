/**
 * Script per riprocessare le prenotazioni RAW mancanti da bookings
 * 
 * Uso:
 *   npx tsx scripts/reprocess-missing-bookings.ts [--hotel=<nome>] [--dry-run] [--limit=1000]
 * 
 * Opzioni:
 *   --hotel=<nome>  Processa solo l'hotel specificato (es. --hotel=barronci)
 *   --dry-run       Mostra cosa farebbe senza modificare il DB
 *   --limit=N       Limita il numero di prenotazioni da riprocessare (default: 1000)
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Parse arguments
const args = process.argv.slice(2)
const hotelFilter = args.find(a => a.startsWith("--hotel="))?.split("=")[1]
const dryRun = args.includes("--dry-run")
const limitArg = args.find(a => a.startsWith("--limit="))?.split("=")[1]
const limit = limitArg ? parseInt(limitArg) : 1000

async function main() {
  console.log("=== Riprocessamento prenotazioni mancanti ===")
  console.log(`Modalità: ${dryRun ? "DRY RUN (nessuna modifica)" : "LIVE"}`)
  console.log(`Limite: ${limit} prenotazioni`)
  if (hotelFilter) console.log(`Filtro hotel: ${hotelFilter}`)
  console.log("")

  // 1. Trova gli hotel
  let hotelsQuery = supabase.from("hotels").select("id, name")
  if (hotelFilter) {
    hotelsQuery = hotelsQuery.ilike("name", `%${hotelFilter}%`)
  }
  const { data: hotels, error: hotelsError } = await hotelsQuery

  if (hotelsError || !hotels?.length) {
    console.error("Errore nel recupero degli hotel:", hotelsError)
    process.exit(1)
  }

  console.log(`Hotel trovati: ${hotels.length}`)

  for (const hotel of hotels) {
    console.log(`\n--- ${hotel.name} ---`)

    // 2. Trova prenotazioni RAW che non sono in bookings
    // Escludiamo status "annullata" e "check_out" perché sono storiche non rilevanti
    const { data: missingRaw, error: missingError } = await supabase
      .from("scidoo_raw_bookings")
      .select("id, pms_booking_id, status, checkin_date, checkout_date, room_type_code, rate_code, total_amount")
      .eq("hotel_id", hotel.id)
      .not("status", "in", "(annullata,check_out)")
      .eq("processed", true)
      .limit(limit)

    if (missingError) {
      console.error(`Errore query RAW per ${hotel.name}:`, missingError)
      continue
    }

    if (!missingRaw?.length) {
      console.log("Nessuna prenotazione RAW da verificare")
      continue
    }

    // 3. Filtra solo quelle che effettivamente mancano da bookings
    const pmsIds = missingRaw.map(r => r.pms_booking_id)
    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("pms_booking_id")
      .eq("hotel_id", hotel.id)
      .in("pms_booking_id", pmsIds)

    const existingPmsIds = new Set((existingBookings || []).map(b => b.pms_booking_id))
    const toReprocess = missingRaw.filter(r => !existingPmsIds.has(r.pms_booking_id))

    console.log(`Prenotazioni RAW attive: ${missingRaw.length}`)
    console.log(`Già in bookings: ${existingPmsIds.size}`)
    console.log(`Da riprocessare: ${toReprocess.length}`)

    if (toReprocess.length === 0) {
      continue
    }

    // 4. Mostra dettagli
    const byStatus: Record<string, number> = {}
    for (const r of toReprocess) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
    }
    console.log("Per status:", byStatus)

    // 5. Reset processed=false per forzare riprocessamento
    if (!dryRun) {
      const idsToReset = toReprocess.map(r => r.id)
      
      // Reset in batch da 100
      for (let i = 0; i < idsToReset.length; i += 100) {
        const batch = idsToReset.slice(i, i + 100)
        const { error: updateError } = await supabase
          .from("scidoo_raw_bookings")
          .update({ processed: false })
          .in("id", batch)

        if (updateError) {
          console.error(`Errore reset batch ${i}-${i + batch.length}:`, updateError)
        } else {
          console.log(`Reset ${i + batch.length}/${idsToReset.length} prenotazioni`)
        }
      }

      console.log(`\nReset completato! Le prenotazioni verranno riprocessate al prossimo ciclo ETL (ogni 5 minuti).`)
    } else {
      console.log(`\n[DRY RUN] Avrebbe resettato ${toReprocess.length} prenotazioni per riprocessamento`)
    }
  }

  console.log("\n=== Completato ===")
}

main().catch(console.error)
