import { type NextRequest, NextResponse } from "next/server"
import { AccessError, accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { geocodeHrAddress } from "@/lib/hr/geocoding"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const db = createServiceClient()
    if (!(await isModuleActive(db, identity.propertyId, "hr"))) {
      throw new AccessError("Modulo HR non attivo", 403)
    }

    const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (query.length < 3 || query.length > 180) {
      return NextResponse.json({ error: "invalid_address_query" }, { status: 400 })
    }

    const results = await geocodeHrAddress(query)
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[hr] geocoding search", error)
    return NextResponse.json(
      { error: "geocoding_failed" },
      { status: accessErrorStatus(error) },
    )
  }
}
