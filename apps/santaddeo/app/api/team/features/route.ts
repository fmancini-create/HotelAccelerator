import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PermissionService } from "@/lib/services/permission-service"

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all features grouped by category
    const features = await PermissionService.getAllFeatures()

    return NextResponse.json({ features })
  } catch (error) {
    console.error("Error fetching features:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
