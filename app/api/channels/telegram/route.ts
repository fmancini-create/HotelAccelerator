import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { maskSecret, type TelegramChannelRow } from "@/lib/telegram/types"
import { encryptTelegramCredentialsForWrite } from "@/lib/telegram/channel-secrets"
import {
  getTelegramMe,
  setTelegramWebhook,
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
} from "@/lib/telegram/client"
import { decryptTelegramCredentials } from "@/lib/telegram/channel-secrets"

/**
 * Per-tenant Telegram channel configuration.
 *
 * The bot token is NEVER returned in full: GET returns a masked preview + a
 * boolean. Connecting a bot validates the token (getMe), stores it encrypted,
 * and registers the webhook with a per-channel secret token.
 */

function serializeChannel(row: TelegramChannelRow) {
  const creds = row.credentials || {}
  return {
    id: row.id,
    channel_type: row.channel_type,
    display_name: row.display_name,
    config: {
      bot_id: row.config?.bot_id ?? "",
      bot_username: row.config?.bot_username ?? "",
      autopilot_enabled: Boolean(row.config?.autopilot_enabled),
    },
    credentials_preview: {
      bot_token: maskSecret(creds.bot_token as string),
    },
    has_credentials: {
      bot_token: Boolean(creds.bot_token),
    },
    is_active: row.is_active,
    is_default: row.is_default,
    last_inbound_at: row.last_inbound_at,
    last_outbound_at: row.last_outbound_at,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

function webhookUrlFor(request: NextRequest, channelId: string): string {
  // Prefer the canonical host of the incoming request. This avoids registering
  // the webhook on a host that platform-level rules redirect (e.g. non-www ->
  // www 307): Telegram does NOT follow redirects and would silently never
  // deliver updates. When the admin browses www.<domain>, the request host is
  // already canonical. Fall back to NEXT_PUBLIC_APP_URL if headers are absent.
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https"
  const base = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_APP_URL || ""
  return `${base.replace(/\/+$/, "")}/api/channels/telegram/webhook/${channelId}`
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("messaging_channels")
      .select("*")
      .eq("property_id", propertyId)
      .eq("channel_type", "telegram")
      .order("created_at", { ascending: true })

    if (error) throw error

    const channels = ((data as TelegramChannelRow[]) ?? []).map(serializeChannel)
    return NextResponse.json({ channels })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST: connect (or update) a Telegram bot for this property.
 * Body: { id?, display_name?, bot_token, autopilot_enabled? }
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

    const { id, display_name, bot_token, autopilot_enabled } = body ?? {}

    // Load existing row (if updating) to preserve token when left blank.
    let existing: TelegramChannelRow | null = null
    if (id) {
      const { data } = await supabase
        .from("messaging_channels")
        .select("*")
        .eq("id", id)
        .eq("property_id", propertyId)
        .eq("channel_type", "telegram")
        .maybeSingle()
      existing = (data as TelegramChannelRow) ?? null
    }

    // Determine the effective token: new one if provided, else the existing
    // (decrypted) one. A token is required to (re)validate and set the webhook.
    const newToken = typeof bot_token === "string" && bot_token.trim() !== "" ? bot_token.trim() : null
    const existingToken = existing
      ? (decryptTelegramCredentials(existing.credentials)?.bot_token as string | undefined)
      : undefined
    const effectiveToken = newToken || existingToken

    if (!effectiveToken) {
      return NextResponse.json({ error: "Bot token obbligatorio" }, { status: 400 })
    }

    // Validate the token with Telegram and fetch bot identity.
    const me = await getTelegramMe(effectiveToken)
    if (!me.success) {
      return NextResponse.json({ error: `Token non valido: ${me.error}` }, { status: 400 })
    }

    // Reuse the existing webhook secret if present, else generate a new one.
    const existingSecret = existing
      ? (decryptTelegramCredentials(existing.credentials)?.webhook_secret as string | undefined)
      : undefined
    const webhookSecret = existingSecret || randomBytes(24).toString("hex")

    const incomingSecrets: Record<string, unknown> = { webhook_secret: webhookSecret }
    if (newToken) incomingSecrets.bot_token = newToken
    const mergedCredentials: Record<string, unknown> = {
      ...(existing?.credentials ?? {}),
      ...encryptTelegramCredentialsForWrite(incomingSecrets),
    }

    const config: Record<string, unknown> = {
      ...(existing?.config ?? {}),
      bot_id: me.botId ?? existing?.config?.bot_id ?? "",
      bot_username: me.username ?? existing?.config?.bot_username ?? "",
      autopilot_enabled:
        typeof autopilot_enabled === "boolean"
          ? autopilot_enabled
          : Boolean(existing?.config?.autopilot_enabled),
    }

    const payload = {
      property_id: propertyId,
      channel_type: "telegram" as const,
      display_name: display_name ?? existing?.display_name ?? me.firstName ?? "Telegram",
      config,
      credentials: mergedCredentials,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    let row: TelegramChannelRow
    if (existing) {
      const { data, error } = await supabase
        .from("messaging_channels")
        .update(payload)
        .eq("id", existing.id)
        .eq("property_id", propertyId)
        .select("*")
        .single()
      if (error) throw error
      row = data as TelegramChannelRow
    } else {
      // First Telegram channel for the property becomes the default.
      const { count } = await supabase
        .from("messaging_channels")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("channel_type", "telegram")
      const { data, error } = await supabase
        .from("messaging_channels")
        .insert({ ...payload, is_default: (count ?? 0) === 0 })
        .select("*")
        .single()
      if (error) throw error
      row = data as TelegramChannelRow
    }

    // Register the webhook now that we have the channel id for the URL.
    const webhookResult = await setTelegramWebhook(effectiveToken, webhookUrlFor(request, row.id), webhookSecret)
    if (!webhookResult.success) {
      await supabase
        .from("messaging_channels")
        .update({ last_error: `Webhook non registrato: ${webhookResult.error}` })
        .eq("id", row.id)
      return NextResponse.json(
        {
          channel: serializeChannel({ ...row, last_error: `Webhook non registrato: ${webhookResult.error}` }),
          warning: `Bot collegato ma webhook non registrato: ${webhookResult.error}`,
        },
        { status: 200 },
      )
    }

    await supabase.from("messaging_channels").update({ last_error: null }).eq("id", row.id)
    return NextResponse.json({ channel: serializeChannel({ ...row, last_error: null }) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PATCH: toggle autopilot or set default.
 * Body: { id, action: "toggle_autopilot", autopilot_enabled } | { id, action: "set_default" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))
    const id: string | undefined = body?.id
    const action: string | undefined = body?.action

    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })

    const { data: target } = await supabase
      .from("messaging_channels")
      .select("*")
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", "telegram")
      .maybeSingle()
    if (!target) return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    const typedTarget = target as TelegramChannelRow

    if (action === "toggle_autopilot") {
      const enabled = Boolean(body?.autopilot_enabled)
      const { data, error } = await supabase
        .from("messaging_channels")
        .update({
          config: { ...typedTarget.config, autopilot_enabled: enabled },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("property_id", propertyId)
        .select("*")
        .single()
      if (error) throw error
      return NextResponse.json({ channel: serializeChannel(data as TelegramChannelRow) })
    }

    if (action === "set_default") {
      await supabase
        .from("messaging_channels")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("property_id", propertyId)
        .eq("channel_type", "telegram")
        .eq("is_default", true)

      const { data, error } = await supabase
        .from("messaging_channels")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("property_id", propertyId)
        .select("*")
        .single()
      if (error) throw error
      return NextResponse.json({ channel: serializeChannel(data as TelegramChannelRow) })
    }

    if (action === "reset_webhook") {
      // Re-register the webhook using the CANONICAL host of this request. Fixes
      // bots whose webhook was set on a redirecting host (non-www) that
      // Telegram won't follow. Also returns Telegram's getWebhookInfo so the
      // operator can see the live delivery status.
      const creds = decryptTelegramCredentials(typedTarget.credentials)
      const token = creds?.bot_token as string | undefined
      if (!token) {
        return NextResponse.json({ error: "Bot token mancante: ricollega il bot" }, { status: 400 })
      }

      // Ensure a webhook secret exists (older rows may lack one).
      let secret = creds?.webhook_secret as string | undefined
      if (!secret) {
        secret = randomBytes(24).toString("hex")
        const mergedCredentials = {
          ...(typedTarget.credentials ?? {}),
          ...encryptTelegramCredentialsForWrite({ webhook_secret: secret }),
        }
        await supabase
          .from("messaging_channels")
          .update({ credentials: mergedCredentials, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("property_id", propertyId)
      }

      const url = webhookUrlFor(request, id)
      const setResult = await setTelegramWebhook(token, url, secret)
      const info = await getTelegramWebhookInfo(token)

      const lastError = setResult.success ? null : `Webhook non registrato: ${setResult.error}`
      await supabase
        .from("messaging_channels")
        .update({ last_error: lastError, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("property_id", propertyId)

      return NextResponse.json({
        ok: setResult.success,
        registeredUrl: url,
        error: setResult.success ? undefined : setResult.error,
        webhookInfo: info.success
          ? {
              url: info.url,
              pendingUpdateCount: info.pendingUpdateCount,
              lastErrorMessage: info.lastErrorMessage,
              ipAddress: info.ipAddress,
            }
          : { error: info.error },
      })
    }

    return NextResponse.json({ error: "Azione non supportata" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * DELETE: disconnect a Telegram bot (remove webhook + delete row).
 */
export async function DELETE(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const id = new URL(request.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })

    const { data: target } = await supabase
      .from("messaging_channels")
      .select("*")
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", "telegram")
      .maybeSingle()

    if (target) {
      const typedTarget = target as TelegramChannelRow
      const creds = decryptTelegramCredentials(typedTarget.credentials)
      const token = creds?.bot_token as string | undefined
      // Best-effort: remove the webhook from Telegram's side.
      if (token) await deleteTelegramWebhook(token)

      const { error } = await supabase
        .from("messaging_channels")
        .delete()
        .eq("id", id)
        .eq("property_id", propertyId)
      if (error) throw error

      // Promote another channel to default if we removed the default one.
      if (typedTarget.is_default) {
        const { data: next } = await supabase
          .from("messaging_channels")
          .select("id")
          .eq("property_id", propertyId)
          .eq("channel_type", "telegram")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
        if (next?.id) {
          await supabase
            .from("messaging_channels")
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq("id", next.id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
