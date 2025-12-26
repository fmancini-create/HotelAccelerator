import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()

    const { signature } = body

    // Verify user belongs to this property
    const { data: user, error: checkError } = await supabase
      .from("admin_users")
      .select("id, property_id")
      .eq("id", userId)
      .eq("property_id", propertyId)
      .single()

    if (checkError || !user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
    }

    // Update signature
    const { error } = await supabase
      .from("admin_users")
      .update({
        signature,
        signature_html: signature.replace(/\n/g, "<br>"),
      })
      .eq("id", userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
