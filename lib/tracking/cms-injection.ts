/**
 * CMS tracker auto-injection.
 *
 * When a tenant serves a page from our CMS (custom_domain or subdomain), we
 * inject the tracker automatically using the tenant's default tracking_site.
 * Admins get zero-config tracking on everything we host; the only moment they
 * need to touch /admin/tracking/sites is to activate the site (is_active=true).
 *
 * Selection rules:
 *   1. The property must have at least one tracking_site with is_active=true.
 *   2. If multiple sites exist, the one with is_default=true wins.
 *   3. If no default is set, the oldest active site is used as a fallback.
 *
 * Returned shape is intentionally minimal so the layout can inline a tiny
 * <Script> snippet without additional data fetches on the client.
 */
import { createServiceClient } from "@/lib/supabase/server"

export interface InjectableSite {
  siteId: string
  writeKey: string
}

// Per-property cache with a short TTL. The layout renders per-request but this
// avoids hammering Supabase when a tenant has heavy traffic.
type CacheEntry = { value: InjectableSite | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

export async function getDefaultTrackingSite(propertyId: string): Promise<InjectableSite | null> {
  if (!propertyId) return null

  const now = Date.now()
  const hit = cache.get(propertyId)
  if (hit && hit.expiresAt > now) return hit.value

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("tracking_sites")
    .select("id, write_key, is_default, created_at")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)

  if (error) {
    console.error("[tracking/cms-injection] lookup failed", error)
    cache.set(propertyId, { value: null, expiresAt: now + CACHE_TTL_MS })
    return null
  }

  const row = data?.[0]
  const value: InjectableSite | null = row ? { siteId: row.id, writeKey: row.write_key } : null
  cache.set(propertyId, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}
