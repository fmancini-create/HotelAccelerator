import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { InvoicesManager } from "@/components/superadmin/invoices-manager"

// 19/05/2026: pagina dedicata `/superadmin/invoices`. Stessa logica
// usata in `/superadmin/payments`: scopribile e bookmarkable.
export const dynamic = "force-dynamic"

export default async function SuperAdminInvoicesPage() {
  const sb = await createServiceRoleClient()
  const { data: hotels } = await sb
    .from("hotels")
    .select("id, name")
    .order("name", { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Gestione Fatture</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Crea, modifica, scarica ed elimina le fatture per struttura.
            Registra i pagamenti collegati e gestisci lo stato (pagata,
            scaduta, in attesa).
          </p>
        </div>
        <Link
          href="/superadmin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Pannello SuperAdmin
        </Link>
      </div>

      <InvoicesManager hotels={(hotels ?? []) as { id: string; name: string }[]} />
    </div>
  )
}
