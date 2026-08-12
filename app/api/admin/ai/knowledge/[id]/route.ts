import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    // Chunks are removed automatically via ON DELETE CASCADE. Scope the delete
    // by property_id so one tenant can never remove another tenant's source.
    const { error } = await supabase
      .from("knowledge_sources")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
