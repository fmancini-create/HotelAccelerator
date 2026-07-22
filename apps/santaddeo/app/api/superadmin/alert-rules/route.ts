import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is superadmin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()

    // Create global alert rule (hotel_id and organization_id are null)
    const { data: rule, error } = await supabase
      .from("alert_rules")
      .insert({
        hotel_id: null,
        organization_id: null,
        name: body.name,
        metric: body.metric,
        operator: body.operator,
        threshold: body.threshold,
        severity: body.severity,
        is_active: body.is_active,
        send_email: true,
        send_notification: true,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating alert rule:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rule })
  } catch (error) {
    console.error("[v0] Error in alert-rules route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
