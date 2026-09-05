import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { applyContactAccess, resolveContactAccess } from "@/lib/crm/contact-access"

type ContactStatRow = {
  marketing_consent: boolean | null
  unsubscribed: boolean | null
  vip_level: string | null
  lead_score: number | null
  total_bookings: number | null
  total_revenue_cents: number | null
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const identity = await getCallerIdentity(request)
    if (!propertyId || !identity) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const access = await resolveContactAccess(supabase, { ...identity, propertyId })
    const { data, error } = await applyContactAccess(
      supabase
        .from("contacts")
        .select("marketing_consent, unsubscribed, vip_level, lead_score, total_bookings, total_revenue_cents")
        .eq("property_id", propertyId),
      access,
    )
    if (error) throw error

    const rows = (data ?? []) as ContactStatRow[]
    const totalContacts = rows.length
    const withConsent = rows.filter((c) => c.marketing_consent === true && c.unsubscribed !== true).length
    const vipContacts = rows.filter((c) => c.vip_level === "gold" || c.vip_level === "platinum").length
    const avgScore = rows.length
      ? Math.round(rows.reduce((sum, c) => sum + (c.lead_score || 0), 0) / rows.length)
      : 0
    const totalBookings = rows.reduce((sum, c) => sum + (c.total_bookings || 0), 0)
    const totalRevenue = rows.reduce((sum, c) => sum + (c.total_revenue_cents || 0), 0)

    return NextResponse.json({
      total_contacts: totalContacts,
      with_consent: withConsent,
      vip_contacts: vipContacts,
      avg_lead_score: avgScore,
      total_bookings: totalBookings,
      total_revenue: totalRevenue,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching CRM stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
