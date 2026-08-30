import { type NextRequest, NextResponse } from "next/server"

import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAccessibleChannelIds, getChannelAccess } from "@/lib/channel-access"

export const dynamic = "force-dynamic"

type Subchannel = { id: string; channel: "email" | "whatsapp" | "telegram"; label: string; detail: string | null }

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
  if (emailIds) {
    emailQuery = emailQuery.in("id", emailIds.length ? emailIds : ["00000000-0000-0000-0000-000000000000"])
  }

  let messagingQuery = sb
    .from("messaging_channels")
    .select("id,display_name,channel_type,config")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .in("channel_type", ["whatsapp", "telegram"])
    .order("display_name", { ascending: true })
  if (messagingIds) {
    messagingQuery = messagingQuery.in("id", messagingIds.length ? messagingIds : ["00000000-0000-0000-0000-000000000000"])
  }

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
      return {
        id: row.id,
        channel: row.channel_type === "telegram" ? ("telegram" as const) : ("whatsapp" as const),
        label: row.display_name || phone || (row.channel_type === "telegram" ? "Telegram" : "WhatsApp"),
        detail: phone,
      }
    }),
  ]

  return NextResponse.json({ subchannels })
}
