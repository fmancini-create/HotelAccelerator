import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get("provider")
    const status = searchParams.get("status")

    let query = supabase
      .from("advertising_campaigns")
      .select("id, advertising_account_id, provider, external_campaign_id, name, status, objective, origin, management_mode, budget_amount, budget_period, currency, starts_at, ends_at, imported_at, last_synced_at, advertising_accounts(name, external_account_id)")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })

    if (provider && provider !== "all") query = query.eq("provider", provider)
    if (status && status !== "all") query = query.eq("status", status)

    const { data: campaigns, error } = await query
    if (error) throw error

    const ids = (campaigns ?? []).map((campaign) => campaign.id)
    if (ids.length === 0) return NextResponse.json([])

    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 30)
    const { data: metrics, error: metricsError } = await supabase
      .from("advertising_campaign_metrics")
      .select("campaign_id, spend, impressions, clicks, conversions, conversion_value")
      .eq("property_id", propertyId)
      .in("campaign_id", ids)
      .gte("metric_date", since.toISOString().slice(0, 10))

    if (metricsError) throw metricsError

    const totals = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }>()
    for (const metric of metrics ?? []) {
      const current = totals.get(metric.campaign_id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 }
      current.spend += Number(metric.spend ?? 0)
      current.impressions += Number(metric.impressions ?? 0)
      current.clicks += Number(metric.clicks ?? 0)
      current.conversions += Number(metric.conversions ?? 0)
      current.conversion_value += Number(metric.conversion_value ?? 0)
      totals.set(metric.campaign_id, current)
    }

    return NextResponse.json(
      (campaigns ?? []).map((campaign) => ({
        ...campaign,
        metrics_30d: totals.get(campaign.id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0 },
      })),
    )
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching advertising campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch advertising campaigns" }, { status: 500 })
  }
}
