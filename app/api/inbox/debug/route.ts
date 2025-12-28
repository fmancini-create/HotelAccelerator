import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Debug endpoint for Smart mode - shows sync status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get email channel status
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id, email_address, gmail_history_id, last_sync_at, gmail_watch_expiration, push_enabled, is_active")
      .eq("is_active", true)
      .eq("provider", "gmail")
      .single()

    // Get messages count
    const { count: messagesCount } = await supabase.from("messages").select("*", { count: "exact", head: true })

    // Get conversations count
    const { count: conversationsCount } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })

    // Get last message received
    const { data: lastMessage } = await supabase
      .from("messages")
      .select("id, subject, received_at, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    // Get last 5 messages for timeline
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("id, subject, sender_email, received_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5)

    const watchExpired = channel?.gmail_watch_expiration ? new Date(channel.gmail_watch_expiration) < new Date() : true

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      channel: channel
        ? {
            id: channel.id,
            email: channel.email_address,
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
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
