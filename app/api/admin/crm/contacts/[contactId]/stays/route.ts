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
      .from("contact_stays")
      .select("*")
      .eq("contact_id", contactId)
      .eq("property_id", property.id)
      .order("check_in", { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error fetching stays:", error)
    return NextResponse.json({ error: "Failed to fetch stays" }, { status: 500 })
  }
}
