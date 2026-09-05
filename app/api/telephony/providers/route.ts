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
    const active = rows.find((row) => row.is_active) ?? null
    return NextResponse.json({
      providers: TELEPHONY_PROVIDERS,
      integrations: rows.map(serialize),
      active_integration: active ? serialize(active) : null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null)
    if (!isTelephonyProviderId(body?.provider)) return NextResponse.json({ error: "Centralino non riconosciuto." }, { status: 400 })
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

    const supabase = createServiceClient()
    const now = new Date().toISOString()

    if (provider.connectionMode === "api") {
      const runtime: ProviderRuntimeConfig = { baseUrl, clientId, clientSecret: effectiveSecret, defaultExtension, providerConfig }
      const check = await verifyTelephonyConnection(provider.id, runtime)
      if (!check.ok) {
        // Non sostituire un centralino funzionante con una configurazione che
        // non supera il test. Registriamo solo il tentativo, senza segreti.
        await supabase.from("telephony_integration_audit").insert({
          property_id: identity.propertyId,
          provider: provider.id,
          action: "verification_failed",
          actor_email: identity.email,
          details: { status: check.status, error: check.error.slice(0, 500) },
        })
        return NextResponse.json({ error: `Verifica ${provider.name} non riuscita: ${check.error}`, verified: false }, { status: 422 })
      }

      const inboundSecret = provider.id === "3cx"
        ? (decryptSecretIfNeeded(existing?.inbound_secret_encrypted ?? null) || randomBytes(24).toString("base64url"))
        : null

      const { data, error } = await supabase.rpc("upsert_active_telephony_integration", {
        p_property_id: identity.propertyId,
        p_provider: provider.id,
        p_base_url: baseUrl || null,
        p_client_id: clientId || null,
        p_client_secret_encrypted: effectiveSecret ? encryptForWrite(effectiveSecret) : null,
        p_default_extension: defaultExtension || null,
        p_inbound_secret_encrypted: inboundSecret ? encryptForWrite(inboundSecret) : null,
        p_provider_config: providerConfig,
        p_last_check_status: "ok",
        p_last_check_error: null,
        p_last_check_at: now,
        p_actor_email: identity.email,
      }).single()
      if (error) throw error
      return NextResponse.json({ integration: serialize(data as TelephonyRow), verified: true, mode: provider.connectionMode, message: `${provider.name} collegato, verificato e impostato come centralino attivo.` })
    }

    // Teams/Webex/Avaya: salviamo la scelta/guida ma NON spegniamo un PBX
    // attualmente funzionante e non marchiamo questa riga come operativa.
    const status = provider.connectionMode === "bridge" ? "bridge_required" : "guided"
    const { data, error } = await supabase
      .from("telephony_integrations")
      .upsert({
        property_id: identity.propertyId,
        provider: provider.id,
        base_url: baseUrl || null,
        client_id: clientId || null,
        client_secret_encrypted: effectiveSecret ? encryptForWrite(effectiveSecret) : null,
        default_extension: defaultExtension || null,
        provider_config: providerConfig,
        is_active: false,
        last_check_at: null,
        last_check_status: status,
        last_check_error: null,
        updated_at: now,
      }, { onConflict: "property_id,provider" })
      .select("*")
      .single()
    if (error) throw error
    await supabase.from("telephony_integration_audit").insert({
      property_id: identity.propertyId,
      provider: provider.id,
      action: "guide_selected",
      actor_email: identity.email,
      details: { mode: provider.connectionMode },
    })
    return NextResponse.json({
      integration: serialize(data as TelephonyRow),
      verified: false,
      mode: provider.connectionMode,
      message: provider.connectionMode === "bridge"
        ? `${provider.name}: guida salvata. Il centralino operativo attuale non e stato modificato; completa prima il bridge.`
        : `${provider.name}: guida salvata. Il centralino operativo attuale non e stato modificato finche il connettore OAuth non e collaudato.`,
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
    await supabase.from("telephony_integration_audit").insert({ property_id: identity.propertyId, provider: providerId, action: "deleted", actor_email: identity.email, details: {} })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore" }, { status: accessErrorStatus(error) })
  }
}
