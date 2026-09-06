/**
 * CMS tracker auto-injection.
 *
 * HotelAccelerator has two complementary tracking layers:
 * - HAB tracker: live sessions + CRM identity/events inside Accelerator;
 * - Santaddeo Web Traffic: anonymous/aggregated Analytics Intelligence shared
 *   across the suite. When the shared add-on is active, CMS pages get it
 *   automatically as well, so the customer never installs two snippets by hand.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { isModuleActive } from "@/lib/modules"
import { ensureWebTrafficWorkspace, forwardWebTrafficSetup } from "@/lib/web-traffic/federation"

export interface InjectableSite {
  siteId: string
  writeKey: string
}

export interface SharedWebTrafficTracker {
  publicToken: string
  scriptUrl: string
}

type CacheEntry<T> = { value: T | null; expiresAt: number }
const cache = new Map<string, CacheEntry<InjectableSite>>()
const sharedCache = new Map<string, CacheEntry<SharedWebTrafficTracker>>()
const CACHE_TTL_MS = 60_000
const SHARED_CACHE_TTL_MS = 5 * 60_000

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

export async function getSharedWebTrafficTracker(
  propertyId: string,
  tenantName: string,
): Promise<SharedWebTrafficTracker | null> {
  if (!propertyId || !tenantName) return null

  const now = Date.now()
  const hit = sharedCache.get(propertyId)
  if (hit && hit.expiresAt > now) return hit.value

  try {
    const db = createServiceClient()
    if (!(await isModuleActive(db, propertyId, "web_traffic"))) {
      sharedCache.set(propertyId, { value: null, expiresAt: now + SHARED_CACHE_TTL_MS })
      return null
    }

    const workspace = await ensureWebTrafficWorkspace({ externalTenantId: propertyId, tenantName })
    const setup = await forwardWebTrafficSetup(workspace.santaddeoHotelId)
    const payload = setup.payload as { publicToken?: unknown; scriptUrl?: unknown; error?: unknown }
    const value =
      setup.status === 200 && typeof payload.publicToken === "string" && typeof payload.scriptUrl === "string"
        ? { publicToken: payload.publicToken, scriptUrl: payload.scriptUrl }
        : null

    if (!value) {
      console.error("[tracking/cms-injection] shared tracker setup failed", {
        propertyId,
        status: setup.status,
        error: payload.error,
      })
    }
    sharedCache.set(propertyId, { value, expiresAt: now + SHARED_CACHE_TTL_MS })
    return value
  } catch (error) {
    // Tracking must never make the customer's website unavailable.
    console.error("[tracking/cms-injection] shared tracker lookup failed", {
      propertyId,
      error: error instanceof Error ? error.message : "unknown",
    })
    sharedCache.set(propertyId, { value: null, expiresAt: now + CACHE_TTL_MS })
    return null
  }
}
