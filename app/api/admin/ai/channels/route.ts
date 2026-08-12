import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { setChannelBases } from "@/lib/ai/knowledge-bases"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET -> every messaging channel for the property with the ordered list of
 * knowledge base ids linked to it (first = primary).
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("messaging_channels")
      .select("id, channel_type, display_name, is_active")
      .eq("property_id", propertyId)
      .order("channel_type", { ascending: true })
    if (error) throw new Error(error.message)

    type ChannelRecord = { id: string; channel_type: string; display_name: string | null; is_active: boolean }
    const channels = (data ?? []) as ChannelRecord[]
    const channelIds = channels.map((c) => c.id)
    const linksByChannel = new Map<string, { knowledge_base_id: string; position: number }[]>()
    if (channelIds.length > 0) {
      const { data: links } = await supabase
        .from("channel_knowledge_bases")
        .select("channel_id, knowledge_base_id, position")
        .in("channel_id", channelIds)
      for (const l of (links ?? []) as { channel_id: string; knowledge_base_id: string; position: number }[]) {
        const arr = linksByChannel.get(l.channel_id) ?? []
        arr.push({ knowledge_base_id: l.knowledge_base_id, position: l.position })
        linksByChannel.set(l.channel_id, arr)
      }
    }

    const result = (channels ?? []).map((c) => ({
      id: c.id,
      channel_type: c.channel_type,
      display_name: c.display_name,
      is_active: c.is_active,
      baseIds: (linksByChannel.get(c.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((l) => l.knowledge_base_id),
    }))

    return NextResponse.json({ channels: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PUT { channelId, baseIds } -> replace the ordered bases linked to a channel.
 */
export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()
    const channelId = typeof body.channelId === "string" ? body.channelId : ""
    const baseIds: string[] = Array.isArray(body.baseIds) ? body.baseIds.filter((x: unknown) => typeof x === "string") : []

    if (!UUID.test(channelId)) {
      return NextResponse.json({ error: "channelId non valido" }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify the channel belongs to this tenant.
    const { data: channel } = await supabase
      .from("messaging_channels")
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

    await setChannelBases(channelId, baseIds)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
