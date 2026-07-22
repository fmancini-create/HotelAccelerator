import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron-auth"
import { notifyExpiredAssignments } from "@/lib/sales/prospect-expiry-notifier"
import { isServiceUnavailableError, logSupabaseError, compactSupabaseErrorMessage } from "@/lib/supabase/error-utils"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CRON: scade le assegnazioni prospect oltre assignment_expires_at.
 *
 * Schedule consigliato: ogni ora `0 * * * *`.
 * Idempotente: una seconda esecuzione subito dopo trova 0 righe da scadere.
 *
 * Flusso:
 *  1. Chiama la funzione DB expire_stale_prospect_assignments() che fa
 *     UPDATE atomico + ritorna le righe scadute (con info agente, capo area).
 *  2. Invia email aggregate a venditore, capo area, super-admin tramite
 *     notifyExpiredAssignments(). Fire-and-forget.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const service = await createServiceRoleClient()
  console.log("[expire-prospect-assignments] starting")

  const { data, error } = await service.rpc("expire_stale_prospect_assignments")
  if (error) {
    // Outage gateway Supabase (522/HTML): logga compatto e rispondi 503
    // (transitorio, non colpa nostra) invece di 500. Vedi memoria
    // santaddeo-supabase-outage-failfast.
    logSupabaseError("expire-prospect-assignments RPC", error)
    const status = isServiceUnavailableError(error) ? 503 : 500
    return NextResponse.json(
      { error: compactSupabaseErrorMessage(error) },
      { status },
    )
  }

  const rows = (data ?? []) as Array<{
    prospect_id: string
    prospect_name: string
    agent_id: string
    agent_display_name: string | null
    agent_user_id: string | null
    agent_email: string | null
    parent_agent_id: string | null
    expires_at: string | null
  }>

  console.log(`[expire-prospect-assignments] ${rows.length} assignments expired`)

  if (rows.length > 0) {
    try {
      await notifyExpiredAssignments(rows)
    } catch (err) {
      console.error("[expire-prospect-assignments] notify error:", err)
    }
  }

  return NextResponse.json({
    success: true,
    expired_count: rows.length,
    prospects: rows.map((r) => ({ id: r.prospect_id, name: r.prospect_name })),
  })
}
