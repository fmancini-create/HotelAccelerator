import type React from "react"

import { TrackingSubnav } from "@/components/admin/tracking-subnav"
import { requireAreaPage } from "@/lib/auth/area-access"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export default async function TrackingAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("tracking")

  const identity = await getCallerIdentity()
  let webTrafficActive = false

  if (identity?.propertyId) {
    try {
      webTrafficActive = await isModuleActive(createServiceClient(), identity.propertyId, "web_traffic")
    } catch (error) {
      console.error("[tracking-layout] web traffic entitlement lookup failed", {
        propertyId: identity.propertyId,
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }

  return (
    <>
      <TrackingSubnav webTrafficActive={webTrafficActive} />
      {children}
    </>
  )
}
