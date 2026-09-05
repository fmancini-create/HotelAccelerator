import { randomBytes } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"
import { encryptForWrite, loadTelephonyRow, loadTelephonyRows, maskSecret, type TelephonyRow } from "@/lib/telephony/config"
import { getTelephonyProvider, isTelephonyProviderId, providerConfigKeys, TELEPHONY_PROVIDERS } from "@/lib/telephony/providers"
import { validateTelephonyBaseUrl } from "@/lib/telephony/provider-url"
import { verifyTelephonyConnection, type ProviderRuntimeConfig } from "@/lib/telephony/adapters"

function serialize(row: TelephonyRow) {
  return {
    id: row.id,
    provider: row.provider,
    base_url: row.base_url ?? "",
    client_id: row.client_id ?? "",
    default_extension: row.default_extension ?? "",
    provider_config: row.provider_config ?? {},
    credentials_preview: { client_secret: maskSecret(decryptSecretIfNeeded(row.client_secret_encrypted)) },
    has_client_secret: Boolean(row.client_secret_encrypted),
    is_active: row.is_active,
    last_check_at: row.last_check_at,
    last_check_status: row.last_check_status,
    last_check_error: row.last_check_error,
    updated_at: row.updated_at,
  }
}

function cleanString(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function GET(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const rows = await loadTelephonyRows(identity.propertyId)
    return NextResponse.json({
      providers: TELEPHONY_PROVIDERS,
      integrations: rows.map(serialize),
      active_integration: rows.find((row) => row.is_active) ? serialize(rows.find((row) => row.is_active)!) : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null)
    if (!isTelephonyProviderId(body?.provider)) {
      return NextResponse.json({ error: "Centralino non riconosciuto." }, { status: 400 })
    }
    const provider = getTelephonyProvider(body.provider)
    if (!provider) return NextResponse.json({ error: "Centralino non riconosciuto." }, { status: 400 })

    const existing = await loadTelephonyRow(identity.propertyId, provider.id)
    const rawBaseUrl = cleanString(body?.base_url, 1000)
    const clientId = cleanString(body?.client_id, 300)
    const incomingSecret = cleanString(body?.client_secret, 2000)
    const existingSecret = decryptSecretIfNeeded(existing?.client_secret_encrypted ?? null) || ""
    const effectiveSecret = incomingSecret || existingSecret
    const defaultExtension = cleanString(body?.default_extension, 80)

    let baseUrl = ""
    if (rawBaseUrl) {
      const checked = validateTelephonyBaseUrl(rawBaseUrl)
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
      baseUrl = checked.url
    }

    const configKeys = new Set(providerConfigKeys(provider))
    const providerConfig: Record<string, string> = {}
    const rawProviderConfig = body?.provider_config && typeof body.provider_config === "object" ? body.provider_config : {}
    for (const key of configKeys) {
      const field = provider.fields.find((candidate) => candidate.storage === `provider_config.${key}`)
      const supplied = cleanString((rawProviderConfig as Record<string, unknown>)[key], 300)
      providerConfig[key] = supplied || field?.defaultValue || ""
    }

    for (const field of provider.fields) {
      if (!field.required) continue
      if (field.storage === "base_url" && !baseUrl) return NextResponse.json({ error: `${field.label}: campo obbligatorio.` }, { status: 400 })
      if (field.storage === "client_id" && !clientId) return NextResponse.json({ error: `${field.label}: campo obbligatorio.` }, { status: 400 })
      if (field.storage === "client_secret" && !effectiveSecret) return NextResponse.json({ error: `${field.label}: campo obbligatorio.` }, { status: 400 })
      if (field.storage === "default_extension" && !defaultExtension) return NextResponse.json({ error: `${field.label}: campo obbligatorio.` }, { status: 400 })
      if (field.storage.startsWith("provider_config.")) {
        const key = field.storage.slice("provider_config.".length)
        if (!providerConfig[key]) return NextResponse.json({ error: `${field.label}: campo obbligatorio.` }, { status: 400 })
      }
    }

    let checkStatus: "ok" | "error" | "guided" | "bridge_required" = provider.connectionMode === "guided" ? "guided" : provider.connectionMode === "bridge" ? "bridge_required" : "error"
    let checkError: string | null = null
    let verified = false

    if (provider.connectionMode === "api") {
      const runtime: ProviderRuntimeConfig = { baseUrl, clientId, clientSecret: effectiveSecret, defaultExtension, providerConfig }
      const check = await verifyTelephonyConnection(provider.id, runtime)
      verified = check.ok
      checkStatus = check.ok ? "ok" : "error"
      checkError = check.ok ? null : check.error
    }

    // Il segreto di ingresso CRM viene mantenuto per 3CX, per non rompere i
    // template gia installati. Per una nuova configurazione 3CX lo generiamo.
    const inboundSecret = provider.id === "3cx"
      ? (decryptSecretIfNeeded(existing?.inbound_secret_encrypted ?? null) || randomBytes(24).toString("base64url"))
      : null

    const supabase = createServiceClient()
    const now = new Date().toISOString()
    const { data, error } = await supabase.rpc("upsert_active_telephony_integration", {
      p_property_id: identity.propertyId,
      p_provider: provider.id,
      p_base_url: baseUrl || null,
      p_client_id: clientId || null,
      p_client_secret_encrypted: effectiveSecret ? encryptForWrite(effectiveSecret) : null,
      p_default_extension: defaultExtension || null,
      p_inbound_secret_encrypted: inboundSecret ? encryptForWrite(inboundSecret) : null,
      p_provider_config: providerConfig,
      p_last_check_status: checkStatus,
      p_last_check_error: checkError,
      p_last_check_at: provider.connectionMode === "api" ? now : null,
      p_actor_email: identity.email,
    }).single()
    if (error) throw error

    return NextResponse.json({
      integration: serialize(data as TelephonyRow),
      verified,
      mode: provider.connectionMode,
      message: verified
        ? `${provider.name} collegato e verificato.`
        : provider.connectionMode === "api"
          ? `Configurazione salvata, ma la verifica non e riuscita: ${checkError}`
          : provider.connectionMode === "bridge"
            ? `${provider.name} selezionato. Completa il bridge seguendo la guida.`
            : `${provider.name} selezionato. Segui la guida: il connettore automatico non viene dichiarato attivo finche non e collaudato.`,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const providerId = new URL(request.url).searchParams.get("provider")
    if (!isTelephonyProviderId(providerId)) return NextResponse.json({ error: "Centralino non riconosciuto." }, { status: 400 })
    const supabase = createServiceClient()
    const { error } = await supabase.from("telephony_integrations").delete().eq("property_id", identity.propertyId).eq("provider", providerId)
    if (error) throw error
    await supabase.from("telephony_integration_audit").insert({
      property_id: identity.propertyId,
      provider: providerId,
      action: "deleted",
      actor_email: identity.email,
      details: {},
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}
