import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SellerBroadcastClient } from "@/components/superadmin/seller-broadcast-client"
import { SellerBroadcastHistory } from "@/components/superadmin/seller-broadcast-history"

// Force dynamic rendering: il check auth dipende dai cookies della richiesta.
export const dynamic = "force-dynamic"
export const metadata = { title: "Comunicazioni venditori - Superadmin SANTADDEO" }

/**
 * Superadmin: invio di una comunicazione email a uno o piu' venditori.
 *
 * Selezione manuale dei destinatari; ogni venditore riceve una copia
 * individuale (no CC). Auth pattern allineato a
 * `app/superadmin/sales/posta/page.tsx`.
 */
export default async function SellerBroadcastPage() {
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground text-balance">Comunicazioni venditori</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invia una email a uno o più venditori selezionati. Ognuno riceve una copia personalizzata.
        </p>
      </header>
      <SellerBroadcastClient />
      <SellerBroadcastHistory />
    </div>
  )
}
