import { type NextRequest, NextResponse, after } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { indexSource } from "@/lib/ai/ingest"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    // Verify ownership + reset to pending so the UI reflects the requeue.
    const { data: source } = await supabase
      .from("knowledge_sources")
      .select("id")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!source) return NextResponse.json({ error: "Fonte non trovata" }, { status: 404 })

    await supabase
      .from("knowledge_sources")
      .update({ status: "pending", error: null })
      .eq("id", id)
      .eq("property_id", propertyId)

    after(async () => {
      try {
        await indexSource(id, propertyId)
      } catch (err) {
        console.log(`[v0] reindex after() failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
