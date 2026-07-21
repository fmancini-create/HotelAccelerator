import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixRoomTypeMappings() {
  console.log("[v0] Starting room type mapping fix...")

  // 1. Get all raw availability records to find which Scidoo room types we have
  const { data: rawData, error: rawError } = await supabase.from("scidoo_raw_availability").select("data").limit(1000)

  if (rawError) {
    console.error("[v0] Error fetching raw data:", rawError)
    return
  }

  // Extract unique Scidoo room type IDs
  const scidooRoomTypeIds = new Set<string>()
  rawData?.forEach((record: any) => {
    const data = record.data
    if (data.room_type_id) {
      scidooRoomTypeIds.add(String(data.room_type_id))
    }
  })

  console.log("[v0] Found Scidoo room types:", Array.from(scidooRoomTypeIds))

  // 2. Get existing room types in SANTADDEO
  const { data: roomTypes, error: rtError } = await supabase.from("room_types").select("*")

  if (rtError) {
    console.error("[v0] Error fetching room types:", rtError)
    return
  }

  console.log("[v0] Existing room types:", roomTypes?.length)

  // 3. For each Scidoo room type without mapping, update or create
  for (const scidooId of scidooRoomTypeIds) {
    const existing = roomTypes?.find((rt) => rt.scidoo_room_type_id === scidooId)

    if (!existing) {
      console.log(`[v0] Creating mapping for Scidoo room type ${scidooId}`)

      // Find a room type without scidoo_room_type_id set
      const unmapped = roomTypes?.find((rt) => !rt.scidoo_room_type_id && rt.is_active)

      if (unmapped) {
        const { error: updateError } = await supabase
          .from("room_types")
          .update({ scidoo_room_type_id: scidooId })
          .eq("id", unmapped.id)

        if (updateError) {
          console.error(`[v0] Error updating room type ${unmapped.id}:`, updateError)
        } else {
          console.log(`[v0] Mapped Scidoo ${scidooId} to room type ${unmapped.name}`)
        }
      } else {
        console.log(`[v0] No unmapped room type available for Scidoo ${scidooId}`)
      }
    } else {
      console.log(`[v0] Mapping already exists for Scidoo room type ${scidooId}`)
    }
  }

  console.log("[v0] Room type mapping fix complete!")
}

fixRoomTypeMappings()
