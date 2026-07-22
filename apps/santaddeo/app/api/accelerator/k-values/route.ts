import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { calculateAllKVariables } from "@/lib/pricing/k-variables-service"

// GET: Retrieve K values for a hotel and date range
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotel_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    let query = supabase
      .from("k_variable_values")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("date", { ascending: true })
      .order("variable_key", { ascending: true })

    if (startDate) {
      query = query.gte("date", startDate)
    }
    if (endDate) {
      query = query.lte("date", endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] k-values GET error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ values: data || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] k-values GET error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Calculate and store K values for a hotel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, start_date, end_date } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // Default to next 30 days if not specified
    const start = start_date || new Date().toISOString().split("T")[0]
    const end = end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    console.log("[v0] k-values POST - calculating for hotel:", hotel_id, "from:", start, "to:", end)

    const supabase = await createClient()

    // Get hotel info for weather (need coordinates)
    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, name, latitude, longitude")
      .eq("id", hotel_id)
      .single()

    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    // Generate date range
    const dates: string[] = []
    const startD = new Date(start)
    const endD = new Date(end)
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0])
    }

    // Calculate K values for each date
    const results: Array<{
      date: string
      variables: Record<string, number>
      totalK: number
    }> = []

    for (const date of dates) {
      const kValues = await calculateAllKVariables(supabase, hotel_id, date)
      
      // Store each variable value
      for (const [variableKey, value] of Object.entries(kValues.variables)) {
        await supabase
          .from("k_variable_values")
          .upsert({
            hotel_id,
            date,
            variable_key: variableKey,
            calculated_value: value,
            updated_at: new Date().toISOString()
          }, { onConflict: "hotel_id,date,variable_key" })
      }

      results.push({
        date,
        variables: kValues.variables,
        totalK: kValues.totalK
      })
    }

    console.log("[v0] k-values POST - calculated", results.length, "days of K values")

    return NextResponse.json({ 
      success: true, 
      dates_calculated: results.length,
      sample: results.slice(0, 3)
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] k-values POST error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH: Manual override for a specific K value
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, date, variable_key, manual_override } = body

    if (!hotel_id || !date || !variable_key) {
      return NextResponse.json({ error: "hotel_id, date, and variable_key required" }, { status: 400 })
    }

    if (manual_override !== null && (manual_override < 0 || manual_override > 10)) {
      return NextResponse.json({ error: "manual_override must be 0-10 or null" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("k_variable_values")
      .upsert({
        hotel_id,
        date,
        variable_key,
        calculated_value: manual_override ?? 5, // Default if no calculated value
        manual_override,
        updated_at: new Date().toISOString()
      }, { onConflict: "hotel_id,date,variable_key" })
      .select()
      .single()

    if (error) {
      console.error("[v0] k-values PATCH error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, value: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] k-values PATCH error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
