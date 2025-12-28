import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailLabelsWithCounts } from "@/lib/gmail-client"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ labels: [], systemLabels: [] }, { status: 401 })
    }

    // Get user's property
    const { data: propertyUser } = await supabase
      .from("property_users")
      .select("property_id")
      .eq("user_id", user.id)
      .single()

    if (!propertyUser) {
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    // Get email channel for property
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("id")
      .eq("property_id", propertyUser.property_id)
      .eq("provider", "gmail")
      .eq("is_active", true)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    const { labels, error } = await getGmailLabelsWithCounts(channel.id)

    if (error) {
      console.error("[Gmail] Error fetching labels:", error)
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    const systemLabels = labels
      .filter((label) => label.type === "system")
      .map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal || 0,
        messagesUnread: label.messagesUnread || 0,
        threadsTotal: label.threadsTotal || 0,
        threadsUnread: label.threadsUnread || 0,
      }))

    const userLabels = labels
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        color: label.color?.backgroundColor || null,
        messagesTotal: label.messagesTotal || 0,
        messagesUnread: label.messagesUnread || 0,
        threadsTotal: label.threadsTotal || 0,
        threadsUnread: label.threadsUnread || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      labels: userLabels,
      systemLabels,
    })
  } catch (error) {
    console.error("[Gmail] Labels error:", error)
    return NextResponse.json({ labels: [], systemLabels: [] })
  }
}
