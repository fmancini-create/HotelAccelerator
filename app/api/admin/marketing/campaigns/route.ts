import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    let query = supabase
      .from("email_campaigns")
      .select(`
        *,
        contact_segments(name)
      `)
      .eq("property_id", property.id)
      .order("created_at", { ascending: false })

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data, error } = await query

    if (error) throw error

    // Transform to include segment_name
    const campaigns =
      data?.map((c) => ({
        ...c,
        segment_name: c.contact_segments?.name,
      })) || []

    return NextResponse.json(campaigns)
  } catch (error) {
    console.error("Error fetching campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({
        ...body,
        property_id: property.id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating campaign:", error)
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 })
  }
}
