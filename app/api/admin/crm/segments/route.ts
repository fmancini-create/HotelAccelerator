import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET() {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("contact_segments")
      .select("*")
      .eq("property_id", property.id)
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
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("contact_segments")
      .insert({
        ...body,
        property_id: property.id,
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
