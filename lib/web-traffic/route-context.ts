import "server-only"

import type { NextRequest } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { ensureWebTrafficWorkspace, WebTrafficFederationError } from "@/lib/web-traffic/federation"

export type WebTrafficRouteContext = {
  propertyId: string
  propertyName: string
  santaddeoHotelId: string
}

export async function getWebTrafficRouteContext(request: NextRequest): Promise<WebTrafficRouteContext> {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) throw new WebTrafficFederationError("unauthorized", 401)

  const db = createServiceClient()
  if (!(await isModuleActive(db, identity.propertyId, "web_traffic"))) {
    throw new WebTrafficFederationError("web_traffic_not_active", 403)
  }

  const { data: property, error } = await db
    .from("properties")
    .select("id,name")
    .eq("id", identity.propertyId)
    .maybeSingle()
  if (error) throw error
  if (!property) throw new WebTrafficFederationError("property_not_found", 404)

  const workspace = await ensureWebTrafficWorkspace({
    externalTenantId: property.id,
    tenantName: property.name,
  })

  return {
    propertyId: property.id,
    propertyName: property.name,
    santaddeoHotelId: workspace.santaddeoHotelId,
  }
}
