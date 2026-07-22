import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    // Verify super_admin
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const action = searchParams.get("action")
    const resourceType = searchParams.get("resource_type")
    const search = searchParams.get("search")
    const offset = (page - 1) * limit

    // Build query with service role
    const serviceClient = await createServiceRoleClient()

    let query = serviceClient
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })

    if (action && action !== "all") {
      query = query.eq("action", action)
    }

    if (resourceType && resourceType !== "all") {
      query = query.eq("resource_type", resourceType)
    }

    if (search) {
      query = query.or(`user_email.ilike.%${search}%,resource_type.ilike.%${search}%`)
    }

    query = query.range(offset, offset + limit - 1)

    const { data: logs, error, count } = await query

    if (error) {
      console.error("Error fetching audit logs:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      logs: logs || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error("Error in audit-logs API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
