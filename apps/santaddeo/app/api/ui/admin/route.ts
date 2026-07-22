import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ redirect: "/auth/login" })
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ redirect: "/dashboard" })
  }

  const [
    { data: hotels },
    { data: organizations },
    { data: syncLogs },
    { data: etlJobs },
    { data: pmsIntegrations },
    { data: alerts },
  ] = await Promise.all([
    supabase.from("hotels").select("*").order("created_at", { ascending: false }),
    supabase.from("organizations").select("*").order("created_at", { ascending: false }),
    supabase.from("sync_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("etl_jobs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("pms_integrations").select("*").order("created_at", { ascending: false }),
    supabase.from("alert_events").select("*").order("created_at", { ascending: false }).limit(100),
  ])

  // Manually attach organizations to hotels
  const hotelsWithRelations =
    hotels?.map((hotel) => ({
      ...hotel,
      organization: organizations?.find((o: any) => o.id === hotel.organization_id) || null,
      pms_integrations: pmsIntegrations?.filter((p: any) => p.hotel_id === hotel.id) || [],
    })) || []

  // Manually attach hotels to pms_integrations
  const pmsIntegrationsWithHotels =
    pmsIntegrations?.map((pms) => ({
      ...pms,
      hotel: hotels?.find((h: any) => h.id === pms.hotel_id) || null,
    })) || []

  // Manually attach hotels to alerts
  const alertsWithHotels =
    alerts?.map((alert) => ({
      ...alert,
      hotel: hotels?.find((h: any) => h.id === alert.hotel_id) || null,
    })) || []

  const openAlertsCount = alerts?.filter((a) => a.status === "open").length || 0

  return NextResponse.json({
    hotelsWithRelations,
    organizations,
    pmsIntegrationsWithHotels,
    syncLogs,
    etlJobs,
    alertsWithHotels,
    openAlertsCount,
  })
}
