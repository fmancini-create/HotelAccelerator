import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

type CampaignRow = {
  status: string | null
  sent_count: number | null
  opened_count: number | null
  clicked_count: number | null
  delivered_count: number | null
  unsubscribed_count: number | null
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()

    const { data: campaigns, error } = await supabase.from("email_campaigns").select("*").eq("property_id", propertyId)

    if (error) throw error

    const sentCampaigns = campaigns?.filter((c: CampaignRow) => c.status === "sent") || []

    const totalSent = sentCampaigns.reduce((sum: number, c: CampaignRow) => sum + (c.sent_count || 0), 0)
    const totalOpened = sentCampaigns.reduce((sum: number, c: CampaignRow) => sum + (c.opened_count || 0), 0)
    const totalClicked = sentCampaigns.reduce((sum: number, c: CampaignRow) => sum + (c.clicked_count || 0), 0)
    const totalDelivered = sentCampaigns.reduce((sum: number, c: CampaignRow) => sum + (c.delivered_count || 0), 0)
    const totalUnsubscribes = sentCampaigns.reduce((sum: number, c: CampaignRow) => sum + (c.unsubscribed_count || 0), 0)

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
