import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Helper riutilizzato dalle API di area-manager.
 *
 * Risolve l'agente capo area corrente, ammettendo l'impersonation da parte
 * del super-admin tramite query/body param. Tutte le validazioni delegate
 * lato DB (is_active, is_area_manager).
 *
 * Ritorna:
 *  - { error: NextResponse } se 401/403 (chiamante non autorizzato)
 *  - { areaManagerId, userId, isImpersonating } in caso di successo
 */
export async function requireAreaManager(
  request: Request,
  opts?: { allowSuperAdminImpersonation?: boolean },
): Promise<
  | { error: NextResponse }
  | {
      areaManagerId: string
      userId: string
      isImpersonating: boolean
    }
> {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  // Super-admin impersonation: solo se permesso.
  if (opts?.allowSuperAdminImpersonation && profile?.role === "super_admin") {
    const url = new URL(request.url)
    const override = url.searchParams.get("area_manager_id")
    if (override) {
      const { data: target } = await svc
        .from("sales_agents")
        .select("id, is_area_manager, is_active")
        .eq("id", override)
        .maybeSingle()
      if (target?.is_area_manager && target?.is_active) {
        return { areaManagerId: target.id, userId: user.id, isImpersonating: true }
      }
    }
  }

  const { data: me } = await svc
    .from("sales_agents")
    .select("id, is_area_manager, is_active")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!me || !me.is_active || !me.is_area_manager) {
    return {
      error: NextResponse.json(
        { error: "forbidden", details: "Solo i capi area possono accedere a questa risorsa." },
        { status: 403 },
      ),
    }
  }

  return { areaManagerId: me.id, userId: user.id, isImpersonating: false }
}
