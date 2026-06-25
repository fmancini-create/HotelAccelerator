import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import {
  runWhatsAppCredentialsBackfill,
  WhatsAppBackfillError,
} from "@/lib/whatsapp/backfill-credentials"

/**
 * Endpoint admin one-off per il backfill della cifratura dei segreti WhatsApp
 * in `messaging_channels.credentials` (access_token, app_secret, verify_token).
 *
 * - Riservato ai SOLI super_admin (operazione su segreti cross-tenant).
 * - GET  = DRY-RUN (sola lettura, nessuna scrittura).
 * - POST con body { "confirm": true } = scrittura reale.
 * Gira in Production dove ENCRYPTION_KEY è presente.
 */

export const dynamic = "force-dynamic"

async function requireSuperAdmin(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity) {
    return { error: NextResponse.json({ ok: false, error: "Non autenticato" }, { status: 401 }) }
  }
  if (!identity.isSuperAdmin) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Accesso negato: richiesti privilegi super_admin" },
        { status: 403 },
      ),
    }
  }
  return { identity }
}

function handleError(err: unknown) {
  if (err instanceof WhatsAppBackfillError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 422 })
  }
  const message = err instanceof Error ? err.message : "Errore sconosciuto"
  return NextResponse.json({ ok: false, error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdmin(request)
  if (gate.error) return gate.error
  try {
    const result = await runWhatsAppCredentialsBackfill(createServiceClient(), { confirm: false })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin(request)
  if (gate.error) return gate.error

  let confirm = false
  try {
    const body = await request.json()
    confirm = body?.confirm === true
  } catch {
    confirm = false
  }

  if (!confirm) {
    return NextResponse.json(
      { ok: false, error: 'Per scrivere davvero invia { "confirm": true } nel body.' },
      { status: 400 },
    )
  }

  try {
    const result = await runWhatsAppCredentialsBackfill(createServiceClient(), { confirm: true })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return handleError(err)
  }
}
