import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getPlatformWhatsAppConfig, getPublicWhatsAppConfig } from "@/lib/whatsapp/platform"
import { getWhatsAppQuota, quotaExceededMessage } from "@/lib/whatsapp/quota"
import type { MessagingChannelRow } from "@/lib/whatsapp/types"
import { encryptWhatsAppCredentialsForWrite } from "@/lib/whatsapp/channel-secrets"
import { validateWhatsAppRuntimeAccess } from "@/lib/whatsapp/runtime-access"
import {
  ensureWhatsAppReopenTemplate,
  templateStatePatch,
} from "@/lib/whatsapp/template-provisioning"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Embedded Signup endpoint.
 *
 * GET  -> returns the public (non-secret) Meta config the browser needs to boot
 *         the Embedded Signup widget, plus whether the platform is configured.
 * POST -> finishes onboarding after the hotel completed the Facebook popup:
 *         exchanges the returned `code` for the tenant-scoped business token,
 *         subscribes the platform app to that tenant WABA, resolves the selected
 *         phone number, stores a ready-to-use channel row and provisions the
 *         standard outbound reopen template on that same WABA.
 *
 * Reconnect mode is explicit and quota-free: when `reconnect_channel_id` is
 * supplied, the selected Meta number must match the already-connected physical
 * number. The existing channel row is refreshed in-place, preserving history,
 * assignments, default status and quota usage.
 */

