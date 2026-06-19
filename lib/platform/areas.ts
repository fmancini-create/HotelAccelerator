/**
 * Platform area catalog.
 *
 * An "area" is a top-level section of the admin app (Inbox, CRM, CMS, Photos,
 * Tracking, ...). Historically only CHANNELS were permissioned; areas were
 * reachable by anyone who could load the page. This catalog is the single
 * source of truth used by:
 *   - the per-user / per-group permission matrices (UI),
 *   - the nav filtering in the platform header,
 *   - the server-side page guards (requireAreaPage).
 *
 * Keys are stable strings stored in `user_area_permissions.area_key` and
 * `group_area_permissions.area_key`. Do NOT rename a key without a data
 * migration.
 */

export type AreaGroup = "operative" | "config"

export interface PlatformArea {
  /** Stable identifier persisted in the DB. */
  key: string
  /** Human label (Italian UI). */
  label: string
  /** Grouping used to organize the permission matrix. */
  group: AreaGroup
  /** Primary route of the area (used by guards / nav). */
  href: string
  /**
   * Baseline areas are always available to every authenticated member and are
   * NOT shown in the grant matrix (you can't take them away).
   */
  baseline?: boolean
  /**
   * Admin-only areas are reserved to super_admins / tenant admins and are NOT
   * grantable to regular members (kept out of the matrix). Used for privilege-
   * sensitive sections (user management, billing, platform config).
   */
  adminOnly?: boolean
}

export const PLATFORM_AREAS: PlatformArea[] = [
  // --- Baseline (always on for everyone) ---
  { key: "dashboard", label: "Dashboard", group: "operative", href: "/admin/dashboard", baseline: true },
  { key: "inbox", label: "Inbox", group: "operative", href: "/admin/inbox", baseline: true },
  { key: "profile", label: "Il Mio Profilo", group: "operative", href: "/admin/profile", baseline: true },
  { key: "settings", label: "Impostazioni", group: "operative", href: "/admin/settings", baseline: true },

  // --- Operative areas (grantable to members) ---
  { key: "crm", label: "CRM", group: "operative", href: "/admin/crm" },
  { key: "todos", label: "Todos", group: "operative", href: "/admin/todos" },
  { key: "photos", label: "Foto", group: "operative", href: "/admin/photos" },
  { key: "gallery", label: "Gallery", group: "operative", href: "/admin/gallery" },
  { key: "categories", label: "Categorie", group: "operative", href: "/admin/categories" },
  { key: "message-rules", label: "Smart Messages", group: "operative", href: "/admin/message-rules" },
  { key: "marketing", label: "Marketing", group: "operative", href: "/admin/marketing" },

  // --- Content / config areas (grantable to members) ---
  { key: "cms", label: "CMS", group: "config", href: "/admin/cms" },
  { key: "embed-scripts", label: "Embed scripts", group: "config", href: "/admin/embed-scripts" },
  { key: "tracking", label: "Tracking", group: "config", href: "/admin/tracking" },
  { key: "monitoring", label: "Monitoring", group: "config", href: "/admin/monitoring" },

  // --- Admin-only areas (never grantable to members) ---
  { key: "users", label: "Gestione Utenti", group: "config", href: "/admin/users", adminOnly: true },
  { key: "modules", label: "Moduli", group: "config", href: "/admin/modules", adminOnly: true },
  { key: "billing", label: "Abbonamento & Fatturazione", group: "config", href: "/admin/billing", adminOnly: true },
]

/** Area keys always available to every authenticated member. */
export const BASELINE_AREA_KEYS: string[] = PLATFORM_AREAS.filter((a) => a.baseline).map((a) => a.key)

/** Set of all valid area keys (for input validation). */
export const ALL_AREA_KEYS: Set<string> = new Set(PLATFORM_AREAS.map((a) => a.key))

/** Areas an admin can grant/revoke for members (excludes baseline + adminOnly). */
export function getGrantableAreas(): PlatformArea[] {
  return PLATFORM_AREAS.filter((a) => !a.baseline && !a.adminOnly)
}

/** Set of grantable area keys (used to sanitize incoming permission payloads). */
export const GRANTABLE_AREA_KEYS: Set<string> = new Set(getGrantableAreas().map((a) => a.key))

/** Lookup helper. */
export function getAreaByKey(key: string): PlatformArea | undefined {
  return PLATFORM_AREAS.find((a) => a.key === key)
}
