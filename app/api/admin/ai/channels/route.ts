import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import {
  getKnowledgeChannels,
  setChannelBases,
  type KnowledgeChannelSource,
} from "@/lib/ai/knowledge-bases"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET -> every email and messaging channel for the property with the ordered
 * list of knowledge base ids linked to it (first = primary).
 */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const channels = await getKnowledgeChannels(propertyId)
    return NextResponse.json({ channels })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = accessErrorStatus(error)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PUT { channelId, channelSource, baseIds } -> replace the ordered bases linked
 * to an email or messaging channel.
 */
export async function PUT(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const body = await request.json()
    const channelId = typeof body.channelId === "string" ? body.channelId : ""
    const channelSource: KnowledgeChannelSource = body.channelSource === "email" ? "email" : "messaging"
    const baseIds: string[] = Array.isArray(body.baseIds) ? body.baseIds.filter((x: unknown) => typeof x === "string") : []

    if (!UUID.test(channelId)) {
      return NextResponse.json({ error: "channelId non valido" }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verifica il possesso sul tipo di canale dichiarato. Non si accetta un
    // property_id dal client e non si prova una tabella dopo l'altra.
    const channelTable = channelSource === "email" ? "email_channels" : "messaging_channels"
    const { data: channel } = await supabase
      .from(channelTable)
      .select("id")
      .eq("id", channelId)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (!channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    // Verify every base belongs to this tenant.
    if (baseIds.length > 0) {
      const { data: bases } = await supabase
        .from("knowledge_bases")
        .select("id")
        .eq("property_id", propertyId)
        .in("id", baseIds)
      const validIds = new Set(((bases ?? []) as { id: string }[]).map((b) => b.id))
      const allValid = baseIds.every((id) => validIds.has(id))
      if (!allValid) {
        return NextResponse.json({ error: "Una o più basi non sono valide" }, { status: 400 })
      }
    }

    await setChannelBases(channelId, baseIds, propertyId, channelSource)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = accessErrorStatus(error)
    return NextResponse.json({ error: message }, { status })
  }
}
