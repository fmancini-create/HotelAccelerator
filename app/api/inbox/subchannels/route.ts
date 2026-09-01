import { type NextRequest, NextResponse } from "next/server"

import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAccessibleChannelIds, getChannelAccess } from "@/lib/channel-access"

export const dynamic = "force-dynamic"

type ComposeChannel = "email" | "whatsapp" | "telegram" | "messenger" | "instagram"
type Subchannel = { id: string; channel: ComposeChannel; label: string; detail: string | null }

export async function GET(request: NextRequest) {
  const propertyId = await getAuthenticatedPropertyId(request)
  const access = await getChannelAccess(request)
  const sb = access.supabase

  let emailIds: string[] | null = null
  let messagingIds: string[] | null = null
  if (!access.isAdmin) {
    if (!access.adminUserId) return NextResponse.json({ subchannels: [] })
    const ids = await getAccessibleChannelIds(sb, propertyId, access.adminUserId)
    emailIds = ids.emailChannelIds
    messagingIds = ids.messagingChannelIds
  }

  let emailQuery = sb
    .from("email_channels")
    .select("id,email_address,display_name")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("email_address", { ascending: true })
  if (emailIds) emailQuery = emailQuery.in("id", emailIds.length ? emailIds : ["00000000-0000-0000-0000-000000000000"])

  let messagingQuery = sb
    .from("messaging_channels")
    .select("id,display_name,channel_type,config")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .in("channel_type", ["whatsapp", "telegram", "messenger", "instagram"])
    .order("display_name", { ascending: true })
  if (messagingIds) messagingQuery = messagingQuery.in("id", messagingIds.length ? messagingIds : ["00000000-0000-0000-0000-000000000000"])

  const [emails, messaging] = await Promise.all([emailQuery, messagingQuery])
  if (emails.error) throw emails.error
  if (messaging.error) throw messaging.error

  const subchannels: Subchannel[] = [
    ...(emails.data ?? []).map((row) => ({
      id: row.id,
      channel: "email" as const,
      label: row.email_address || row.display_name || "Email",
      detail: row.display_name && row.display_name !== row.email_address ? row.display_name : null,
    })),
    ...(messaging.data ?? []).map((row) => {
      const config = row.config as Record<string, unknown> | null
      const phone = typeof config?.display_phone_number === "string" ? config.display_phone_number : null
      const externalName = typeof config?.username === "string" ? config.username : null
      const channel = row.channel_type as Exclude<ComposeChannel, "email">
      const fallback = channel === "whatsapp" ? "WhatsApp" : channel === "telegram" ? "Telegram" : channel === "messenger" ? "Facebook Messenger" : "Instagram"
      return {
        id: row.id,
        channel,
        label: row.display_name || phone || externalName || fallback,
        detail: phone || externalName,
      }
    }),
  ]

  return NextResponse.json({ subchannels })
}
