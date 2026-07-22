import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PaymentsRegistryManager } from "@/components/superadmin/payments-registry-manager"

// 19/05/2026: pagina dedicata `/superadmin/payments`. La gestione era
// gia' disponibile come tab dentro `/superadmin?tab=payments`, ma l'utente
// l'aveva difficolta' a trovarla in mezzo a 17 tab. Pagina autonoma con
// link diretto, header proprio e tutta la cronologia + CRUD pagamenti.
// Auth e' gestita dal layout `/superadmin/layout.tsx` (super_admin only).
//
// 04/06/2026: UNIFICATE le due schede ("Registro Pagamenti" + "Pagamenti su
// Fatture") in un'unica vista. `PaymentsRegistryManager` ora mostra entrambe
// le origini (Manuale / Estratto conto / Fattura) in una sola tabella, con
// filtro per origine e modifica/eliminazione instradata all'endpoint giusto.
// Le tabelle restano fisicamente separate (invoice_payments ha il trigger che
// ricalcola il saldo fattura): l'unione e' a livello di lettura/azione.

export const dynamic = "force-dynamic"

export default async function SuperAdminPaymentsPage() {
  const sb = await createServiceRoleClient()
  const { data: hotels } = await sb
    .from("hotels")
    .select("id, name")
    .order("name", { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Gestione Pagamenti</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Registro unico di tutti i pagamenti: inseriti a mano, importati da estratto conto
            bancario o collegati alle fatture in archivio. Filtra per origine per vedere solo
            una categoria.
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

      <PaymentsRegistryManager hotels={(hotels ?? []) as { id: string; name: string }[]} />
    </div>
  )
}
