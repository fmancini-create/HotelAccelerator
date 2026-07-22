import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")
  const mode = searchParams.get("mode") // "system" | "custom" | null

  try {
    // Get global defaults (hotel_id is NULL) - always needed
    const { data: globalThresholds } = await supabase
      .from("kpi_thresholds")
      .select("*")
      .is("hotel_id", null)

    // Get hotel-specific thresholds
    const { data: hotelThresholds } = hotelId
      ? await supabase
          .from("kpi_thresholds")
          .select("*")
          .eq("hotel_id", hotelId)
      : { data: [] }

    const hasCustom = (hotelThresholds || []).length > 0

    // Build the thresholds map based on mode
    const thresholdsMap: Record<string, any> = {}

    if (mode === "system") {
      // System mode: only global/benchmark thresholds (no hotel overrides)
      for (const threshold of globalThresholds || []) {
        thresholdsMap[threshold.metric_key] = threshold
      }
    } else if (mode === "custom") {
      // Custom mode: hotel-specific with fallback to global
      for (const threshold of globalThresholds || []) {
        thresholdsMap[threshold.metric_key] = threshold
      }
      for (const threshold of hotelThresholds || []) {
        thresholdsMap[threshold.metric_key] = threshold
      }
    } else {
      // Default (no mode): merge hotel + global (backward compatible)
      for (const threshold of globalThresholds || []) {
        thresholdsMap[threshold.metric_key] = threshold
      }
      for (const threshold of hotelThresholds || []) {
        thresholdsMap[threshold.metric_key] = threshold
      }
    }

    return NextResponse.json({
      thresholds: thresholdsMap,
      hotelId,
      hasCustom,
    })
  } catch (error) {
    console.error("Error fetching KPI thresholds:", error)
    return NextResponse.json({ error: "Failed to fetch KPI thresholds" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { hotel_id, metric_key, green_min, green_max, orange_min, red_min, is_inverted } = body

    if (!metric_key) {
      return NextResponse.json({ error: "metric_key required" }, { status: 400 })
    }

    // Always get metadata from global defaults first (they have the display_name, description, unit)
    const { data: globalDefault } = await supabase
      .from("kpi_thresholds")
      .select("display_name, description, unit")
      .is("hotel_id", null)
      .eq("metric_key", metric_key)
      .maybeSingle()

    // Use global defaults for metadata - these should never be overwritten
    const metadata = globalDefault

    const { data, error } = await supabase
      .from("kpi_thresholds")
      .upsert(
        {
          hotel_id: hotel_id || null,
          metric_key,
          green_min,
          green_max: green_max || null,
          orange_min,
          red_min: red_min || 0,
          is_inverted: is_inverted || false,
          display_name: metadata?.display_name || metric_key,
          description: metadata?.description || "",
          unit: metadata?.unit || "",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "hotel_id,metric_key",
        }
      )
      .select()
      .single()

    if (error) {
      console.error("Error upserting KPI threshold:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error in KPI threshold POST:", error)
    return NextResponse.json({ error: "Failed to save KPI threshold" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")
  const metricKey = searchParams.get("metric_key")

  if (!hotelId || !metricKey) {
    return NextResponse.json({ error: "hotel_id and metric_key required" }, { status: 400 })
  }

  try {
    const { error } = await supabase
      .from("kpi_thresholds")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("metric_key", metricKey)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete KPI threshold" }, { status: 500 })
  }
}
