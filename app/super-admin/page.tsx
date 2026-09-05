import Link from "next/link"
import { BarChart3, ShieldCheck } from "lucide-react"

import { PlatformOverviewPanel } from "@/components/platform/platform-overview-panel"

/** Dashboard esclusiva del Super Admin di piattaforma. */
export default function SuperAdminIndexPage() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-7 border-b border-border pb-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Super Admin · Piattaforma
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Dashboard piattaforma
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Vista aggregata di HotelAccelerator: tenant, ricavi, utenti, utilizzo e stato operativo. I dati di una singola struttura non vengono mescolati in questo cruscotto.
        </p>
      </header>

      <Link
        href="/super-admin/analytics"
        className="mb-6 flex items-center justify-between rounded-xl border bg-background p-4 transition hover:border-foreground/20 hover:shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2"><BarChart3 className="h-5 w-5" aria-hidden /></div>
          <div>
            <div className="font-medium">Analytics della suite</div>
            <div className="text-sm text-muted-foreground">Visitatori pubblici e attività back-end di tutte le piattaforme</div>
          </div>
        </div>
        <span className="text-sm font-medium">Apri →</span>
      </Link>

      <PlatformOverviewPanel />
    </div>
  )
}
