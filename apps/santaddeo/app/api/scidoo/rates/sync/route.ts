import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { NextResponse } from "next/server"
import { measureRoute } from "@/lib/performance/with-perf"

async function _POST(request: Request) {
  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get hotel_id from request
    const { hotel_id } = await request.json()

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    console.log("[v0] Starting rates sync for hotel:", hotel_id)

    const supabaseAdmin = await createServiceRoleClient()

    // Get PMS integration config
    const { data: pmsIntegration, error: pmsError } = await supabaseAdmin
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotel_id)
      .eq("is_active", true)
      .single()

    if (pmsError || !pmsIntegration) {
      console.error("[v0] PMS integration not found:", pmsError)
      return NextResponse.json({ error: "PMS integration not found or not active" }, { status: 404 })
    }

    // Initialize Scidoo client with correct parameters
    const scidooClient = new ScidooClient({
      apiKey: pmsIntegration.api_key,
      propertyId: pmsIntegration.property_id,
    })

    // Fetch rates from Scidoo
    console.log("[v0] Fetching rates from Scidoo...")
    const scidooRates = await scidooClient.getRates()
    console.log("[v0] Fetched rates from Scidoo:", scidooRates.length)

    if (!scidooRates || scidooRates.length === 0) {
      return NextResponse.json({ message: "No rates found in Scidoo", count: 0 }, { status: 200 })
    }

    // Fetch our room types to map Scidoo room_type_list -> applicable_room_type_ids
    const { data: ourRoomTypes } = await supabaseAdmin
      .from("room_types")
      .select("id, scidoo_room_type_id")
      .eq("hotel_id", hotel_id)

    // Build a lookup: scidoo_room_type_id -> our UUID
    const scidooToUuid: Record<string, string> = {}
    for (const rt of ourRoomTypes || []) {
      if (rt.scidoo_room_type_id) {
        scidooToUuid[rt.scidoo_room_type_id] = rt.id
      }
    }

    console.log("[v0] Room type lookup built:", Object.keys(scidooToUuid).length, "entries")

    const ratesToUpsert = scidooRates.map((rate) => {
      // Resolve room_type_list from Scidoo IDs to our UUIDs.
      // FIX (28/04/2026): NON deriviamo piu' min/max_occupancy schiacciando
      // tutte le camere applicabili in un range globale. Le occupanze sono
      // proprieta' delle CAMERE (room_types.min/max_occupancy), gia' importate
      // separatamente. Una stessa tariffa puo' applicarsi a camere con
      // occupanze diverse (es. Standard 1-2 vs Family 1-4) e l'editor le mostra
      // per camera. Lasciamo i campi rates.min/max_occupancy intatti come
      // legacy (non li tocchiamo per non perdere eventuali valori manuali).
      const scidooRoomTypeIds: number[] = rate.room_type_list || []
      const applicableRoomTypeIds = scidooRoomTypeIds
        .map((scidooId: number) => scidooToUuid[String(scidooId)])
        .filter(Boolean)

      // NOTA 30/04/2026: NON scriviamo `pms_rate_id` qui. La tabella `rates`
      // ha DUE unique constraint legacy:
      //  - UNIQUE(hotel_id, scidoo_rate_id) - usato da questo endpoint
      //  - UNIQUE(hotel_id, pms_rate_id)    - usato da scidoo-sync-service
      // Scrivendo `pms_rate_id` nell'upsert con onConflict su scidoo_rate_id,
      // se esistono righe legacy duplicate (una con scidoo_rate_id, una con
      // pms_rate_id per lo stesso rate Scidoo), l'upsert tenta INSERT e viola
      // l'altro constraint. L'allineamento `pms_rate_id` viene fatto come step
      // separato sotto, popolando solo le righe con pms_rate_id IS NULL.
      return {
        hotel_id,
        scidoo_rate_id: rate.id.toString(),
        code: rate.code || rate.id.toString(),
        name: rate.name || "",
        arrangements: rate.arrangements || [],
        is_active: rate.is_active !== false,
        applicable_room_type_ids: applicableRoomTypeIds,
        raw_data: rate,
        updated_at: new Date().toISOString(),
      }
    })

    console.log("[v0] Upserting rates:", ratesToUpsert.length)

    const { data: upsertedRates, error: upsertError } = await supabaseAdmin
      .from("rates")
      .upsert(ratesToUpsert, {
        onConflict: "hotel_id,scidoo_rate_id",
        ignoreDuplicates: false, // Update existing records
      })
      .select()

    if (upsertError) {
      console.error("[v0] Error upserting rates:", upsertError)
      return NextResponse.json({ error: "Failed to upsert rates", details: upsertError.message }, { status: 500 })
    }

    console.log("[v0] Successfully upserted rates:", upsertedRates?.length)

    // RIMOSSO 30/04/2026 (post-incident orphan Massabò 2306): l'auto-heal
    // `pms_rate_id` faceva `UPDATE rates SET pms_rate_id = scidoo_rate_id`
    // ma la colonna `pms_rate_id` NON esiste in questo schema (solo
    // `scidoo_rate_id`). Ogni esecuzione tentava 50+ UPDATE che fallivano
    // con error 42703, inquinava i log e in alcuni cron concorrenti
    // contribuiva al timeout dello slot Vercel. La memoria utente che
    // documentava le "due colonne legacy" si riferiva ad altro progetto.
    return NextResponse.json({
      message: "Rates synced successfully",
      count: upsertedRates?.length || 0,
      total: scidooRates.length,
    })
  } catch (error) {
    console.error("[v0] Error syncing rates:", error)
    return NextResponse.json(
      {
        error: "Failed to sync rates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export const POST = measureRoute("/api/scidoo/rates/sync", _POST as any)
