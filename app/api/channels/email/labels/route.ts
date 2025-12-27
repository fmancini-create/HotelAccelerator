import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { gmailFetch } from "@/lib/gmail-client"

// Get Gmail labels for a channel
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const channelId = searchParams.get("channel_id")

  if (!channelId) {
    return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
  }

  try {
    const { data, error, status } = await gmailFetch(channelId, "labels")

    if (error) {
      return NextResponse.json({ error }, { status })
    }

    // Fetch details for each label to get message counts
    const labelsWithDetails = await Promise.all(
      (data.labels || []).map(async (label: any) => {
        try {
          const { data: detail } = await gmailFetch(channelId, `labels/${label.id}`)
          if (detail) {
            return {
              id: label.id,
              name: label.name,
              type: label.type,
              messagesTotal: detail.messagesTotal || 0,
              messagesUnread: detail.messagesUnread || 0,
              color: detail.color,
            }
          }
        } catch {
          // Ignore errors for individual labels
        }
        return {
          id: label.id,
          name: label.name,
          type: label.type,
          messagesTotal: 0,
          messagesUnread: 0,
        }
      }),
    )

    return NextResponse.json({ labels: labelsWithDetails })
  } catch (error) {
    console.error("Error fetching labels:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// Sync label settings
export async function POST(request: NextRequest) {
  try {
    const { channel_id, property_id, labels } = await request.json()

    if (!channel_id || !property_id || !labels) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    const supabase = await createClient()

    // Delete existing label settings
    await supabase.from("email_labels").delete().eq("channel_id", channel_id).eq("property_id", property_id)

    // Insert new label settings
    const labelRecords = labels.map((label: { id: string; name: string; sync_enabled: boolean }) => ({
      property_id,
      channel_id,
      gmail_label_id: label.id,
      name: label.name,
      sync_enabled: label.sync_enabled,
    }))

    if (labelRecords.length > 0) {
      const { error } = await supabase.from("email_labels").insert(labelRecords)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving labels:", error)
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 })
  }
}
