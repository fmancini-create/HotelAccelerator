import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getGmailLabelsWithCounts } from "@/lib/gmail-client"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()

    // Get default email channel for property
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("id")
      .eq("property_id", propertyId)
      .eq("is_default", true)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    const { labels, error } = await getGmailLabelsWithCounts(channel.id)

    if (error) {
      console.error("[v0] Error fetching Gmail labels:", error)
      return NextResponse.json({ labels: [], systemLabels: [] })
    }

    // Separate system and user labels
    const systemLabels = labels
      .filter((label) => label.type === "system")
      .map((label) => ({
        id: label.id,
        name: label.name,
        messagesUnread: label.messagesUnread || 0,
        threadsUnread: label.threadsUnread || 0,
      }))

    const userLabels = labels
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color?.backgroundColor || null,
        messagesUnread: label.messagesUnread || 0,
        threadsUnread: label.threadsUnread || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      labels: userLabels,
      systemLabels,
    })
  } catch (error) {
    console.error("[v0] Gmail labels error:", error)
    return NextResponse.json({ labels: [], systemLabels: [] })
  }
}
