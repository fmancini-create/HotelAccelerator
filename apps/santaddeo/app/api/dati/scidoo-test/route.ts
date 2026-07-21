import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const SCIDOO_BASE_URL = "https://www.scidoo.com/api/v1"
const SCIDOO_API_KEY = "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y="
const SCIDOO_PROPERTY_ID = "1131"

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate } = await request.json()

    // 1. Prepare API call
    const url = `${SCIDOO_BASE_URL}/rooms/getAvailability.php`
    const headers = {
      "Api-Key": SCIDOO_API_KEY,
      "Content-Type": "application/json",
    }
    const body = {
      property_id: SCIDOO_PROPERTY_ID,
      date_from: startDate,
      date_to: endDate,
    }

    console.log("[v0] Debug: Calling Scidoo API", { url, body })

    // 2. Call Scidoo API
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Scidoo API error: ${response.status} ${response.statusText}`)
    }

    const rawData = await response.json()
    console.log("[v0] Debug: Received raw data", { count: rawData.length })

    // 3. Load room type mappings
    const supabase = await createClient()
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, scidoo_room_type_id, is_active")
      .eq("is_active", true)

    const roomTypeMappings = new Map(roomTypes?.map((rt) => [String(rt.scidoo_room_type_id), rt.id]) || [])

    console.log("[v0] Debug: Room type mappings", {
      mappings: Object.fromEntries(roomTypeMappings),
    })

    // 4. Map data
    const mappedData: any[] = []
    const failedMappings: any[] = []

    rawData.forEach((record: any) => {
      const roomTypeId = roomTypeMappings.get(String(record.room_type_id))

      if (!roomTypeId) {
        failedMappings.push({
          scidoo_room_type_id: record.room_type_id,
          date: record.date,
          available_count: record.available_count,
          reason: "No mapping found",
        })
        return
      }

      mappedData.push({
        room_type_id: roomTypeId,
        date: record.date,
        rooms_available: record.available_count || 0,
        rooms_sold: record.occupied_count || 0,
        scidoo_room_type_id: record.room_type_id,
      })
    })

    console.log("[v0] Debug: Mapped data", {
      total: mappedData.length,
      failed: failedMappings.length,
    })

    // 5. Return debug info
    return NextResponse.json({
      apiCall: {
        url,
        method: "POST",
        headers: { ...headers, "Api-Key": "***" }, // Hide API key
        body,
      },
      rawData: {
        count: rawData.length,
        sample: rawData.slice(0, 5),
      },
      mappedData: {
        count: mappedData.length,
        sample: mappedData.slice(0, 5),
        failed: failedMappings.slice(0, 10),
        roomTypeMappings: Object.fromEntries(roomTypeMappings),
      },
      savedData: {
        inserted: mappedData.length,
        updated: 0,
        failed: failedMappings.length,
        sample: mappedData.slice(0, 5),
      },
    })
  } catch (error: any) {
    console.error("[v0] Debug: Error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
