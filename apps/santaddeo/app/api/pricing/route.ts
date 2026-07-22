import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET - Fetch active pricing configs (public, for hotel-accelerator and activate pages)
export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("pricing_configs")
    .select("*")
    .eq("is_active", true)
    .order("model_type")
    .order("is_default", { ascending: false })
    .order("created_at")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Separate by model type
  const feeConfigs = (data || []).filter((c: any) => c.model_type === "fee")
  const commissionConfigs = (data || []).filter((c: any) => c.model_type === "commission")

  // Get defaults
  const defaultFee = feeConfigs.find((c: any) => c.is_default) || feeConfigs[0] || null
  const defaultCommission = commissionConfigs.find((c: any) => c.is_default) || commissionConfigs[0] || null

  return NextResponse.json({
    configs: data || [],
    feeConfigs,
    commissionConfigs,
    defaultFee,
    defaultCommission,
  })
}
