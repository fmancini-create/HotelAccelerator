export interface AdminUser {
  id?: string
  email: string
  name: string
  role: "super_admin" | "admin" | "editor"
  can_upload: boolean
  can_delete: boolean
  can_move: boolean
  can_manage_users: boolean
  can_manage_categories?: boolean
  property_id?: string
  created_at?: string
  updated_at?: string
}

export interface PlatformMePayload {
  role?: "super_admin" | "tenant_admin" | "member" | "none"
  memberRole?: string | null
  adminUserId?: string | null
  email?: string | null
  name?: string | null
  activePropertyId?: string | null
  canUpload?: boolean
  canDelete?: boolean
  canMove?: boolean
  canManageUsers?: boolean
}

/**
 * Adatta l'identita' unica della piattaforma alle pagine amministrative
 * storiche. Un superadmin non deve avere una riga fittizia in admin_users:
 * ruolo globale e tenant selezionato arrivano da /api/platform/me.
 */
export function adminUserFromPlatformMe(payload: PlatformMePayload): AdminUser | null {
  if (!payload.email || !payload.role || payload.role === "none") return null

  const isSuperAdmin = payload.role === "super_admin"
  const role: AdminUser["role"] = isSuperAdmin
    ? "super_admin"
    : payload.role === "tenant_admin"
      ? "admin"
      : "editor"

  return {
    id: payload.adminUserId ?? undefined,
    email: payload.email,
    name: payload.name?.trim() || payload.email,
    role,
    property_id: payload.activePropertyId ?? undefined,
    can_upload: isSuperAdmin || payload.canUpload === true,
    can_delete: isSuperAdmin || payload.canDelete === true,
    can_move: isSuperAdmin || payload.canMove === true,
    can_manage_users: isSuperAdmin || payload.canManageUsers === true,
  }
}
