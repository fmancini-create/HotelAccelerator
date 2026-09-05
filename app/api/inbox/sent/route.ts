import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAccessibleChannelIds, getChannelAccess } from "@/lib/channel-access"
import { handleServiceError } from "@/lib/errors"
import { buildPreview } from "@/lib/inbox/html-to-preview"
import {
  buildSentConversationAccessFilter,
  parseSentLimit,
  parseSentOffset,
} from "@/lib/inbox/sent-access"

const ALLOWED_CHANNELS = new Set([
  "email",
  "whatsapp",
  "telegram",
  "chat",
  "messenger",
  "instagram",
  "x",
  "linkedin",
])

function cleanSearch(raw: string | null): string {
  return (raw || "").replace(/[%_,()]/g, " ").trim().slice(0, 120)
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Unified Sent projection for the operational Inbox.
 *
 * This endpoint intentionally reads the outbound events already persisted by
 * HotelAccelerator (`messages.sender_type = agent`). It does NOT import a
 * provider's native SENT folder into `messages`: doing so would duplicate
 * replies and corrupt Inbox/KPI semantics. Native provider folders remain
 * available under "Cartelle email".
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    const supabase = access.supabase
    const { searchParams } = request.nextUrl

    const limit = parseSentLimit(searchParams.get("limit"))
    const offset = parseSentOffset(searchParams.get("offset"))
    const search = cleanSearch(searchParams.get("search"))
    const requestedChannel = (searchParams.get("channel") || "all").trim().toLowerCase()
    const channel = requestedChannel !== "all" && ALLOWED_CHANNELS.has(requestedChannel)
      ? requestedChannel
      : null

    let accessFilter: string | null = null
    if (!access.isAdmin) {
      if (!access.adminUserId) {
        return NextResponse.json({ items: [], count: 0, limit, offset, hasMore: false })
      }
      const ids = await getAccessibleChannelIds(supabase, propertyId, access.adminUserId)
      accessFilter = buildSentConversationAccessFilter(ids)
      if (!accessFilter) {
        return NextResponse.json({ items: [], count: 0, limit, offset, hasMore: false })
      }
    }

    let query = supabase
      .from("messages")
      .select(
        `
          id,
          conversation_id,
          content,
          content_type,
          sender_name,
          status,
          created_at,
          stored_at,
          metadata,
          conversation:conversations!inner(
            id,
            property_id,
            channel,
            subject,
            contact_name,
            contact_email,
            channel_id,
            messaging_channel_id,
            metadata,
            contact:contacts(id, name, email, phone, whatsapp_id, telegram_id)
          )
        `,
        { count: "exact" },
      )
      .eq("property_id", propertyId)
      .eq("sender_type", "agent")
      .eq("conversation.property_id", propertyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (channel) query = query.eq("conversation.channel", channel)
    if (search) query = query.ilike("content", `%${search}%`)
    if (accessFilter) query = query.or(accessFilter, { referencedTable: "conversation" })

    const { data, error, count } = await query
    if (error) throw error

    const items = (data || []).map((row: any) => {
      const conversation = firstRelation<any>(row.conversation)
      const contact = firstRelation<any>(conversation?.contact)
      const channelName = String(conversation?.channel || "chat")
      const recipientName = contact?.name || conversation?.contact_name || null
      const recipientDetail =
        channelName === "email"
          ? contact?.email || conversation?.contact_email || row.metadata?.sent_to || null
          : channelName === "whatsapp"
            ? contact?.whatsapp_id || contact?.phone || conversation?.metadata?.phone || null
            : channelName === "telegram"
              ? contact?.telegram_id || conversation?.metadata?.telegram_chat_id || conversation?.metadata?.chat_id || null
              : conversation?.contact_email || contact?.email || null

      return {
        id: row.id,
        conversationId: row.conversation_id,
        channel: channelName,
        subject: conversation?.subject || null,
        recipientName,
        recipientDetail,
        content: row.content || "",
        preview: buildPreview(row.content, conversation?.subject || null),
        contentType: row.content_type || "text",
        sentAt: row.stored_at || row.created_at,
        senderName: row.sender_name || null,
        status: row.status || null,
      }
    })

    const total = count ?? items.length
    return NextResponse.json({
      items,
      count: total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    })
  } catch (error) {
    return handleServiceError(error)
  }
}
