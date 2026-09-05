import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { invalidateDynamicSegments } from "@/lib/crm/segment-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    await requireAreaApi("crm", request)
    const { contactId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("property_id", propertyId)
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching contact:", error)
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  try {
    await requireAreaApi("crm", request)
    const { contactId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("contacts")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId)
      .eq("property_id", propertyId)
      .select()
      .single()

    if (error) throw error
    await invalidateDynamicSegments(supabase, propertyId)

    return NextResponse.json(data)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error updating contact:", error)
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}
