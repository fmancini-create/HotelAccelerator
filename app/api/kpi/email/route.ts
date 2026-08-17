import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"
import { evaluateKpiReadiness } from "@/lib/email/kpi-readiness"

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

    const { data: gmailChannels, error: channelsError } = await supabase
      .from("email_channels")
      .select("id, gmail_state_reconciled_at, oauth_reconnect_required")
      .eq("property_id", propertyId)
      .eq("provider", "gmail")
      .eq("is_active", true)

    if (channelsError) {
      throw channelsError
    }

    // Mailboxes whose Gmail grant is revoked can no longer sync, so their unread
    // counts are frozen/phantom. Excluding them keeps "Non lette" honest until
    // the operator reconnects the account.
    const revokedChannelIds = (gmailChannels || [])
      .filter((c) => c.oauth_reconnect_required === true)
      .map((c) => c.id)

    let unreadQuery = supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("channel", "email")
      .gt("unread_count", 0)

    if (revokedChannelIds.length > 0) {
      unreadQuery = unreadQuery.not("channel_id", "in", `(${revokedChannelIds.join(",")})`)
    }

    const { count: unreadCount, error: unreadError } = await unreadQuery

    if (unreadError) {
      throw unreadError
    }

    // La prontezza guarda l'ETA' del segnalibro, non solo la sua esistenza: con
    // `Boolean(...)` bastava una riconciliazione riuscita una volta sola, anche
    // mesi prima, per continuare a pubblicare il numero come se fosse allineato.
    // Le caselle con autorizzazione revocata restano escluse, come prima.
    const readiness = evaluateKpiReadiness(gmailChannels || [])

    return NextResponse.json({
      unread_count: readiness.ready ? unreadCount || 0 : null,
      read_unreplied_count: null,
      overdue_count: null,
      avg_response_time_minutes: null,
      overdue_threshold_minutes: null,
      metrics_status: readiness.status,
      // Esposti perche' "non pronto" da solo non dice se la prima passata e' in
      // corso o se la riparazione e' ferma: senza questi il ritardo resta muto.
      reconcile_never: readiness.neverReconciled,
      reconcile_stale: readiness.staleReconciled,
      reconcile_age_minutes: readiness.oldestReconcileAgeMinutes,
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
