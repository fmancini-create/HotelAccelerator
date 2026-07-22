import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SalesAgentsClient } from "./sales-agents-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"

/**
 * Superadmin: gestione venditori (sales agents).
 *
 * Lista dei venditori con KPI sintetici (n. strutture attive, lead totali,
 * conversion rate). Click apre il dettaglio dove il superadmin gestisce
 * % commissioni e permessi granulari per ogni struttura.
 *
 * Auth pattern allineato a `app/superadmin/page.tsx`: legge SOLO `role`
 * (non `is_superadmin`, colonna spesso NULL) e gestisce v0 preview con un
 * demo superadmin user hardcoded come la pagina madre.
 */
export default async function SuperadminSalesPage() {
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

  return <SalesAgentsClient />
}
