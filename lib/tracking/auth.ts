/**
 * Tracking ingestion auth.
 *
 * The browser tracker authenticates with a PUBLIC write_key (not a secret).
 * Because it's public we harden the write path with:
 *   - Origin pinning: write_key is only accepted from origins the tenant has
 *     explicitly allow-listed on the tracking_site row.
 *   - Active flag: flipping is_active=false immediately kills ingestion
 *     without rotating the key.
 *   - Service-role lookup: RLS is ignored for validation reads; we only surface
 *     the property_id + site_id back to the caller.
 *
 * An in-memory cache avoids hitting the DB on every pageview. TTL 60s is short
 * enough that flipping is_active or editing allowed_origins takes effect
 * promptly; anything longer makes admin UX annoying.
 */
import { createServiceClient } from "@/lib/supabase/server"

export interface TrackingSiteAuth {
  siteId: string
  propertyId: string
  allowedOrigins: string[]
  /**
   * Tenant-owned hosts auto-allowed without being explicitly listed in
   * allowed_origins. Populated from properties.subdomain + custom_domain so
   * CMS pages served from our own infrastructure are tracked out-of-the-box.
   */
  tenantHosts: string[]
  isActive: boolean
  name: string
}

type CacheEntry = { value: TrackingSiteAuth | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

/** Extract the Origin header's scheme+host (lowercased), or null if unavailable. */
export function normaliseOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null
  try {
    const u = new URL(origin)
    return `${u.protocol}//${u.host}`.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Look up a tracking_site by public write_key. Cached briefly.
 * Returns null when key doesn't exist or site was deleted.
 */
export async function getTrackingSiteByKey(writeKey: string): Promise<TrackingSiteAuth | null> {
  if (!writeKey || typeof writeKey !== "string") return null

  const now = Date.now()
  const hit = cache.get(writeKey)
  if (hit && hit.expiresAt > now) return hit.value

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("tracking_sites")
    .select(
      `id, property_id, allowed_origins, is_active, name,
       property:properties!tracking_sites_property_id_fkey ( subdomain, custom_domain )`,
    )
    .eq("write_key", writeKey)
    .maybeSingle()

  if (error) {
    console.error("[tracking/auth] lookup failed", error)
    return null
  }

  let value: TrackingSiteAuth | null = null
  if (data) {
    // Supabase's FK join returns an object for to-one relations, but the
    // typing can surface as array | object depending on inference. Normalise.
    const prop: { subdomain?: string | null; custom_domain?: string | null } =
      Array.isArray((data as any).property) ? (data as any).property[0] ?? {} : (data as any).property ?? {}
    const tenantHosts: string[] = []
    if (prop.custom_domain) tenantHosts.push(prop.custom_domain.toLowerCase())
    if (prop.subdomain) {
      // Subdomains are hosted under the platform apex; include both apex and www.
      const apex = process.env.NEXT_PUBLIC_PLATFORM_APEX ?? "hotelaccelerator.com"
      tenantHosts.push(`${prop.subdomain.toLowerCase()}.${apex.toLowerCase()}`)
    }

    value = {
      siteId: data.id,
      propertyId: data.property_id,
      allowedOrigins: (data.allowed_origins ?? []).map((o: string) => o.toLowerCase()),
      tenantHosts,
      isActive: data.is_active,
      name: data.name,
    }
  }

  cache.set(writeKey, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

/**
 * Returns whether the Origin is permitted by the site's allow list.
 *
 * Matching rules:
 *  - Exact match on scheme+host (case-insensitive).
 *  - The special value "*" allows any origin. Intended only for dev; surfaced
 *    clearly in the admin UI as "insecure".
 *  - A leading "*." acts as a subdomain wildcard (e.g. "*.example.com" matches
 *    "https://a.example.com" and "https://a.b.example.com").
 */
export function isOriginAllowed(origin: string | null, allowList: string[], tenantHosts: string[] = []): boolean {
  const o = normaliseOrigin(origin)
  if (!o) return false

  // Auto-allow the tenant's own hosts (custom_domain, subdomain.platform).
  // This is what makes the CMS "just work": pages served from ibarronci.com
  // can post to /api/track without the admin pre-populating allowed_origins.
  try {
    const { host } = new URL(o)
    for (const h of tenantHosts) {
      const hh = h.toLowerCase()
      if (host === hh || host === `www.${hh}`) return true
    }
  } catch {
    /* ignore */
  }

  for (const raw of allowList) {
    const entry = raw.trim().toLowerCase()
    if (!entry) continue
    if (entry === "*") return true

    // Wildcard subdomain: "*.example.com" or "https://*.example.com"
    if (entry.includes("*.")) {
      const bareHost = entry.replace(/^https?:\/\//, "").replace(/^\*\./, "")
      try {
        const { host } = new URL(o)
        if (host === bareHost || host.endsWith("." + bareHost)) return true
      } catch {
        /* ignore */
      }
      continue
    }

    // Accept bare hosts ("example.com") as well as full origins ("https://example.com").
    const withScheme = entry.startsWith("http://") || entry.startsWith("https://") ? entry : `https://${entry}`
    if (o === normaliseOrigin(withScheme)) return true
  }
  return false
}

export type AuthResult =
  | { ok: true; site: TrackingSiteAuth; origin: string }
  | { ok: false; status: number; error: string }

/**
 * End-to-end auth for a tracking write request. Accepts write_key either from
 * the `x-tracking-key` header (preferred) or the `key` field of the body.
 * Uses Origin header; falls back to Referer (parsed) to support beacon-only
 * clients that strip Origin on same-origin-ish navigations.
 */
export async function authenticateTrackingRequest(
  req: Request,
  keyFromBody: string | undefined,
): Promise<AuthResult> {
  const headerKey = req.headers.get("x-tracking-key") ?? undefined
  const key = headerKey || keyFromBody
  if (!key) return { ok: false, status: 401, error: "missing write_key" }

  const originHeader = req.headers.get("origin")
  const referer = req.headers.get("referer")
  const origin = normaliseOrigin(originHeader) || normaliseOrigin(referer)
  if (!origin) return { ok: false, status: 400, error: "missing Origin" }

  const site = await getTrackingSiteByKey(key)
  if (!site) return { ok: false, status: 401, error: "invalid write_key" }
  if (!site.isActive) return { ok: false, status: 403, error: "site disabled" }
  if (!isOriginAllowed(origin, site.allowedOrigins, site.tenantHosts)) {
    return { ok: false, status: 403, error: "origin not allowed" }
  }

  return { ok: true, site, origin }
}

/** Build a CORS response header bag matching the validated origin. */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-tracking-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

/** Parse a User-Agent string into coarse device/browser/os labels. */
export function parseUserAgent(ua: string | null): { deviceType: string; browser: string; os: string } {
  const s = (ua || "").toLowerCase()
  let deviceType = "desktop"
  if (/bot|crawler|spider|crawling/i.test(s)) deviceType = "bot"
  else if (/tablet|ipad/i.test(s)) deviceType = "tablet"
  else if (/mobi|iphone|android.*mobile/i.test(s)) deviceType = "mobile"

  let browser = "other"
  if (s.includes("edg/")) browser = "Edge"
  else if (s.includes("chrome/") && !s.includes("chromium")) browser = "Chrome"
  else if (s.includes("safari/") && !s.includes("chrome/")) browser = "Safari"
  else if (s.includes("firefox/")) browser = "Firefox"

  let os = "other"
  if (s.includes("windows")) os = "Windows"
  else if (s.includes("mac os") || s.includes("macintosh")) os = "macOS"
  else if (s.includes("iphone") || s.includes("ipad")) os = "iOS"
  else if (s.includes("android")) os = "Android"
  else if (s.includes("linux")) os = "Linux"

  return { deviceType, browser, os }
}

/** Extract client IP from request headers. */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  const real = req.headers.get("x-real-ip")
  return real || null
}
