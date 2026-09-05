import Link from "next/link"
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react"

import { PlatformOverviewPanel } from "@/components/platform/platform-overview-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

      <Card className="mb-6 border-ha-brand/30 bg-ha-brand/5">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-background p-2 shadow-sm">
              <Sparkles className="h-5 w-5 text-ha-brand" aria-hidden />
            </div>
            <div>
              <p className="font-semibold">Customer Intelligence 4BID</p>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                CRM commerciale della suite: clienti, prospect, prodotti posseduti, customer health, segmenti e opportunità di cross-sell.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/super-admin/crm">
              Apri CRM Super Admin
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <PlatformOverviewPanel />
    </div>
  )
}
