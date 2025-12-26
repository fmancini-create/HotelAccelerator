import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { EmbedScriptRepository } from "@/lib/platform-repositories"
import { EmbedScriptService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const supabase = await createClient()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    const scripts = await service.getScriptsByProperty(propertyId)

    return NextResponse.json({ scripts })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nel recupero degli script" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const supabase = await createClient()
    const body = await request.json()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    const script = await service.createScript(propertyId, body)

    return NextResponse.json({ script }, { status: 201 })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nella creazione dello script" }, { status: 500 })
  }
}
