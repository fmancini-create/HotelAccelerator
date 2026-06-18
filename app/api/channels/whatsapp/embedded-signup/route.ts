import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getPlatformWhatsAppConfig, getPublicWhatsAppConfig } from "@/lib/whatsapp/platform"
import { getWhatsAppQuota } from "@/lib/whatsapp/quota"
import type { MessagingChannelRow } from "@/lib/whatsapp/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Embedded Signup endpoint.
 *
 * GET  -> returns the public (non-secret) Meta config the browser needs to boot
 *         the Embedded Signup widget, plus whether the platform is configured.
 * POST -> finishes onboarding after the hotel completed the Facebook popup:
 *         exchanges the returned `code` for a business token, subscribes the
 *         platform app to the client's WABA, registers the phone number, fetches
 *         the display number, and stores a ready-to-use channel row.
 *
 * The hotel never handles tokens or app secrets: those are platform-level env
 * vars (Meta Tech Provider model). Per tenant we only persist phone_number_id +
 * waba_id; ongoing sends use the platform system-user token.
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

    if (!code) {
      return NextResponse.json({ error: "Codice di autorizzazione mancante" }, { status: 400 })
    }
    if (!phoneNumberId || !wabaId) {
      return NextResponse.json(
        { error: "Numero non selezionato. Riprova il collegamento e scegli un numero WhatsApp." },
        { status: 400 },
      )
    }

    const v = platform.graphVersion

    // 1) Exchange the short-lived code for a business access token. This token
    //    has access to the WABA the hotel just shared, used here for onboarding.
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

    // 2) Subscribe the platform app to the client's WABA so inbound messages and
    //    statuses are delivered to our shared webhook.
    const subRes = await fetch(`https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}` },
    })
    const subJson = await subRes.json().catch(() => null)
    if (!subRes.ok || subJson?.success === false) {
      const msg = subJson?.error?.message || "Iscrizione del webhook al numero fallita"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // 3) Register the phone number on Cloud API (idempotent). A 2-step PIN is
    //    only required if the number had 2FA enabled; we send a default PIN.
    //    Failures here are non-fatal: the number may already be registered.
    try {
      await fetch(`https://graph.facebook.com/${v}/${phoneNumberId}/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${platform.systemUserToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", pin: "000000" }),
      })
    } catch {
      // ignore — registration is best-effort
    }

    // 4) Fetch human-readable number + verified business name for display.
    let displayPhone = ""
    let verifiedName = ""
    const info = await graphGet(
      v,
      `${phoneNumberId}?fields=display_phone_number,verified_name`,
      platform.systemUserToken,
    )
    if (info && !info.error) {
      displayPhone = info.display_phone_number ?? ""
      verifiedName = info.verified_name ?? ""
    }

    // 5) Persist the channel. Secrets stay in env; the row holds routing config
    //    only. We DO store verify_token/app_secret references so the existing
    //    per-tenant webhook + client paths keep working unchanged.
    const supabase = createServiceClient()

    const config = {
      phone_number_id: String(phoneNumberId),
      waba_id: String(wabaId),
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      graph_version: v,
      provisioned_via: "embedded_signup",
    }
    const credentials = {
      // Platform-managed secrets (single Meta app). Stored so existing helpers
      // resolve them per-row; rotating the env values overrides these at runtime.
      access_token: platform.systemUserToken,
      app_secret: platform.appSecret,
      verify_token: platform.verifyToken,
    }

    // Is this exact number already connected for this property? If so we just
    // refresh its config/credentials (re-onboarding the same number).
    const { data: existing } = await supabase
      .from("messaging_channels")
      .select("id")
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .eq("config->>phone_number_id", String(phoneNumberId))
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
            error: `Hai raggiunto il limite di numeri WhatsApp del tuo piano (${quota.limit}). Acquista un numero aggiuntivo per collegarne un altro.`,
            code: "QUOTA_EXCEEDED",
            quota: { limit: quota.limit, used: quota.used },
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

    return NextResponse.json({
      success: true,
      channel: {
        id: row.id,
        display_name: row.display_name,
        display_phone_number: displayPhone,
        verified_name: verifiedName,
        is_active: row.is_active,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    console.error("[WhatsApp embedded-signup] error:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
