import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { decryptWhatsAppCredentials } from "@/lib/whatsapp/channel-secrets"
import { validateWhatsAppRuntimeAccess } from "@/lib/whatsapp/runtime-access"
import type { MessagingChannelRow } from "@/lib/whatsapp/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}

/**
 * Platform-only diagnostic. It never returns credentials.
 * One row proves the full routing boundary:
 * property -> WABA -> phone_number_id -> runtime credential access.
 */
export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) return noStore({ error: "Non autenticato" }, 401)

  const { data: collaborator } = await auth
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role !== "super_admin" || collaborator?.is_active !== true) {
    return noStore({ error: "Accesso riservato al superadmin" }, 403)
  }

  const supabase = createServiceClient()
  const { data: rows, error } = await supabase
    .from("messaging_channels")
    .select("id, property_id, display_name, config, credentials, is_active, is_default, last_error, properties(name)")
    .eq("channel_type", "whatsapp")
    .order("created_at", { ascending: true })

  if (error) return noStore({ error: error.message }, 500)

  const diagnostics = await Promise.all((rows ?? []).map(async (raw: any) => {
    const channel = {
      ...raw,
      credentials: decryptWhatsAppCredentials(raw.credentials),
    } as MessagingChannelRow
    const probe = channel.is_active
      ? await validateWhatsAppRuntimeAccess(channel)
      : { ok: false, error: "Canale disattivato", wabaId: "", phoneNumberId: "" }
    const config = (channel.config ?? {}) as Record<string, unknown>

    return {
      channelId: channel.id,
      propertyId: channel.property_id,
      propertyName: raw.properties?.name ?? channel.display_name ?? "Tenant",
      displayName: channel.display_name,
      active: channel.is_active,
      default: channel.is_default,
      phone: config.display_phone_number ?? null,
      phoneNumberId: config.phone_number_id ?? null,
      wabaId: config.waba_id ?? null,
      credentialScope: config.credential_scope ?? "legacy_platform_token",
      runtimeAccessStatus: probe.ok ? "VERIFIED" : "FAILED",
      runtimeAccessError: probe.ok ? null : probe.error ?? "Verifica fallita",
      runtimeAccessVerifiedAt: config.runtime_access_verified_at ?? null,
      templateName: config.reopen_template_name ?? null,
      templateId: config.reopen_template_id ?? null,
      templateStatus: config.reopen_template_status ?? null,
      templateCheckedAt: config.reopen_template_checked_at ?? null,
      lastError: raw.last_error ?? null,
    }
  }))

  return noStore({
    generatedAt: new Date().toISOString(),
    total: diagnostics.length,
    healthy: diagnostics.filter((row) => row.runtimeAccessStatus === "VERIFIED").length,
    channels: diagnostics,
  })
}
