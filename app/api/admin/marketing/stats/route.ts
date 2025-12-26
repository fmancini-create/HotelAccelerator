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

    const { data: campaigns, error } = await supabase.from("email_campaigns").select("*").eq("property_id", property.id)

    if (error) throw error

    const sentCampaigns = campaigns?.filter((c) => c.status === "sent") || []

    const totalSent = sentCampaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0)
    const totalOpened = sentCampaigns.reduce((sum, c) => sum + (c.opened_count || 0), 0)
    const totalClicked = sentCampaigns.reduce((sum, c) => sum + (c.clicked_count || 0), 0)
    const totalDelivered = sentCampaigns.reduce((sum, c) => sum + (c.delivered_count || 0), 0)
    const totalUnsubscribes = sentCampaigns.reduce((sum, c) => sum + (c.unsubscribed_count || 0), 0)

    return NextResponse.json({
      total_campaigns: campaigns?.length || 0,
      total_sent: totalSent,
      avg_open_rate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
      avg_click_rate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
      total_unsubscribes: totalUnsubscribes,
    })
  } catch (error) {
    console.error("Error fetching marketing stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
