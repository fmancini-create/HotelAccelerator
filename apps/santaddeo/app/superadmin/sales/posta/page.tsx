import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { MailClient } from "@/components/sales/mail-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"
export const metadata = { title: "Posta - Superadmin SANTADDEO" }

/**
 * Superadmin: posta stile Gmail cross-agente.
 *
 * Mostra le conversazioni email di TUTTI i venditori (scope admin lato API
 * `/api/sales/conversations`). Auth pattern allineato a
 * `app/superadmin/sales/leads/page.tsx`.
 */
export default async function SuperadminMailPage() {
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

  return <MailClient basePath="/superadmin/sales" admin />
}
