import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { EmbedScriptRepository } from "@/lib/platform-repositories"
import { EmbedScriptService } from "@/lib/platform-services"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = await createClient()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    const script = await service.getScriptById(id)

    if (!script) {
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
    await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = await createClient()
    const body = await request.json()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    const script = await service.updateScript(id, body)

    return NextResponse.json({ script })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'aggiornamento dello script" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await getAuthenticatedPropertyId()
    const { id } = params
    const supabase = await createClient()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    await service.deleteScript(id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: error.message || "Errore nell'eliminazione dello script" }, { status: 500 })
  }
}
