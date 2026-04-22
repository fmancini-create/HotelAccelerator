import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

// Debug endpoint for Smart mode - shows sync status
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    // Get the active Gmail channel FOR THIS TENANT (multi-tenancy)
    const { data: channel } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, email_address, provider, gmail_history_id, last_sync_at, gmail_watch_expiration, push_enabled, is_active",
      )
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .eq("provider", "gmail")
      .maybeSingle()

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
      .select("id, subject, received_at, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get last 5 messages for timeline for this tenant
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, subject, sender_email, received_at, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5)

    const watchExpired = channel?.gmail_watch_expiration
      ? new Date(channel.gmail_watch_expiration) < new Date()
      : true

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      propertyId,
      channel: channel
        ? {
            id: channel.id,
            // Expose property_id so the client can trigger /api/channels/email/sync
            property_id: channel.property_id,
            email: channel.email_address,
            provider: channel.provider,
            historyId: channel.gmail_history_id,
            lastSyncAt: channel.last_sync_at,
            watchExpiration: channel.gmail_watch_expiration,
            watchActive: !watchExpired,
            pushEnabled: channel.push_enabled,
          }
        : null,
      database: {
        messagesCount,
        conversationsCount,
        lastMessageAt: lastMessage?.created_at || null,
        lastMessageSubject: lastMessage?.subject || null,
      },
      recentMessages:
        recentMessages?.map((m) => ({
          id: m.id,
          subject: m.subject?.substring(0, 40),
          from: m.sender_email,
          createdAt: m.created_at,
        })) || [],
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/webhook/gmail`,
    })
  } catch (error) {
    console.error("[Debug API] Error:", error)
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
