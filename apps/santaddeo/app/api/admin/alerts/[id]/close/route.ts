import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Next.js 16: i params dinamici sono Promise. Vanno awaited prima dell'uso.
    const { id } = await params
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is system_admin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()

    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Update alert status to closed
    const { error } = await supabase
      .from("alert_events")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      })
      .eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error closing alert:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
