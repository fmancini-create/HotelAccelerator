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

    let channelId: string | null = null

    // 1. Check if user is super_admin in admin_users
    const { data: adminUser } = await supabase.from("admin_users").select("role").eq("id", user.id).single()

    if (adminUser?.role === "super_admin") {
      // Super admin: access to first active Gmail channel
      const { data: channel } = await supabase
        .from("email_channels")
        .select("id")
        .eq("provider", "gmail")
        .eq("is_active", true)
        .limit(1)
        .single()

      channelId = channel?.id || null
    } else {
      // 2. Try user_channel_permissions
      const { data: channelPermission } = await supabase
        .from("user_channel_permissions")
        .select("channel_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      if (channelPermission) {
        channelId = channelPermission.channel_id
      } else {
        // 3. Try email_channel_assignments
        const { data: channelAssignment } = await supabase
          .from("email_channel_assignments")
          .select("channel_id")
          .eq("user_id", user.id)
          .limit(1)
          .single()

        channelId = channelAssignment?.channel_id || null
      }
    }

    if (!channelId) {
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    const { labels, error } = await getGmailLabelsWithCounts(channelId)

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
