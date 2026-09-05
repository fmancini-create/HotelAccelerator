import type { ReactNode } from "react"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getScoutTenantBillingState } from "@/lib/scout/billing"
import { ScoutBillingCard } from "@/components/crm/scout-billing-card"

export const dynamic = "force-dynamic"

export default async function ScoutLayout({ children }: { children: ReactNode }) {
  const propertyId = await getAuthenticatedPropertyId()
  const billing = await getScoutTenantBillingState(createServiceClient(), propertyId)

  return (
    <div className="space-y-6">
      <ScoutBillingCard billing={billing} />
      {billing.active ? children : null}
    </div>
  )
}
