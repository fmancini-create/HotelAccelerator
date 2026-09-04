import type { SupabaseClient } from "@supabase/supabase-js"

export type AuthorizeResult =
  | { authorized: true; destination: "/admin/dashboard" | "/super-admin" }
  | { authorized: false }

/**
 * Decide il contesto iniziale dopo il login senza confondere i due ruoli.
 *
 * Un utente registrato come amministratore di tenant continua ad atterrare
 * nell'area operativa della struttura, anche se possiede anche privilegi di
 * piattaforma: da li' puo' usare il cambio-contesto esplicito. Un collaboratore
 * esclusivamente Super Admin atterra invece direttamente in `/super-admin`.
 */
export async function authorizeUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<AuthorizeResult> {
  const { data: adminUser } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle()

  if (adminUser) {
    return { authorized: true, destination: "/admin/dashboard" }
  }

  if (user.email) {
    const { data: collaborator } = await supabase
      .from("platform_collaborators")
      .select("id, role, is_active")
      .eq("email", user.email)
      .maybeSingle()

    if (collaborator && collaborator.role === "super_admin" && collaborator.is_active) {
      await supabase
        .from("platform_collaborators")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", collaborator.id)

      return { authorized: true, destination: "/super-admin" }
    }
  }

  return { authorized: false }
}
