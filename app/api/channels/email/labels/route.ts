import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { gmailFetch } from "@/lib/gmail-client"

// Get Gmail labels for a channel
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const channelId = searchParams.get("channel_id")

  if (!channelId) {
    return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
  }

  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, propertyId, channelId))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

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

// La POST che stava qui scriveva su colonne inesistenti (`gmail_label_id`,
// `sync_enabled`) e non aveva chiamanti: cancellava le righe della casella e poi
// falliva l'inserimento, quindi l'unico effetto possibile era perdere dati.
// Le scelte di visibilita' si salvano dalla PATCH di `[id]/labels`.
