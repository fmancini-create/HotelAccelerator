import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET() {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()

    const [
      { count: total_contacts },
      { count: with_consent },
      { count: vip_contacts },
      { data: scoreData },
      { data: bookingData },
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("property_id", property.id),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("property_id", property.id)
        .eq("marketing_consent", true)
        .eq("unsubscribed", false),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("property_id", property.id)
        .in("vip_level", ["gold", "platinum"]),
      supabase.from("contacts").select("lead_score").eq("property_id", property.id),
      supabase.from("contacts").select("total_bookings, total_revenue_cents").eq("property_id", property.id),
    ])

    const avgScore = scoreData?.length
      ? Math.round(scoreData.reduce((sum, c) => sum + (c.lead_score || 0), 0) / scoreData.length)
      : 0

    const totalBookings = bookingData?.reduce((sum, c) => sum + (c.total_bookings || 0), 0) || 0
    const totalRevenue = bookingData?.reduce((sum, c) => sum + (c.total_revenue_cents || 0), 0) || 0

    return NextResponse.json({
      total_contacts: total_contacts || 0,
      with_consent: with_consent || 0,
      vip_contacts: vip_contacts || 0,
      avg_lead_score: avgScore,
      total_bookings: totalBookings,
      total_revenue: totalRevenue,
    })
  } catch (error) {
    console.error("Error fetching CRM stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
