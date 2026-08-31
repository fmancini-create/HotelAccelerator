import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getPlatformWhatsAppConfig, getPublicWhatsAppConfig } from "@/lib/whatsapp/platform"
import { getWhatsAppQuota, quotaExceededMessage } from "@/lib/whatsapp/quota"
import type { MessagingChannelRow } from "@/lib/whatsapp/types"
import { encryptWhatsAppCredentialsForWrite } from "@/lib/whatsapp/channel-secrets"
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
 *         exchanges the returned `code` for a business token, subscribes the
 *         platform app to the client's WABA, resolves the selected phone number,
 *         stores a ready-to-use channel row and provisions the standard outbound
 *         reopen template on that WABA.
 *
 * The hotel never handles tokens, app secrets or message-template setup: those
 * are platform-managed. Per tenant we persist routing identifiers + non-secret
 * template status metadata; ongoing sends use the platform system-user token.
 */

export async function GET(request: NextRequest) {
  try {
    // Auth still required so we don't leak even the public ids to anonymous users.
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
  })
  return res.json().catch(() => null)
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
            "Meta non ha confermato il collegamento in modalità WhatsApp Business App Coexistence. Verifica la configurazione Meta dedicata e riprova.",
        },
        { status: 400 },
      )
    }

    const v = platform.graphVersion

    // 1) Exchange the short-lived code for a business access token. This token
    // has access to the WABA the hotel just shared and is therefore the safest
    // credential for the one-off onboarding/provisioning operations below.
    const tokenRes = await fetch(
      `https://graph.facebook.com/${v}/oauth/access_token?` +
        new URLSearchParams({
          client_id: platform.appId,
          client_secret: platform.appSecret,
          code,
        }).toString(),
      { method: "GET" },
    )
    const tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson?.access_token) {
      const msg = tokenJson?.error?.message || "Scambio del codice fallito"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const businessToken: string = tokenJson.access_token

    // 2) Subscribe the platform app to the client's WABA so inbound messages,
    // statuses and message_template_status_update events reach our shared webhook.
    const subRes = await fetch(`https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}` },
    })
    const subJson = await subRes.json().catch(() => null)
    if (!subRes.ok || subJson?.success === false) {
      const msg = subJson?.error?.message || "Iscrizione del webhook al numero fallita"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 3) Coexistence deliberately does NOT call /register. Registering a
    // Business App number through the standard Cloud API endpoint can take it
    // out of the phone app instead of keeping the two surfaces in sync.
    //
    // Meta's Business App completion event supplies the WABA; it may omit the
    // phone_number_id. Resolve the sole selected number from that WABA, while
    // still accepting a phone ID when Meta includes it in the session payload.
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

    // 4) Fetch a current number snapshot. The business token is the token that
    // just authorized this WABA, so it is valid even before the platform token
    // has been granted access to the newly shared asset.
    const info = await graphGet(
      v,
      `${resolvedPhoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
      businessToken,
    )
    const numberInfo = info && !info.error ? info : resolvedNumber
    if (numberInfo?.is_on_biz_app !== true) {
      return NextResponse.json(
        {
          error:
            "Meta non ha confermato che il numero selezionato è attivo nell'app WhatsApp Business. Non è stato collegato: ripeti il flusso Coexistence selezionando il numero dell'app.",
        },
        { status: 400 },
      )
    }
    const displayPhone = numberInfo?.display_phone_number ?? ""
    const verifiedName = numberInfo?.verified_name ?? ""

    // 5) Persist the channel. Secrets stay server-side; the row holds routing
    // configuration plus non-secret template lifecycle metadata.
    const supabase = createServiceClient()

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
    }
    // WRITE-ENCRYPT: platform-managed credentials are persisted encrypted at
    // rest. Only these secret fields are encrypted; routing/template config is
    // intentionally queryable server-side.
    const credentials = encryptWhatsAppCredentialsForWrite({
      access_token: platform.systemUserToken,
      app_secret: platform.appSecret,
      verify_token: platform.verifyToken,
    })

    // Is this exact number already connected for this property? If so we just
    // refresh its config/credentials (re-onboarding the same number).
    const { data: existing } = await supabase
      .from("messaging_channels")
      .select("id")
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .eq("config->>phone_number_id", String(resolvedPhoneNumberId))
      .maybeSingle()

    let row: MessagingChannelRow
    if (existing?.id) {
      // Update an existing number (do not touch is_default here).
      const { data, error } = await supabase
        .from("messaging_channels")
        .update({
          display_name: verifiedName || "WhatsApp",
          config,
          credentials,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single()
      if (error) throw error
      row = data as MessagingChannelRow
    } else {
      // Adding a NEW number: enforce the per-property quota.
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

      // First number for this property becomes the default automatically.
      const isFirst = quota.used === 0

      const { data, error } = await supabase
        .from("messaging_channels")
        .insert({
          property_id: propertyId,
          channel_type: "whatsapp" as const,
          display_name: verifiedName || "WhatsApp",
          config,
          credentials,
          is_active: true,
          is_default: isFirst,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single()
      if (error) throw error
      row = data as MessagingChannelRow
    }

    // 6) Multi-tenant template provisioning. Every tenant keeps its own WABA,
    // but HotelAccelerator owns one logical template definition and creates it
    // automatically on each WABA. Failure here must not disconnect WhatsApp:
    // normal 24h conversations still work and the lazy send-time check retries.
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
      channel: {
        id: row.id,
        display_name: row.display_name,
        display_phone_number: displayPhone,
        verified_name: verifiedName,
        is_active: row.is_active,
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
