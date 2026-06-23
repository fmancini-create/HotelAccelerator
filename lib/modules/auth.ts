/**
 * Helper per capire il ruolo dell'utente corrente ai fini dei moduli.
 *
 * Regola (istruzioni di progetto: "no liberta' admin senza guardrail"):
 *  - super_admin  -> puo' attivare/disattivare qualsiasi modulo.
 *  - tenant_admin -> puo' gestire solo i moduli CORE; i moduli a pagamento
 *                    (category 'product'/'addon') passano da super_admin/Stripe.
 *
 * In sviluppo locale (NODE_ENV=development su host localhost/127.0.0.1) si
 * assume super_admin per consentire i test, riusando la logica di bypass
 * sicura e centralizzata in lib/auth-property.ts (mai su preview pubbliche,
 * mai in produzione).
 */
import type { NextRequest } from "next/server"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { getDevBypass, getTokenFromRequest } from "@/lib/auth-property"

export type PlatformRole = "super_admin" | "tenant_admin" | "none"

/**
 * Determina il ruolo della piattaforma per l'utente corrente.
 */
export async function getPlatformRole(request?: NextRequest): Promise<PlatformRole> {
  if (await getDevBypass(request)) return "super_admin"

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return "none"

  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    return "super_admin"
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("email", user.email)
    .maybeSingle()

  return adminUser?.property_id ? "tenant_admin" : "none"
}
