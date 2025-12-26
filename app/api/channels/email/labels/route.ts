import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Get Gmail labels for a channel
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const channelId = searchParams.get("channel_id")

  if (!channelId) {
    return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Get channel with OAuth token
    const { data: channel, error } = await supabase.from("email_channels").select("*").eq("id", channelId).single()

    if (error || !channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    if (channel.provider !== "gmail" || !channel.oauth_access_token) {
      return NextResponse.json({ error: "Canale non configurato con Gmail OAuth" }, { status: 400 })
    }

    // Fetch labels from Gmail API
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ error: "Token scaduto. Riconnetti l'account." }, { status: 401 })
      }
      return NextResponse.json({ error: "Errore recupero etichette" }, { status: 500 })
    }

    const data = await response.json()

    // Fetch details for each label to get message counts
    const labelsWithDetails = await Promise.all(
      (data.labels || []).map(async (label: any) => {
        try {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${label.id}`, {
            headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
          })
          if (detailRes.ok) {
            const detail = await detailRes.json()
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
