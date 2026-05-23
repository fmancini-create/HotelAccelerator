import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("contact_segments")
      .select("*")
      .eq("property_id", propertyId)
      .order("name")

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error fetching segments:", error)
    return NextResponse.json({ error: "Failed to fetch segments" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("contact_segments")
      .insert({
        ...body,
        property_id: propertyId,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating segment:", error)
    return NextResponse.json({ error: "Failed to create segment" }, { status: 500 })
  }
}
