import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden - Super Admin only" }, { status: 403 })
    }

    console.log("[v0] Starting role migration...")

    // Update superadmin to super_admin
    const { error: error1 } = await supabase.from("profiles").update({ role: "super_admin" }).eq("role", "superadmin")

    if (error1) {
      console.error("[v0] Error updating superadmin roles:", error1)
      return NextResponse.json(
        {
          success: false,
          error: `Failed to update superadmin roles: ${error1.message}`,
        },
        { status: 500 },
      )
    }

    // Update admin/manager to property_admin
    const { error: error2 } = await supabase
      .from("profiles")
      .update({ role: "property_admin" })
      .in("role", ["admin", "manager"])

    if (error2) {
      console.error("[v0] Error updating admin/manager roles:", error2)
      return NextResponse.json(
        {
          success: false,
          error: `Failed to update admin/manager roles: ${error2.message}`,
        },
        { status: 500 },
      )
    }

    // Update viewer to sub_user
    const { error: error3 } = await supabase.from("profiles").update({ role: "sub_user" }).eq("role", "viewer")

    if (error3) {
      console.error("[v0] Error updating viewer roles:", error3)
      return NextResponse.json(
        {
          success: false,
          error: `Failed to update viewer roles: ${error3.message}`,
        },
        { status: 500 },
      )
    }

    console.log("[v0] Role migration completed successfully")

    return NextResponse.json({
      success: true,
      message: "Ruoli migrati con successo. Ricarica la pagina per vedere le modifiche.",
    })
  } catch (error: any) {
    console.error("[v0] Role migration error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to migrate roles",
      },
      { status: 500 },
    )
  }
}
