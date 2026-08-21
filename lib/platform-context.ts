/**
 * Platform-level auth context helpers.
 *
 * Architectural note (from project instructions):
 *  - "I ruoli sono per-tenant, non globali"
 *  - Tenant admins live in `admin_users` (scoped to one property_id)
 *  - Platform-level identities (super_admin) live in `platform_collaborators`
 *    and can operate across tenants via an explicit active-property selection.
 *
 * A super_admin selects which tenant to operate on using the tenant switcher.
 * The selection is persisted in an HTTP-only cookie `ha_active_property_id`,
 * scoped to the current domain. Server helpers read that cookie (or an explicit
 * `?property_id=` query param) to resolve the active tenant for a super_admin.
 *
 * For regular tenant_admin users this file has no effect: their `property_id`
 * continues to come from `admin_users.property_id`.
 */

import type { NextRequest } from "next/server"
import { cookies } from "next/headers"

export const ACTIVE_PROPERTY_COOKIE = "ha_active_property_id"
// One year; the cookie is refreshed on every switch.
export const ACTIVE_PROPERTY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value)
}

/**
 * Read the active property_id override for a super_admin from the request.
 * Priority: explicit ?property_id= query param > cookie. Returns null if none.
 */
export async function readActivePropertyOverride(request?: NextRequest): Promise<string | null> {
  if (request) {
    try {
      const url = new URL(request.url)
      const fromQuery = url.searchParams.get("property_id")
      if (isValidUuid(fromQuery)) return fromQuery
    } catch {
      // ignore malformed URLs
    }

    const cookieHeader = request.headers.get("cookie") || ""
    const match = cookieHeader.match(new RegExp(`(?:^|; )${ACTIVE_PROPERTY_COOKIE}=([^;]+)`))
    if (!match) return null
    const value = decodeURIComponent(match[1])
    return isValidUuid(value) ? value : null
  }

  // Nei Server Component non esiste un NextRequest da passare. Next.js 16
  // espone lo stesso cookie attraverso cookies(), che e' asincrono.
  const cookieStore = await cookies()
  const value = cookieStore.get(ACTIVE_PROPERTY_COOKIE)?.value ?? null
  return isValidUuid(value) ? value : null
}
