import { randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"
import { encryptForWrite, loadActiveTelephonyRow, loadTelephonyRow, maskSecret, type TelephonyRow } from "@/lib/telephony/config"
import { validateTelephonyBaseUrl, ensureTelephonyHostIsPublic } from "@/lib/telephony/provider-url"
import { testConnection } from "@/lib/telephony/threecx-client"

function serialize(row: TelephonyRow | null) {
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    base_url: row.base_url ?? "",
    client_id: row.client_id ?? "",
    default_extension: row.default_extension ?? "",
    credentials_preview: { client_secret: maskSecret(decryptSecretIfNeeded(row.client_secret_encrypted)) },
    has_credentials: {
      client_secret: Boolean(row.client_secret_encrypted),
      inbound_secret: Boolean(row.inbound_secret_encrypted),
      voice_inbound_secret: Boolean(row.voice_inbound_secret_encrypted),
    },
    is_active: row.is_active,
    last_check_at: row.last_check_at,
    last_check_status: row.last_check_status,
    last_check_error: row.last_check_error,
    updated_at: row.updated_at,
  }
}

/** Compatibilita per la pagina avanzata 3CX. La scelta provider vive nel nuovo hub. */
export async function GET(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const row = await loadTelephonyRow(identity.propertyId, "3cx")
    return NextResponse.json({ integration: serialize(row) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const propertyId = identity.propertyId
    const active = await loadActiveTelephonyRow(propertyId)
    if (active && active.provider !== "3cx") {
      return NextResponse.json({ error: `Il centralino attivo e ${active.provider}. Se vuoi passare a 3CX, selezionalo prima dalla pagina Centralino telefonico.` }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    const baseCheck = validateTelephonyBaseUrl(typeof body?.base_url === "string" ? body.base_url : "")
    if (!baseCheck.ok) return NextResponse.json({ error: baseCheck.error }, { status: 400 })
    const publicHost = await ensureTelephonyHostIsPublic(baseCheck.url)
    if (!publicHost.ok) return NextResponse.json({ error: publicHost.error }, { status: 400 })

    const clientId = typeof body?.client_id === "string" ? body.client_id.trim() : ""
    const clientSecretRaw = typeof body?.client_secret === "string" ? body.client_secret.trim() : ""
    const defaultExtension = typeof body?.default_extension === "string" ? body.default_extension.trim() : ""
    if (!clientId) return NextResponse.json({ error: "Client ID obbligatorio." }, { status: 400 })

    const existing = await loadTelephonyRow(propertyId, "3cx")
    const effectiveSecret = clientSecretRaw || decryptSecretIfNeeded(existing?.client_secret_encrypted ?? null) || ""
    if (!effectiveSecret) return NextResponse.json({ error: "Client Secret obbligatorio." }, { status: 400 })

    const check = await testConnection({ baseUrl: baseCheck.url, clientId, clientSecret: effectiveSecret })
    if (!check.ok) {
      // Non sovrascrivere una configurazione 3CX gia operativa con credenziali
      // che falliscono il test. L'utente puo correggere i campi e riprovare.
      return NextResponse.json({ integration: serialize(existing), verified: false, error: check.error }, { status: 422 })
    }

    const inboundSecret = decryptSecretIfNeeded(existing?.inbound_secret_encrypted ?? null) || randomBytes(24).toString("base64url")
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("upsert_active_telephony_integration", {
      p_property_id: propertyId,
      p_provider: "3cx",
      p_base_url: baseCheck.url,
      p_client_id: clientId,
      p_client_secret_encrypted: encryptForWrite(effectiveSecret),
      p_default_extension: defaultExtension || null,
      p_inbound_secret_encrypted: encryptForWrite(inboundSecret),
      p_provider_config: existing?.provider_config ?? {},
      p_last_check_status: "ok",
      p_last_check_error: null,
      p_last_check_at: new Date().toISOString(),
      p_actor_email: identity.email,
    }).single()
    if (error) throw error

    return NextResponse.json({ integration: serialize(data as TelephonyRow), verified: true, extensions: check.extensions })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const { error } = await supabase.from("telephony_integrations").delete().eq("property_id", identity.propertyId).eq("provider", "3cx")
    if (error) throw error
    await supabase.from("telephony_integration_audit").insert({ property_id: identity.propertyId, provider: "3cx", action: "deleted", actor_email: identity.email, details: { source: "3cx_advanced" } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}
