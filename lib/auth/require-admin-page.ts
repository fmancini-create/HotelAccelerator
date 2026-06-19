import { redirect } from "next/navigation"
import { getCallerIdentity } from "@/lib/auth/admin-access"

/**
 * Server-side guard for admin-only pages (users, settings, modules, channels).
 *
 * Hiding nav items is not enough: a non-admin member could still reach the page
 * by typing the URL. This enforces, at the server level, that only super_admins
 * and tenant admins can render these sections. Non-admins are bounced to the
 * dashboard; unauthenticated users to the login gate.
 *
 * The underlying API routes are independently protected (requireTenantAdmin),
 * so this is defense-in-depth for the UI, not the only line of defense.
 */
export async function requireAdminPage(): Promise<void> {
  const identity = await getCallerIdentity()

  if (!identity) {
    redirect("/admin")
  }

  if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
    redirect("/admin/dashboard")
  }
}
