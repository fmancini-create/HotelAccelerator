/**
 * Helper centralizzato per ottenere la lista email dei superadmin attivi.
 *
 * Pattern consolidato in: /api/cron/pricing-health, /api/auth/signup,
 * /api/request-info, /api/team/invite (notifica superadmin), ecc.
 *
 * Logica:
 *   1. Query `profiles` WHERE `is_active = true` AND role IN
 *      ('super_admin', 'superadmin') — supporto al doppio enum legacy.
 *   2. Filtra email validi (string + presenza '@').
 *   3. Se array vuoto: fallback a `process.env.ADMIN_EMAIL` o
 *      `'info@santaddeo.com'`. Logga warning per visibilità ops.
 *
 * Sempre usato col service-role client per bypassare RLS (la tabella
 * profiles ha una policy che impedisce SELECT a non-superadmin).
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export interface GetSuperAdminEmailsOptions {
  /**
   * Se true, ritorna array vuoto invece del fallback. Utile quando il
   * caller vuole gestire l'assenza di superadmin in modo diverso (es.
   * skip dell'invio email).
   */
  noFallback?: boolean
}

const FALLBACK_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@santaddeo.com"

export async function getSuperAdminEmails(
  options: GetSuperAdminEmailsOptions = {},
): Promise<string[]> {
  try {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("is_active", true)
      .or("role.eq.super_admin,role.eq.superadmin")

    if (error) {
      console.warn(
        "[getSuperAdminEmails] DB error:",
        error.message,
        "— using fallback",
      )
      return options.noFallback ? [] : [FALLBACK_ADMIN_EMAIL]
    }

    const emails = (data || [])
      .map((p) => p.email)
      .filter((e): e is string => typeof e === "string" && e.includes("@"))

    if (emails.length === 0) {
      if (options.noFallback) {
        console.warn(
          "[getSuperAdminEmails] No active super_admin found, returning empty array (noFallback)",
        )
        return []
      }
      console.warn(
        "[getSuperAdminEmails] No active super_admin found, falling back to:",
        FALLBACK_ADMIN_EMAIL,
      )
      return [FALLBACK_ADMIN_EMAIL]
    }

    return emails
  } catch (e) {
    console.error(
      "[getSuperAdminEmails] Unexpected error:",
      e instanceof Error ? e.message : String(e),
    )
    return options.noFallback ? [] : [FALLBACK_ADMIN_EMAIL]
  }
}
