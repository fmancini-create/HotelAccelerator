import type { SupabaseClient } from "@supabase/supabase-js"
import {
  hasActiveTimeClockRequirement,
  isMobileBrowser,
  shouldPromptDesktopTimeClock,
  shouldRouteToMobileTimeClock,
} from "@/lib/auth/mobile-login-gate"

export type AuthorizeResult =
  | {
      authorized: true
      destination:
        | "/admin/dashboard"
        | "/admin/dashboard?time_clock_prompt=1"
        | "/admin/time-clock"
        | "/super-admin"
    }
  | { authorized: false }

type AuthorizeOptions = {
  /**
   * Il callback OAuth gira sul server e passa esplicitamente il risultato della
   * User-Agent detection. Login password e /admin possono ometterlo: nel browser
   * usiamo viewport + User-Agent.
   */
  mobile?: boolean
}

type TimeClockLoginDestination =
  | "/admin/time-clock"
  | "/admin/dashboard?time_clock_prompt=1"
  | null

async function timeClockLoginDestination(
  supabase: SupabaseClient,
  propertyId: string,
  adminUserId: string,
  mobile: boolean,
): Promise<TimeClockLoginDestination> {
  const [moduleResult, employeeResult] = await Promise.all([
    supabase
      .from("tenant_modules")
      .select("status,expires_at")
      .eq("property_id", propertyId)
      .eq("module_key", "hr")
      .maybeSingle(),
    supabase
      .from("hr_employees")
      .select("id,employment_status,requires_time_clock")
      .eq("property_id", propertyId)
      .eq("admin_user_id", adminUserId)
      .maybeSingle(),
  ])

  // HR non deve diventare un single point of failure del login. Se una lettura
  // fallisce, manteniamo la destinazione standard e registriamo il guasto.
  if (moduleResult.error || employeeResult.error) {
    console.error("[auth] HR time-clock login lookup failed", {
      property_id: propertyId,
      admin_user_id: adminUserId,
      module_error: moduleResult.error?.message,
      employee_error: employeeResult.error?.message,
    })
    return null
  }

  const requirement = {
    moduleStatus: moduleResult.data?.status,
    moduleExpiresAt: moduleResult.data?.expires_at,
    employmentStatus: employeeResult.data?.employment_status,
    requiresTimeClock: employeeResult.data?.requires_time_clock,
  }

  if (!hasActiveTimeClockRequirement(requirement)) return null

  // Mobile mantiene il comportamento vincolante gia' in produzione: si passa
  // dalla schermata presenza, che propone entrata oppure uscita in base allo stato.
  if (shouldRouteToMobileTimeClock({ ...requirement, mobile })) {
    return "/admin/time-clock"
  }

  const employeeId = employeeResult.data?.id
  if (!employeeId) return null

  // Desktop: il promemoria serve soltanto quando manca un check-in aperto.
  // La query resta esplicitamente tenant + employee scoped anche se RLS applica
  // gia' il confine property.
  const openEntryResult = await supabase
    .from("hr_time_entries")
    .select("id")
    .eq("property_id", propertyId)
    .eq("employee_id", employeeId)
    .is("clock_out_at", null)
    .limit(1)

  if (openEntryResult.error) {
    console.error("[auth] desktop HR open time-entry lookup failed", {
      property_id: propertyId,
      admin_user_id: adminUserId,
      employee_id: employeeId,
      error: openEntryResult.error.message,
    })
    return null
  }

  if (
    shouldPromptDesktopTimeClock({
      ...requirement,
      mobile,
      hasOpenTimeEntry: (openEntryResult.data?.length ?? 0) > 0,
    })
  ) {
    return "/admin/dashboard?time_clock_prompt=1"
  }

  return null
}

/**
 * Decide il contesto iniziale dopo il login senza confondere i due ruoli.
 *
 * Un utente registrato come amministratore di tenant continua ad atterrare
 * nell'area operativa della struttura, anche se possiede anche privilegi di
 * piattaforma: da li' puo' usare il cambio-contesto esplicito. Un collaboratore
 * esclusivamente Super Admin atterra invece direttamente in `/super-admin`.
 *
 * Per gli utenti tenant con `requires_time_clock=true`:
 * - smartphone: gate su `/admin/time-clock`;
 * - desktop senza check-in aperto: dashboard + promemoria non bloccante;
 * - desktop con check-in aperto: dashboard normale.
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
    if (adminUser.property_id) {
      const destination = await timeClockLoginDestination(
        supabase,
        adminUser.property_id,
        adminUser.id,
        mobile,
      )
      if (destination) return { authorized: true, destination }
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
