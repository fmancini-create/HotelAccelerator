import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Accelerator activation API - fetches hotels and pricing configs
// Security: uses cookie-based auth client (respects RLS)
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase.from("profiles").select("organization_id, role").eq("id", user.id).single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization", redirect: "/onboarding" }, { status: 400 })
  }

  const { data: hotels } = await supabase.from("hotels").select("*").eq("organization_id", profile.organization_id)

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single()

  if (!hotels || hotels.length === 0) {
    return NextResponse.json({ error: "No hotels", redirect: "/onboarding" }, { status: 400 })
  }

  const hotelsWithOrg = hotels.map((hotel: any) => ({
    ...hotel,
    organization,
  }))

  const { data: pricingConfigs } = await supabase
    .from("pricing_configs")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false })

  const feeConfigs = (pricingConfigs || []).filter((c: any) => c.model_type === "fee")
  const commissionConfigs = (pricingConfigs || []).filter((c: any) => c.model_type === "commission")

  return NextResponse.json({
    hotels: hotelsWithOrg,
    pricingConfigs: pricingConfigs || [],
    defaultFee: feeConfigs[0] || null,
    defaultCommission: commissionConfigs[0] || null,
  })
}
