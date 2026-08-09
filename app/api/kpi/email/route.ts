import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

export const dynamic = "force-dynamic"

/**
 * Honest email KPI snapshot.
 *
 * The legacy implementation counted raw imported messages and performed an
 * N+1 response-time query. Historical Gmail imports included already-read and
 * Sent mail as customer messages, producing values such as 18k urgent emails
 * and a 111-day average response time. Until Sent/reply history is modelled
 * reliably, expose only the mailbox-derived unread conversation count.
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const [{ data: gmailChannels, error: channelsError }, { count: unreadCount, error: unreadError }] =
      await Promise.all([
        supabase
          .from("email_channels")
          .select("id, gmail_state_reconciled_at")
          .eq("property_id", propertyId)
          .eq("provider", "gmail")
          .eq("is_active", true),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("channel", "email")
          .gt("unread_count", 0),
      ])

    if (channelsError || unreadError) {
      throw channelsError || unreadError
    }

    const reconciliationReady =
      (gmailChannels || []).length > 0 &&
      (gmailChannels || []).every((channel) => Boolean(channel.gmail_state_reconciled_at))

    return NextResponse.json({
      unread_count: reconciliationReady ? unreadCount || 0 : null,
      read_unreplied_count: null,
      overdue_count: null,
      avg_response_time_minutes: null,
      overdue_threshold_minutes: null,
      metrics_status: reconciliationReady ? "gmail_state_ready" : "reconciling",
    })
  } catch (error) {
    // Prima: ogni errore diventava 500 con messaggio generico, quindi una
    // sessione scaduta (getAuthenticatedPropertyId lancia "Non autenticato")
    // era indistinguibile da un guasto reale e il client non poteva reagire.
    // handleServiceError mappa gli errori di auth a 401/403 e logga in forma
    // breve, lasciando i 500 ai guasti veri.
    return handleServiceError(error)
  }
}
