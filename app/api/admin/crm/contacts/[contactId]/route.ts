import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await params
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("property_id", property.id)
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching contact:", error)
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await params
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("contacts")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("property_id", property.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error updating contact:", error)
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}
