import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

function messageSubject(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const subject = (metadata as Record<string, unknown>).subject
  return typeof subject === "string" && subject.trim() ? subject : null
}

// Debug endpoint for Smart mode - shows sync status
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    // Tutti i canali Gmail attivi del tenant. `maybeSingle()` qui rendeva nullo
    // il risultato appena un'azienda collegava la seconda casella: la pagina
    // Inbox non sapeva piu' quale canale sincronizzare e lo storico non partiva.
    const { data: channels, error: channelsError } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, email_address, provider, gmail_history_id, last_sync_at, gmail_watch_expiration, push_enabled, is_active, full_sync_status",
      )
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .eq("provider", "gmail")
      .order("created_at", { ascending: true })

    if (channelsError) {
      console.error("[v0][inbox-debug] Gmail channels read failed:", channelsError.message)
      return NextResponse.json({ error: "Impossibile leggere le caselle Gmail" }, { status: 503 })
    }

    // Get messages count for this tenant
    const { count: messagesCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)

    // Get conversations count for this tenant
    const { count: conversationsCount } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)

    // Get last message received for this tenant
    const { data: lastMessage } = await supabase
      .from("messages")
      .select("id, metadata, received_at, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get last 5 messages for timeline for this tenant
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, metadata, sender_email, received_at, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5)

    const serializeChannel = (channel: NonNullable<typeof channels>[number]) => {
      const watchExpired = channel.gmail_watch_expiration
        ? new Date(channel.gmail_watch_expiration) < new Date()
        : true
      return {
        id: channel.id,
        property_id: channel.property_id,
        email: channel.email_address,
        provider: channel.provider,
        historyId: channel.gmail_history_id,
        lastSyncAt: channel.last_sync_at,
        watchExpiration: channel.gmail_watch_expiration,
        watchActive: !watchExpired,
        pushEnabled: channel.push_enabled,
        fullSyncStatus: channel.full_sync_status,
      }
    }

    const serializedChannels = (channels || []).map(serializeChannel)

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      propertyId,
      // `channel` resta per compatibilita' con il pannello diagnostico; le
      // operazioni multi-casella devono usare sempre `channels`.
      channel: serializedChannels[0] || null,
      channels: serializedChannels,
      database: {
        messagesCount,
        conversationsCount,
        lastMessageAt: lastMessage?.created_at || null,
        lastMessageSubject: messageSubject(lastMessage?.metadata),
      },
      recentMessages:
        recentMessages?.map((m) => ({
          id: m.id,
          subject: messageSubject(m.metadata)?.substring(0, 40) || null,
          from: m.sender_email,
          createdAt: m.created_at,
        })) || [],
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/webhook/gmail`,
    })
  } catch (error) {
    // Anche qui handleServiceError separa gia' auth attesa e guasto vero.
    return handleServiceError(error)
  }
}
