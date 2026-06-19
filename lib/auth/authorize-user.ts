import type { SupabaseClient } from "@supabase/supabase-js"

export type AuthorizeResult =
  | { authorized: true; destination: "/admin/dashboard" | "/super-admin" }
  | { authorized: false }

/**
 * Shared authorization gate applied AFTER a successful Supabase sign-in
 * (password or OAuth). It decides where the authenticated user may go:
 *
 *  - row in `admin_users` (matched by auth user id) -> tenant admin
 *  - else row in `platform_collaborators` (matched by email) with
 *    role 'super_admin' and is_active = true -> super admin
 *  - otherwise NOT authorized (caller must sign the user out)
 *
 * Works with both the browser and the server Supabase clients.
 */
export async function authorizeUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<AuthorizeResult> {
  // Tenant admin?
  const { data: adminUser } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle()

  if (adminUser) {
    return { authorized: true, destination: "/admin/dashboard" }
  }

  // Super admin?
  if (user.email) {
    const { data: collaborator } = await supabase
      .from("platform_collaborators")
      .select("id, role, is_active")
      .eq("email", user.email)
      .maybeSingle()

    if (collaborator && collaborator.role === "super_admin" && collaborator.is_active) {
      // Best-effort last login update (non-blocking for the auth decision).
      await supabase
        .from("platform_collaborators")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", collaborator.id)

      return { authorized: true, destination: "/super-admin" }
    }
  }

  return { authorized: false }
}
