import "server-only"

import type { NextRequest } from "next/server"
import { AccessError, getCallerIdentity, type CallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { ensureGoogleAccessToken } from "@/lib/calendar/google-user-calendar"
import { getPlatformDemoCalendarId, isPlatformDemoCalendarConfigured } from "@/lib/calendar/google-service-calendar"

export type CalendarPermission = "view" | "edit" | "manage"

export type CalendarSource = {
  id: string
  property_id: string
  account_id: string | null
  owner_user_id: string | null
  provider: "google"
  auth_mode: "oauth" | "service_account"
  source_kind: "personal" | "shared" | "platform_demo"
  external_calendar_id: string
  label: string
  color: string
  is_active: boolean
  permission: CalendarPermission
}

const permissionRank: Record<CalendarPermission, number> = { view: 1, edit: 2, manage: 3 }

export async function requireCalendarIdentity(request?: NextRequest): Promise<CallerIdentity & { propertyId: string }> {
  const identity = await getCallerIdentity(request)
  if (!identity) throw new AccessError("Non autenticato", 401)
  if (!identity.propertyId) throw new AccessError("Nessun tenant selezionato", 400)
  return identity as CallerIdentity & { propertyId: string }
}

export function assertCalendarPermission(actual: CalendarPermission, needed: CalendarPermission) {
  if (permissionRank[actual] < permissionRank[needed]) {
    throw new AccessError("Accesso negato al calendario", 403)
  }
}

/**
 * Registra in modo idempotente il calendario demo 4Bid gia' utilizzato dai siti.
 * Non copia eventi: punta allo stesso calendarId Google.
 */
export async function ensurePlatformDemoSource(identity: CallerIdentity & { propertyId: string }) {
  if (!identity.isSuperAdmin || !isPlatformDemoCalendarConfigured()) return
  const calendarId = getPlatformDemoCalendarId()
  if (!calendarId) return

  const service = createServiceClient()
  const { data: existing } = await service
    .from("calendar_sources")
    .select("id")
    .eq("property_id", identity.propertyId)
    .eq("source_kind", "platform_demo")
    .eq("external_calendar_id", calendarId)
    .maybeSingle()
  if (existing?.id) return

  await service.from("calendar_sources").insert({
    property_id: identity.propertyId,
    account_id: null,
    owner_user_id: null,
    provider: "google",
    auth_mode: "service_account",
    source_kind: "platform_demo",
    external_calendar_id: calendarId,
    label: "Demo 4Bid",
    color: "#7c3aed",
    is_active: true,
  })
}

export async function listVisibleCalendarSources(identity: CallerIdentity & { propertyId: string }): Promise<CalendarSource[]> {
  await ensurePlatformDemoSource(identity)
  const service = createServiceClient()

  const { data: owned, error: ownedError } = await service
    .from("calendar_sources")
    .select("id, property_id, account_id, owner_user_id, provider, auth_mode, source_kind, external_calendar_id, label, color, is_active")
    .eq("property_id", identity.propertyId)
    .eq("owner_user_id", identity.userId)
    .eq("source_kind", "personal")
    .eq("is_active", true)
  if (ownedError) throw ownedError

  let sharedRows: any[] = []
  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    const { data, error } = await service
      .from("calendar_sources")
      .select("id, property_id, account_id, owner_user_id, provider, auth_mode, source_kind, external_calendar_id, label, color, is_active")
      .eq("property_id", identity.propertyId)
      .in("source_kind", ["shared", "platform_demo"])
      .eq("is_active", true)
    if (error) throw error
    sharedRows = data || []
  } else if (identity.adminUserId) {
    const { data: grants, error: grantsError } = await service
      .from("calendar_source_grants")
      .select("permission, source:source_id(id, property_id, account_id, owner_user_id, provider, auth_mode, source_kind, external_calendar_id, label, color, is_active)")
      .eq("property_id", identity.propertyId)
      .eq("admin_user_id", identity.adminUserId)
    if (grantsError) throw grantsError
    sharedRows = (grants || [])
      .map((grant: any) => grant.source ? { ...grant.source, permission: grant.permission } : null)
      .filter(Boolean)
  }

  const result = new Map<string, CalendarSource>()
  for (const row of owned || []) result.set(row.id, { ...(row as any), permission: "manage" })
  for (const row of sharedRows) {
    const permission: CalendarPermission = row.permission || "manage"
    if (!result.has(row.id)) result.set(row.id, { ...(row as any), permission })
  }
  return Array.from(result.values())
}

export async function resolveCalendarSource(
  identity: CallerIdentity & { propertyId: string },
  sourceId: string,
  needed: CalendarPermission = "view",
) {
  const sources = await listVisibleCalendarSources(identity)
  const source = sources.find((item) => item.id === sourceId)
  if (!source) throw new AccessError("Calendario non disponibile", 404)
  assertCalendarPermission(source.permission, needed)
  return source
}

export async function accessTokenForSource(source: CalendarSource) {
  if (source.auth_mode !== "oauth" || !source.account_id) throw new Error("calendar_source_not_oauth")
  const service = createServiceClient()
  const { data: account, error } = await service
    .from("calendar_accounts")
    .select("id, oauth_access_token, oauth_refresh_token, oauth_expiry")
    .eq("id", source.account_id)
    .eq("property_id", source.property_id)
    .single()
  if (error || !account) throw error || new Error("calendar_account_not_found")

  const tokens = await ensureGoogleAccessToken(account, async (updated) => {
    const { error: updateError } = await service
      .from("calendar_accounts")
      .update({ ...updated, updated_at: new Date().toISOString() })
      .eq("id", account.id)
    if (updateError) throw updateError
  })
  return tokens.accessToken
}
