import "server-only"

import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedUserEmail, getDevBypass } from "@/lib/auth-property"

export class ScoutBillingAccessDenied extends Error {
  status = 403

  constructor() {
    super("Solo un amministratore del tenant può modificare le impostazioni economiche Scout.")
    this.name = "ScoutBillingAccessDenied"
  }
}

/** Financial settings must be authorized against the active tenant, not merely
 * against another admin_users row that happens to share the same email. */
export async function requireScoutBillingAdmin(
  db: SupabaseClient,
  request: NextRequest,
  propertyId: string,
): Promise<string> {
  if (await getDevBypass(request)) return "dev@hotelaccelerator.local"

  const email = await getAuthenticatedUserEmail(request)

  const { data: collaborator, error: collaboratorError } = await db
    .from("platform_collaborators")
    .select("role,is_active")
    .eq("email", email)
    .maybeSingle()
  if (collaboratorError) throw collaboratorError
  if (collaborator?.role === "super_admin" && collaborator.is_active === true) return email

  const { data: member, error: memberError } = await db
    .from("admin_users")
    .select("role,is_tenant_admin")
    .eq("property_id", propertyId)
    .eq("email", email)
    .maybeSingle()
  if (memberError) throw memberError

  const allowed =
    member?.is_tenant_admin === true ||
    ["admin", "owner", "super_admin"].includes(String(member?.role ?? ""))

  if (!allowed) throw new ScoutBillingAccessDenied()
  return email
}
