import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { UnmatchedMailClient } from "@/components/sales/unmatched-mail-client"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"
export const metadata = { title: "Posta non abbinata - Superadmin SANTADDEO" }

/**
 * Superadmin: coda di revisione della posta NON abbinata.
 *
 * Mostra le email arrivate sugli indirizzi venditore (es. noreply@santaddeo.com
 * dove confluiscono gli alias) che non si sono agganciate ad alcun lead. Il
 * super admin puo' creare un contatto (assegnandolo a un venditore) o archiviare.
 * Auth pattern allineato a `app/superadmin/sales/leads/page.tsx`.
 */
export default async function SuperadminUnmatchedMailPage() {
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

  return <UnmatchedMailClient />
}
