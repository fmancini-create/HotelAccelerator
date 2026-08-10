import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { EmbedScriptService } from "@/lib/platform-services"

export async function GET(request: NextRequest, { params }: { params: Promise<{ scriptId: string }> }) {
  try {
    const { scriptId } = await params
    // Endpoint PUBBLICO servito ai siti dei clienti (nessuna sessione):
    // `embed_scripts` è chiusa al ruolo `anon`, quindi serve il service client.
    // La rotta espone solo la configurazione dello script richiesto per id, e
    // solo se `status === "active"` (controllo qui sotto).
    const supabase = createServiceClient()

    const service = new EmbedScriptService(supabase)

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