export async function GET(request: NextRequest) {
  try {
    await getAuthenticatedPropertyId(request)
    return NextResponse.json(getPublicWhatsAppConfig())
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function graphGet(version: string, path: string, token: string): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  return res.json().catch(() => null)
}

function phoneDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : ""
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const platform = getPlatformWhatsAppConfig()

    if (!platform.isConfigured) {
      return NextResponse.json(
        {
          error:
            "WhatsApp non è ancora abilitato sulla piattaforma. Contatta l'amministratore (configurazione Meta mancante).",
        },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const code: string | undefined = body?.code
    const phoneNumberId: string | undefined = body?.phone_number_id
    const wabaId: string | undefined = body?.waba_id
    const signupEvent: string | undefined = body?.signup_event
    const reconnectChannelId: string | undefined = body?.reconnect_channel_id

    if (!code) {
      return NextResponse.json({ error: "Codice di autorizzazione mancante" }, { status: 400 })
    }
    if (!wabaId) {
      return NextResponse.json(
        { error: "Account WhatsApp non selezionato. Riprova il collegamento." },
        { status: 400 },
      )
    }
    if (signupEvent !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
      return NextResponse.json(
        {
          error:
            "Meta non ha confermato il collegamento in modalità WhatsApp Business App Coexistence. Riprova il collegamento da HotelAccelerator.",
        },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    let reconnectTarget: { id: string; config: Record<string, unknown> | null } | null = null

    if (reconnectChannelId) {
      const { data, error } = await supabase
        .from("messaging_channels")
        .select("id, config")
        .eq("id", reconnectChannelId)
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .maybeSingle()

      if (error) throw error
      if (!data?.id) {
        return NextResponse.json(
          { error: "Il numero WhatsApp da ricollegare non appartiene a questo tenant." },
          { status: 404 },
        )
      }
      reconnectTarget = {
        id: data.id,
        config: (data.config as Record<string, unknown> | null) ?? null,
      }
    }

    const v = platform.graphVersion

    const tokenRes = await fetch(
      `https://graph.facebook.com/${v}/oauth/access_token?` +
        new URLSearchParams({
          client_id: platform.appId,
          client_secret: platform.appSecret,
          code,
        }).toString(),
      { method: "GET", cache: "no-store" },
    )
    const tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson?.access_token) {
      const msg = tokenJson?.error?.message || "Scambio del codice fallito"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const businessToken: string = tokenJson.access_token

    const subRes = await fetch(`https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}` },
      cache: "no-store",
    })
    const subJson = await subRes.json().catch(() => null)
    if (!subRes.ok || subJson?.success === false) {
      const msg = subJson?.error?.message || "Iscrizione del webhook al numero fallita"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    let resolvedPhoneNumberId = phoneNumberId
    let resolvedNumber: any = null
    const phoneNumbers = await graphGet(
      v,
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      businessToken,
    )
    const candidates = Array.isArray(phoneNumbers?.data) ? phoneNumbers.data : []

    if (resolvedPhoneNumberId) {
      resolvedNumber =
        candidates.find((candidate: any) => String(candidate?.id) === String(resolvedPhoneNumberId)) ?? null
    }

    if (!resolvedNumber) {
      if (candidates.length === 1) {
        resolvedNumber = candidates[0]
        resolvedPhoneNumberId = String(resolvedNumber.id)
      } else if (candidates.length === 0) {
        return NextResponse.json(
          { error: "Meta non ha restituito alcun numero WhatsApp per l'account selezionato." },
          { status: 400 },
        )
      } else {
        return NextResponse.json(
          {
            error:
              "Meta ha restituito più numeri WhatsApp. Riapri il collegamento e seleziona un solo numero da collegare.",
          },
          { status: 400 },
        )
      }
    }

    const info = await graphGet(
      v,
      `${resolvedPhoneNumberId}?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`,
      businessToken,
    )
    const numberInfo = info && !info.error ? info : resolvedNumber
    if (numberInfo?.is_on_biz_app !== true) {
      return NextResponse.json(
        {
          error:
            "Meta non ha confermato che il numero selezionato è attivo nell'app WhatsApp Business. Ripeti il collegamento Coexistence da HotelAccelerator.",
        },
        { status: 400 },
      )
    }
    const displayPhone = numberInfo?.display_phone_number ?? ""
    const verifiedName = numberInfo?.verified_name ?? ""

    if (reconnectTarget) {
      const oldConfig = reconnectTarget.config ?? {}
      const oldPhoneId = typeof oldConfig.phone_number_id === "string" ? oldConfig.phone_number_id : ""
      const oldDisplayPhone = phoneDigits(oldConfig.display_phone_number)
      const newDisplayPhone = phoneDigits(displayPhone)
      const samePhoneId = Boolean(oldPhoneId && oldPhoneId === String(resolvedPhoneNumberId))
      const samePhysicalNumber = Boolean(oldDisplayPhone && newDisplayPhone && oldDisplayPhone === newDisplayPhone)

      if (!samePhoneId && !samePhysicalNumber) {
        return NextResponse.json(
          {
            error:
              "Per ricollegare questo canale devi selezionare lo stesso numero WhatsApp già associato. Nessuna quota extra è stata usata.",
            code: "WHATSAPP_RECONNECT_NUMBER_MISMATCH",
          },
          { status: 400 },
        )
      }
    }

    let config: Record<string, unknown> = {
      phone_number_id: String(resolvedPhoneNumberId),
      waba_id: String(wabaId),
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      graph_version: v,
      provisioned_via: "business_app_coexistence",
      coexistence: true,
      is_on_biz_app: true,
      platform_type: numberInfo?.platform_type ?? "CLOUD_API",
      credential_scope: "tenant_business_token",
    }

    const runtimeProbe = await validateWhatsAppRuntimeAccess({
      config,
      credentials: { access_token: businessToken },
    } as MessagingChannelRow)
    if (!runtimeProbe.ok) {
      return NextResponse.json(
        {
          error: `Collegamento WhatsApp non sicuro: ${runtimeProbe.error}`,
          code: "WHATSAPP_RUNTIME_SCOPE_MISMATCH",
        },
        { status: 400 },
      )
    }

    config = {
      ...config,
      runtime_access_verified_at: new Date().toISOString(),
      runtime_access_status: "VERIFIED",
    }

    const credentials = encryptWhatsAppCredentialsForWrite({
      access_token: businessToken,
      app_secret: platform.appSecret,
      verify_token: platform.verifyToken,
    })

    let existingId: string | null = reconnectTarget?.id ?? null

    if (!existingId) {
      const { data: existing } = await supabase
        .from("messaging_channels")
        .select("id")
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .eq("config->>phone_number_id", String(resolvedPhoneNumberId))
        .maybeSingle()
      existingId = existing?.id ?? null
    }

    let row: MessagingChannelRow
    if (existingId) {
      const { data, error } = await supabase
        .from("messaging_channels")
        .update({
          display_name: verifiedName || "WhatsApp",
          config,
          credentials,
          is_active: true,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId)
        .eq("property_id", propertyId)
        .select("*")
        .single()
      if (error) throw error
      row = data as MessagingChannelRow
    } else {
      const quota = await getWhatsAppQuota(supabase, propertyId)
      if (!quota.canAddNumber) {
        return NextResponse.json(
          {
            error: quotaExceededMessage(quota),
            code: "QUOTA_EXCEEDED",
            quota: { limit: quota.limit, used: quota.used, testNumbers: quota.testNumbers },
          },
          { status: 402 },
        )
      }

      const { data, error } = await supabase
        .from("messaging_channels")
        .insert({
          property_id: propertyId,
          channel_type: "whatsapp" as const,
          display_name: verifiedName || "WhatsApp",
          config,
          credentials,
          is_active: true,
          is_default: quota.used === 0,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single()
      if (error) throw error
      row = data as MessagingChannelRow
    }

    const templateProvisioning = await ensureWhatsAppReopenTemplate({
      wabaId: String(wabaId),
      graphVersion: v,
      accessToken: businessToken,
      sampleCompanyName: verifiedName || "Hotel Demo",
    })

    config = {
      ...config,
      ...templateStatePatch(templateProvisioning),
    }

    const { data: refreshedRow, error: templateStateError } = await supabase
      .from("messaging_channels")
      .update({ config, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .select("*")
      .single()

    if (!templateStateError && refreshedRow) {
      row = refreshedRow as MessagingChannelRow
    }

    return NextResponse.json({
      success: true,
      reconnected: Boolean(reconnectTarget),
      channel: {
        id: row.id,
        display_name: row.display_name,
        display_phone_number: displayPhone,
        verified_name: verifiedName,
        is_active: row.is_active,
        routing_verified: true,
      },
      template: {
        managed: true,
        ready: templateProvisioning.ok && templateProvisioning.status === "APPROVED",
        status: templateProvisioning.status,
        created: templateProvisioning.created,
        error: templateProvisioning.ok ? undefined : templateProvisioning.error,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    console.error("[WhatsApp embedded-signup] error:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
