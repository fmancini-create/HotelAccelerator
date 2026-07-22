import { PageHeader } from "@/components/layout/page-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PushPricesTool } from "@/components/superadmin/push-prices-tool"

export const dynamic = "force-dynamic"

export default function PushPricesPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuperAdminHeader />
      <BackNavigation />
      <PageHeader
        title="Push prezzi al PMS"
        description="Forza l'invio di tutti i prezzi (pricing_grid) al PMS per un range di date selezionato. Operazione superadmin only."
      />
      <main className="container mx-auto p-6 flex-1">
        <PushPricesTool />
      </main>
      <AppFooter />
    </div>
  )
}
