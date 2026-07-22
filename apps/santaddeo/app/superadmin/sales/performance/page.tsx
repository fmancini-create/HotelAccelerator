import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SalesPerformanceClient } from "./performance-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"

/**
 * Superadmin: mini-dashboard KPI venditori.
 *
 * Vista comparativa di tutti i venditori con i KPI piu' salienti (data
 * registrazione, ultimo login, utilizzo, prospect, lead, conversioni, deal)
 * per capire chi lavora bene e chi no. Auth pattern allineato a
 * `app/superadmin/sales/page.tsx`.
 */
export default async function SalesPerformancePage() {
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

  return <SalesPerformanceClient />
}
