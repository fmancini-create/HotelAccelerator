import type { SupabaseClient } from "@supabase/supabase-js"
import { isMobileBrowser, shouldRouteToMobileTimeClock } from "@/lib/auth/mobile-login-gate"

export type AuthorizeResult =
  | { authorized: true; destination: "/admin/dashboard" | "/admin/time-clock" | "/super-admin" }
  | { authorized: false }

type AuthorizeOptions = {
  /**
   * Il callback OAuth gira sul server e passa esplicitamente il risultato della
   * User-Agent detection. Login password e /admin possono ometterlo: nel browser
   * usiamo viewport + User-Agent.
   */
  mobile?: boolean
}

async function requiresMobileTimeClock(
  supabase: SupabaseClient,
  propertyId: string,
  adminUserId: string,
  mobile: boolean,
): Promise<boolean> {
  if (!mobile) return false

  const [moduleResult, employeeResult] = await Promise.all([
    supabase
      .from("tenant_modules")
      .select("status,expires_at")
      .eq("property_id", propertyId)
      .eq("module_key", "hr")
      .maybeSingle(),
    supabase
      .from("hr_employees")
      .select("employment_status,requires_time_clock")
      .eq("property_id", propertyId)
      .eq("admin_user_id", adminUserId)
      .maybeSingle(),
  ])

  // Il modulo HR non deve diventare un single point of failure del login. Se la
  // lettura fallisce, manteniamo la destinazione standard e lasciamo traccia nei
  // log invece di bloccare l'intera piattaforma.
  if (moduleResult.error || employeeResult.error) {
    console.error("[auth] mobile HR time-clock gate lookup failed", {
      property_id: propertyId,
      admin_user_id: adminUserId,
      module_error: moduleResult.error?.message,
      employee_error: employeeResult.error?.message,
    })
    return false
  }

  return shouldRouteToMobileTimeClock({
    mobile,
    moduleStatus: moduleResult.data?.status,
    moduleExpiresAt: moduleResult.data?.expires_at,
    employmentStatus: employeeResult.data?.employment_status,
    requiresTimeClock: employeeResult.data?.requires_time_clock,
  })
}

/**
 * Decide il contesto iniziale dopo il login senza confondere i due ruoli.
 *
 * Un utente registrato come amministratore di tenant continua ad atterrare
 * nell'area operativa della struttura, anche se possiede anche privilegi di
 * piattaforma: da li' puo' usare il cambio-contesto esplicito. Un collaboratore
 * esclusivamente Super Admin atterra invece direttamente in `/super-admin`.
 *
 * Per i soli utenti tenant che hanno `requires_time_clock=true`, un login da
 * smartphone passa prima da `/admin/time-clock`; il desktop resta invariato.
 */
export async function authorizeUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  options: AuthorizeOptions = {},
): Promise<AuthorizeResult> {
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id,property_id")
    .eq("id", user.id)
    .maybeSingle()

  if (adminUser) {
    const mobile = typeof options.mobile === "boolean" ? options.mobile : isMobileBrowser()
    if (
      adminUser.property_id &&
      (await requiresMobileTimeClock(supabase, adminUser.property_id, adminUser.id, mobile))
    ) {
      return { authorized: true, destination: "/admin/time-clock" }
    }

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
