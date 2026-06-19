import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { ChannelAssignmentService, type ChannelType } from "@/lib/platform-services/channel-assignment.service"

const VALID_TYPES: ChannelType[] = ["email", "whatsapp", "telegram", "chat", "instagram", "facebook"]

/** Maps a channel type to the table that owns the channel record (for tenant ownership checks). */
const OWNER_TABLE: Record<ChannelType, string> = {
  email: "email_channels",
  whatsapp: "messaging_channels",
  telegram: "messaging_channels",
  instagram: "messaging_channels",
  facebook: "messaging_channels",
  chat: "embed_scripts",
}

function parseType(value: string | null): ChannelType | null {
  return value && (VALID_TYPES as string[]).includes(value) ? (value as ChannelType) : null
}

/** Verifies the channel belongs to the tenant before reading/writing assignments. */
async function assertChannelOwnership(
  supabase: ReturnType<typeof createServiceClient>,
  channelType: ChannelType,
  channelId: string,
  propertyId: string,
): Promise<boolean> {
  const table = OWNER_TABLE[channelType]
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", channelId)
    .eq("property_id", propertyId)
    .maybeSingle()
  return Boolean(data)
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)

    const channelType = parseType(searchParams.get("channel_type"))
    const channelId = searchParams.get("channel_id")
    if (!channelType || !channelId) {
      return NextResponse.json({ error: "channel_type e channel_id sono obbligatori" }, { status: 400 })
    }

    const owns = await assertChannelOwnership(supabase, channelType, channelId, propertyId)
    if (!owns) return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })

    const service = new ChannelAssignmentService(supabase)
    const userIds = await service.listUserIds(channelType, channelId)

    const { data: users } = await supabase
      .from("admin_users")
      .select("id, name, email")
      .eq("property_id", propertyId)
      .order("name", { ascending: true })

    return NextResponse.json({ userIds, users: users ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))

    const channelType = parseType(body?.channel_type ?? null)
    const channelId: string | undefined = body?.channel_id
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : []

    if (!channelType || !channelId) {
      return NextResponse.json({ error: "channel_type e channel_id sono obbligatori" }, { status: 400 })
    }

    const owns = await assertChannelOwnership(supabase, channelType, channelId, propertyId)
    if (!owns) return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })

    const service = new ChannelAssignmentService(supabase)
    await service.setAssignments(propertyId, channelType, channelId, userIds)

    return NextResponse.json({ success: true, userIds })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
