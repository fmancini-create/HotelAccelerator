import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getWhatsAppQuota } from "@/lib/whatsapp/quota"
import { maskSecret, type MessagingChannelRow } from "@/lib/whatsapp/types"

/**
 * Per-tenant WhatsApp channel configuration.
 *
 * Secrets (access_token, app_secret, verify_token) are NEVER returned in full:
 * GET returns masked previews + booleans. POST only overwrites a secret when a
 * new non-empty value is provided (so the UI can leave fields blank to keep the
 * existing secret).
 */

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

    const channels = (data as MessagingChannelRow[]).map(serializeChannel)
    const quota = await getWhatsAppQuota(supabase, propertyId)
    return NextResponse.json({ channels, quota })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

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

    // Load existing row (if any) to preserve secrets that were left blank.
    let existing: MessagingChannelRow | null = null
    if (id) {
      const { data } = await supabase
        .from("messaging_channels")
        .select("*")
        .eq("id", id)
        .eq("property_id", propertyId)
        .maybeSingle()
      existing = (data as MessagingChannelRow) ?? null
    }

    const mergedCredentials: Record<string, unknown> = { ...(existing?.credentials ?? {}) }
    if (typeof access_token === "string" && access_token.trim() !== "") {
      mergedCredentials.access_token = access_token.trim()
    }
    if (typeof app_secret === "string" && app_secret.trim() !== "") {
      mergedCredentials.app_secret = app_secret.trim()
    }
    if (typeof verify_token === "string" && verify_token.trim() !== "") {
      mergedCredentials.verify_token = verify_token.trim()
    }

    const config: Record<string, unknown> = {
      phone_number_id: String(phone_number_id).trim(),
      waba_id: waba_id ? String(waba_id).trim() : "",
      display_phone_number: display_phone_number ? String(display_phone_number).trim() : "",
      graph_version: graph_version ? String(graph_version).trim() : "",
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
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * PATCH: set a specific WhatsApp number as the default for the property.
 * Body: { id: string, action: "set_default" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))
    const id: string | undefined = body?.id
    const action: string | undefined = body?.action

    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })

    if (action === "set_default") {
      // Ensure the target belongs to this property and is active.
      const { data: target } = await supabase
        .from("messaging_channels")
        .select("id")
        .eq("id", id)
        .eq("property_id", propertyId)
        .eq("channel_type", "whatsapp")
        .eq("is_active", true)
        .maybeSingle()
      if (!target) return NextResponse.json({ error: "Numero non trovato" }, { status: 404 })

      // Clear the current default(s), then set the new one. Two steps so the
      // partial unique index (one default per property) never conflicts.
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
    }

    return NextResponse.json({ error: "Azione non supportata" }, { status: 400 })
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

    // Was this the default number? If so, we'll promote another one after delete.
    const { data: removed } = await supabase
      .from("messaging_channels")
      .select("is_default")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()

    const { error } = await supabase
      .from("messaging_channels")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)
    if (error) throw error

    // Promote the oldest remaining active number to default if we removed it.
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
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
