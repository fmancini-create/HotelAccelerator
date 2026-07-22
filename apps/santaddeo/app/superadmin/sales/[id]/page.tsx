import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { AgentDetailClient } from "./agent-detail-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"

/**
 * Superadmin: dettaglio venditore.
 *
 * Auth pattern allineato a `app/superadmin/page.tsx` (la pagina madre che
 * funziona): in v0 preview usa demo superadmin hardcoded, in produzione usa
 * `getUser()` + check su `role`. NON usa la colonna `is_superadmin`: il
 * pattern legacy che la usava redirectava a /dashboard quando il profile
 * aveva `is_superadmin=NULL` ma `role='super_admin'` (caso comune).
 */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  let userId: string
  if (isV0Preview) {
    userId = "5de43b7b-e661-4e4e-8177-7943df06470c"
  } else {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) redirect("/auth/sign-in")
    userId = user.id

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single()
    const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"
    if (!isSuperAdmin) redirect("/dashboard")
  }

  return <AgentDetailClient agentId={id} />
}
