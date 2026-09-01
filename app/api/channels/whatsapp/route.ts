import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getWhatsAppQuota, quotaExceededMessage } from "@/lib/whatsapp/quota"
import { maskSecret, type MessagingChannelRow } from "@/lib/whatsapp/types"
import {
  decryptWhatsAppCredentials,
  encryptWhatsAppCredentialsForWrite,
} from "@/lib/whatsapp/channel-secrets"
import { ensureWhatsAppReopenTemplateForChannel } from "@/lib/whatsapp/template-provisioning"

function serializeChannel(row: MessagingChannelRow) {
  const creds = row.credentials || {}
  return {
    id: row.id,
    channel_type: row.channel_type,
    display_name: row.display_name,
    config: {
      phone_number_id: row.config?.phone_number_id ?? "",
      waba_id: row.config?.waba_id ?? "",
      display_phone_number: row.config?.display_phone_number ?? "",
      graph_version: row.config?.graph_version ?? "",
    },
    credentials_preview: {
      access_token: maskSecret(creds.access_token as string),
      app_secret: maskSecret(creds.app_secret as string),
      verify_token: maskSecret(creds.verify_token as string),
    },
    has_credentials: {
      access_token: Boolean(creds.access_token),
      app_secret: Boolean(creds.app_secret),
      verify_token: Boolean(creds.verify_token),
    },
    is_active: row.is_active,
    is_default: row.is_default,
    last_inbound_at: row.last_inbound_at,
    last_outbound_at: row.last_outbound_at,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("messaging_channels")
      .select("*")
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .order("created_at", { ascending: true })
    if (error) throw error

    let rows = (data as MessagingChannelRow[]) ?? []
    const now = Date.now()
    const candidates = rows.filter((row) => {
      if (!row.is_active) return false
      const status = String(row.config?.reopen_template_status ?? "").toUpperCase()
      const checkedAt = Date.parse(String(row.config?.reopen_template_checked_at ?? ""))
      const recentApproved = status === "APPROVED" && Number.isFinite(checkedAt) && now - checkedAt < 6 * 60 * 60 * 1000
      return !recentApproved
    })

    if (candidates.length > 0) {
      await Promise.allSettled(
        candidates.map(async (row) => {
          const channel: MessagingChannelRow = {
            ...row,
            credentials: decryptWhatsAppCredentials(row.credentials),
          }
          const result = await ensureWhatsAppReopenTemplateForChannel(
            supabase,
            channel,
            row.display_name || "Hotel",
          )
          if (!result.ok) {
            console.warn("[WhatsApp] managed template self-heal failed", {
              channel_id: row.id,
              property_id: row.property_id,
              status: result.status,
              error: result.error,
            })
          }
        }),
      )

      const { data: refreshed, error: refreshError } = await supabase
        .from("messaging_channels")
        .select("*")
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .order("created_at", { ascending: true })
      if (!refreshError && refreshed) rows = refreshed as MessagingChannelRow[]
    }

    const quota = await getWhatsAppQuota(supabase, propertyId)
    return NextResponse.json({ channels: rows.map(serializeChannel), quota })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * Manual Meta credentials are a platform recovery tool only.
 * Tenant admins must use Embedded Signup and are never asked for WABA IDs,
 * tokens, app secrets, verify tokens, billing settings or Meta configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    if (!identity.isSuperAdmin) {
      return NextResponse.json(
        { error: "La configurazione WhatsApp è gestita da HotelAccelerator. Usa Collega WhatsApp." },
        { status: 403 },
      )
    }
    if (!identity.propertyId) return NextResponse.json({ error: "Nessun tenant selezionato" }, { status: 400 })

    const propertyId = identity.propertyId
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))
    const {
      id,
      display_name,
      phone_number_id,
      waba_id,
      display_phone_number,
      graph_version,
      access_token,
      app_secret,
      verify_token,
      is_active,
    } = body ?? {}

    if (!phone_number_id || String(phone_number_id).trim() === "") {
      return NextResponse.json({ error: "phone_number_id è obbligatorio" }, { status: 400 })
    }

    let existing: MessagingChannelRow | null = null
    if (id) {
      const { data } = await supabase
        .from("messaging_channels")
        .select("*")
        .eq("id", id)
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .maybeSingle()
      existing = (data as MessagingChannelRow) ?? null
    }

    const incomingSecrets: Record<string, unknown> = {}
    if (typeof access_token === "string" && access_token.trim()) incomingSecrets.access_token = access_token.trim()
    if (typeof app_secret === "string" && app_secret.trim()) incomingSecrets.app_secret = app_secret.trim()
    if (typeof verify_token === "string" && verify_token.trim()) incomingSecrets.verify_token = verify_token.trim()

    const mergedCredentials: Record<string, unknown> = {
      ...(existing?.credentials ?? {}),
      ...encryptWhatsAppCredentialsForWrite(incomingSecrets),
    }

    const config: Record<string, unknown> = {
      ...(existing?.config ?? {}),
      phone_number_id: String(phone_number_id).trim(),
      waba_id: waba_id ? String(waba_id).trim() : "",
      display_phone_number: display_phone_number ? String(display_phone_number).trim() : "",
      graph_version: graph_version ? String(graph_version).trim() : "",
      manual_configuration_by_platform: true,
    }

    const payload = {
      property_id: propertyId,
      channel_type: "whatsapp" as const,
      display_name: display_name ?? "WhatsApp",
      config,
      credentials: mergedCredentials,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    let row: MessagingChannelRow
    if (existing) {
      const { data, error } = await supabase
        .from("messaging_channels")
        .update(payload)
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
        .insert({ ...payload, is_default: quota.used === 0 })
        .select("*")
        .single()
      if (error) throw error
      row = data as MessagingChannelRow
    }

    return NextResponse.json({ channel: serializeChannel(row) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))
    const id: string | undefined = body?.id
    const action: string | undefined = body?.action
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })

    if (action !== "set_default") return NextResponse.json({ error: "Azione non supportata" }, { status: 400 })

    const { data: target } = await supabase
      .from("messaging_channels")
      .select("id")
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .eq("is_active", true)
      .maybeSingle()
    if (!target) return NextResponse.json({ error: "Numero non trovato" }, { status: 404 })

    await supabase
      .from("messaging_channels")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .eq("is_default", true)

    const { data, error } = await supabase
      .from("messaging_channels")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ channel: serializeChannel(data as MessagingChannelRow) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const id = new URL(request.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })

    const { data: removed } = await supabase
      .from("messaging_channels")
      .select("is_default")
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
      .maybeSingle()

    const { error } = await supabase
      .from("messaging_channels")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", "whatsapp")
    if (error) throw error

    if (removed?.is_default) {
      const { data: next } = await supabase
        .from("messaging_channels")
        .select("id")
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (next?.id) {
        await supabase
          .from("messaging_channels")
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq("id", next.id)
          .eq("property_id", propertyId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
