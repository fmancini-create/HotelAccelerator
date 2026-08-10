import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { EmbedScriptService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

    const scripts = await service.getScriptsByProperty(propertyId)

    return NextResponse.json({ scripts })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nel recupero degli script" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

    const service = new EmbedScriptService(supabase)

    const script = await service.createScript(propertyId, body)

    return NextResponse.json({ script }, { status: 201 })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nella creazione dello script" }, { status: 500 })
  }
}
