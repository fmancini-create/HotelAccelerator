import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      is_active,
      plan_type,
      algorithm_type,
      payment_status,
      fixed_fee_per_room,
      commission_percentage,
      commission_basis,
      started_at,
      trial_end_at,
      next_billing_date,
    } = body

    const updatePayload: Record<string, unknown> = {
      is_active,
      plan_type,
      algorithm_type,
      payment_status,
      fixed_fee_per_room,
      commission_percentage,
      commission_basis,
      trial_end_at: trial_end_at || null,
      next_billing_date: next_billing_date || null,
      updated_at: new Date().toISOString(),
    }
    // started_at e' opzionale; lo accettiamo solo se valorizzato per non
    // azzerare la data esistente. E' la "data inizio conteggio commissioni".
    if (started_at) updatePayload.started_at = started_at

    const { data, error } = await supabase
      .from("accelerator_subscriptions")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[SuperAdmin Subscriptions PATCH] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
