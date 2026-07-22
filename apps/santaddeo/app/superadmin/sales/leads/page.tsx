import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { LeadsAdminClient } from "./leads-admin-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"

/**
 * Superadmin: gestione globale lead.
 *
 * Vista cross-agent con filtri (per agente / status / search).
 * Permette riassegnazione e import CSV bulk.
 *
 * Auth pattern allineato a `app/superadmin/page.tsx`.
 */
export default async function SuperadminLeadsPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  if (!isV0Preview) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) redirect("/auth/sign-in")

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"
    if (!isSuperAdmin) redirect("/dashboard")
  }

  return <LeadsAdminClient />
}
