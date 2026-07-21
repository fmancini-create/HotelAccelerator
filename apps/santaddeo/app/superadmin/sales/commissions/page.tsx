import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { CommissionsManagerClient } from "./commissions-manager-client"

export const dynamic = "force-dynamic"

/**
 * Superadmin: gestione ledger commissioni venditori (4 stati).
 *
 * Vista globale: tutte le righe del ledger di tutti i venditori, con KPI e
 * azioni in batch (segna come liquidata, void, ecc.). Per gestire la STORIA
 * della % commissione di un venditore su un hotel vai dal dettaglio venditore
 * (/superadmin/sales/[id]).
 */
export default async function SuperadminCommissionsPage() {
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

  return <CommissionsManagerClient />
}
