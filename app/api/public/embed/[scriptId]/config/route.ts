import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { EmbedScriptRepository } from "@/lib/platform-repositories"
import { EmbedScriptService } from "@/lib/platform-services"

export async function GET(request: NextRequest, { params }: { params: Promise<{ scriptId: string }> }) {
  try {
    const { scriptId } = await params
    const supabase = await createClient()

    const repository = new EmbedScriptRepository(supabase)
    const service = new EmbedScriptService(repository)

    const script = await service.getScriptById(scriptId)

    if (!script) {
      return NextResponse.json({ error: "Script non trovato" }, { status: 404 })
    }

    if (script.status !== "active") {
      return NextResponse.json({ error: "Script non attivo" }, { status: 403 })
    }

    await service.trackView(scriptId).catch(() => {})

    return NextResponse.json({
      config: script.config,
      propertyId: script.property_id,
    })
  } catch (error: any) {
    console.error("[ERROR]", error.message)
    return NextResponse.json({ error: "Errore nel caricamento della configurazione" }, { status: 500 })
  }
}
