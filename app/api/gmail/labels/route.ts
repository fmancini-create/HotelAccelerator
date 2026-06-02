import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailLabelsWithCounts } from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ labels: [], systemLabels: [] }, { status: 401 })
    }

    const requestedChannelId = request.nextUrl.searchParams.get("channelId")
    const { channelId, reason } = await resolveGmailChannelId(supabase, user.id, requestedChannelId)
    console.log(`[Gmail][labels] channel resolution: ${reason}, channelId=${channelId ?? "null"}`)

    if (!channelId) {
      return NextResponse.json(
        { labels: [], systemLabels: [], error: "Canale Gmail non configurato" },
        { status: 404 },
      )
    }

    // Which mailbox are we actually showing? Surface it so the UI can label the inbox.
    const { data: channelRow } = await supabase
      .from("email_channels")
      .select("email_address, display_name, name")
      .eq("id", channelId)
      .maybeSingle()
    const account = channelRow
      ? {
          email: channelRow.email_address || null,
          name: channelRow.display_name || channelRow.name || null,
        }
      : null

    const { labels, error } = await getGmailLabelsWithCounts(channelId)

    if (error) {
      console.error("[Gmail] Error fetching labels:", error)
      const isAuthError = /token|oauth|riconnett|unauthorized/i.test(error)
      return NextResponse.json(
        { labels: [], systemLabels: [], error },
        { status: isAuthError ? 401 : 500 },
      )
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
      account,
    })
  } catch (error) {
    console.error("[Gmail] Labels error:", error)
    return NextResponse.json({ labels: [], systemLabels: [] })
  }
}
