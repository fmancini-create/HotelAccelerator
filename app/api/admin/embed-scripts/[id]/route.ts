import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { EmbedScriptService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { id } = await params
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

    const script = await service.getScriptById(id)

    if (!script || script.property_id !== propertyId) {
      return NextResponse.json({ error: "Script non trovato" }, { status: 404 })
    }

    return NextResponse.json({ script })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nel recupero dello script" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { id } = await params
    const supabase = createServiceClient()
    const body = await request.json()

    const service = new EmbedScriptService(supabase)

    const script = await service.updateScript(id, propertyId, body)

    return NextResponse.json({ script })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'aggiornamento dello script" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { id } = await params
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

    await service.deleteScript(id, propertyId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'eliminazione dello script" }, { status: 500 })
  }
}
