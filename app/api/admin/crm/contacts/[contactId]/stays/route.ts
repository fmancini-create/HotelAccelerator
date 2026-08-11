import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("crm", request)
    const { contactId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("contact_stays")
      .select("*")
      .eq("contact_id", contactId)
      .eq("property_id", propertyId)
      .order("check_in", { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching stays:", error)
    return NextResponse.json({ error: "Failed to fetch stays" }, { status: 500 })
  }
}
