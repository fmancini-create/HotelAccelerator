import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity, accessErrorStatus } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { runRefreshTokenBackfill, BackfillError } from "@/lib/email/backfill-refresh-tokens"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Endpoint admin per il backfill di `email_channels.oauth_refresh_token`.
 *
 * - SOLO super_admin (operazione su segreti cross-tenant).
 * - GET  -> DRY-RUN: nessuna scrittura, mostra candidati/conteggi.
 * - POST -> esegue il backfill SOLO se body { "confirm": true }.
 *           Senza confirm, anche il POST resta in dry-run.
 *
 * Gira in Production (dove ENCRYPTION_KEY esiste). Mai espone token/chiavi.
 */

async function requireSuperAdmin(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  }
  if (!identity.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Accesso negato: riservato ai super admin" }, { status: 403 }) }
  }
  return { identity }
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  try {
    const supabase = createServiceClient()
    const result = await runRefreshTokenBackfill(supabase, { confirm: false })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const status = err instanceof BackfillError ? 422 : accessErrorStatus(err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request)
  if (auth.error) return auth.error

  let confirm = false
  try {
    const body = await request.json().catch(() => ({}))
    confirm = body?.confirm === true
  } catch {
    confirm = false
  }

  try {
    const supabase = createServiceClient()
    const result = await runRefreshTokenBackfill(supabase, { confirm })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const status = err instanceof BackfillError ? 422 : accessErrorStatus(err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}
