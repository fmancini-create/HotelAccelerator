import { redirect } from "next/navigation"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { DemoRequestsManager } from "@/components/superadmin/demo-requests-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Richieste demo - SuperAdmin" }

export default async function DemoRequestsPage() {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <main className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Richieste di demo</h1>
          <p className="text-muted-foreground">
            Accetta o rifiuta le richieste dei venditori per pianificare una demo. Accettando, l&apos;evento
            viene aggiunto al calendario clienti@4bid.it.
          </p>
        </div>
        <DemoRequestsManager />
      </main>
    </div>
  )
}
