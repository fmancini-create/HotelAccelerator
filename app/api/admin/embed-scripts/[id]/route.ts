import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { EmbedScriptService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

    const script = await service.getScriptById(id)

    if (!script || script.property_id !== propertyId) {
      return NextResponse.json({ error: "Script non trovato" }, { status: 404 })
    }

    return NextResponse.json({ script })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nel recupero dello script" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = createServiceClient()
    const body = await request.json()

    const service = new EmbedScriptService(supabase)

    const script = await service.updateScript(id, propertyId, body)

    return NextResponse.json({ script })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'aggiornamento dello script" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

    await service.deleteScript(id, propertyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'eliminazione dello script" }, { status: 500 })
  }
}
