import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getPlatformWhatsAppConfig, getPublicWhatsAppConfig } from "@/lib/whatsapp/platform"
import { attachPlatformBillingToWaba } from "@/lib/whatsapp/platform-billing"
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
 * The tenant only authorizes the WhatsApp number in Meta's embedded flow. It
 * never handles tokens, WABA IDs, webhook configuration, templates, currency,
 * payment methods or billing. All of those are platform responsibilities.
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

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const platform = getPlatformWhatsAppConfig()

    if (!platform.isConfigured) {
      return NextResponse.json(
        { error: "WhatsApp è temporaneamente in attivazione lato HotelAccelerator. Non devi configurare nulla su Meta." },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const code: string | undefined = body?.code
    const phoneNumberId: string | undefined = body?.phone_number_id
    const wabaId: string | undefined = body?.waba_id
    const signupEvent: string | undefined = body?.signup_event

    if (!code) return NextResponse.json({ error: "Codice di autorizzazione mancante" }, { status: 400 })
    if (!wabaId) {
      return NextResponse.json({ error: "Account WhatsApp non selezionato. Riprova il collegamento." }, { status: 400 })
    }
    if (signupEvent !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
      return NextResponse.json(
        { error: "Il collegamento WhatsApp non è stato completato. Riprova da HotelAccelerator." },
        { status: 400 },
      )
    }

    const v = platform.graphVersion
    const tokenRes = await fetch(
      `https://graph.facebook.com/${v}/oauth/access_token?` +
        new URLSearchParams({ client_id: platform.appId, client_secret: platform.appSecret, code }).toString(),
      { method: "GET", cache: "no-store" },
    )
    const tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson?.access_token) {
      return NextResponse.json({ error: "Autorizzazione WhatsApp non completata. Riprova." }, { status: 400 })
    }
    const businessToken: string = tokenJson.access_token

    const subRes = await fetch(`https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}` },
      cache: "no-store",
    })
    const subJson = await subRes.json().catch(() => null)
    if (!subRes.ok || subJson?.success === false) {
      return NextResponse.json({ error: "HotelAccelerator non è riuscito ad attivare il canale WhatsApp. Riprova più tardi." }, { status: 502 })
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
      resolvedNumber = candidates.find((candidate: any) => String(candidate?.id) === String(resolvedPhoneNumberId)) ?? null
    }
    if (!resolvedNumber) {
      if (candidates.length === 1) {
        resolvedNumber = candidates[0]
        resolvedPhoneNumberId = String(resolvedNumber.id)
      } else if (candidates.length === 0) {
        return NextResponse.json({ error: "WhatsApp non ha restituito alcun numero per l'account selezionato." }, { status: 400 })
      } else {
        return NextResponse.json({ error: "Seleziona un solo numero WhatsApp e ripeti il collegamento." }, { status: 400 })
      }
    }

    const info = await graphGet(
      v,
      `${resolvedPhoneNumberId}?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`,
      businessToken,
    )
    const numberInfo = info && !info.error ? info : resolvedNumber
    if (numberInfo?.is_on_biz_app !== true) {
      return NextResponse.json({ error: "Il numero selezionato non risulta attivo nell'app WhatsApp Business." }, { status: 400 })
    }

    const displayPhone = numberInfo?.display_phone_number ?? ""
    const verifiedName = numberInfo?.verified_name ?? ""
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
      platform_billing_managed_by: "4bid",
      platform_billing_status: "pending",
      platform_billing_currency: "EUR",
    }

    const runtimeProbe = await validateWhatsAppRuntimeAccess({
      config,
      credentials: { access_token: businessToken },
    } as MessagingChannelRow)
    if (!runtimeProbe.ok) {
      return NextResponse.json(
        { error: "Il numero WhatsApp non può essere associato in sicurezza a questa struttura.", code: "WHATSAPP_RUNTIME_SCOPE_MISMATCH" },
        { status: 400 },
      )
    }

    config = {
      ...config,
      runtime_access_verified_at: new Date().toISOString(),
      runtime_access_status: "VERIFIED",
    }

    const supabase = createServiceClient()
    const credentials = encryptWhatsAppCredentialsForWrite({
      access_token: businessToken,
      app_secret: platform.appSecret,
      verify_token: platform.verifyToken,
    })

    const { data: existing } = await supabase
      .from("messaging_channels")
      .select("id,config")
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .eq("config->>phone_number_id", String(resolvedPhoneNumberId))
      .maybeSingle()

    if (existing?.config && typeof existing.config === "object") {
      config = { ...(existing.config as Record<string, unknown>), ...config }
    }

    let row: MessagingChannelRow
    if (existing?.id) {
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
        .eq("id", existing.id)
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

    const billing = await attachPlatformBillingToWaba(supabase, String(wabaId))
    config = {
      ...config,
      platform_billing_managed_by: "4bid",
      platform_billing_status: billing.status,
      platform_billing_currency: billing.currency,
      platform_billing_credit_line_id: billing.creditLineId ?? null,
      platform_billing_allocation_config_id: billing.allocationConfigId ?? null,
      platform_billing_checked_at: new Date().toISOString(),
      platform_billing_error: billing.ok ? null : billing.error ?? "Platform billing not ready",
    }

    // Template provisioning remains useful even while central billing is being
    // activated; inbound and 24h customer-care traffic can operate independently.
    const templateProvisioning = await ensureWhatsAppReopenTemplate({
      wabaId: String(wabaId),
      graphVersion: v,
      accessToken: businessToken,
      sampleCompanyName: verifiedName || "Hotel Demo",
    })
    config = { ...config, ...templateStatePatch(templateProvisioning) }

    const { data: refreshedRow, error: stateError } = await supabase
      .from("messaging_channels")
      .update({ config, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .select("*")
      .single()
    if (!stateError && refreshedRow) row = refreshedRow as MessagingChannelRow

    if (!billing.ok) {
      console.warn("[WhatsApp embedded-signup] 4BID billing not ready", {
        property_id: propertyId,
        channel_id: row.id,
        waba_id: String(wabaId),
        status: billing.status,
        error: billing.error,
      })
    }

    return NextResponse.json({
      success: true,
      channel: {
        id: row.id,
        display_name: row.display_name,
        display_phone_number: displayPhone,
        verified_name: verifiedName,
        is_active: row.is_active,
        routing_verified: true,
      },
      platformBilling: {
        managed: true,
        ready: billing.ok,
        status: billing.status,
      },
      template: {
        managed: true,
        ready: templateProvisioning.ok && templateProvisioning.status === "APPROVED",
        status: templateProvisioning.status,
        created: templateProvisioning.created,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    console.error("[WhatsApp embedded-signup] error:", error)
    return NextResponse.json({ error: "Errore durante l'attivazione WhatsApp. HotelAccelerator ha registrato il problema." }, { status })
  }
}
