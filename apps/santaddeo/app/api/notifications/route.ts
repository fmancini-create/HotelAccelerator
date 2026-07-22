import { NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

async function checkSuperAdmin(user: any, supabase: any) {
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  const isSuperAdmin = profile?.role === "super_admin" || profile?.role === "system_admin"
  if (!profile || !isSuperAdmin) return null
  return user
}

/**
 * GET /api/notifications
 * For regular users: returns active, undismissed notifications
 * For superadmin with ?admin=true: returns all notifications
 */
export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = request.nextUrl.searchParams.get("admin") === "true"

  if (isAdmin) {
    // Superadmin: return all notifications with feature info
    const admin = await checkSuperAdmin(user, supabase)
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data, error } = await supabase
      .from("platform_notifications")
      .select("*, feature:feature_development(id, title, status)")
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ notifications: data })
  }

  // Regular user: active notifications not yet dismissed
  const { data: notifications, error } = await supabase
    .from("platform_notifications")
    .select("id, type, title, body, show_popup, created_at, feature:feature_development(id, title)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  console.log("[v0] Notifications GET - user:", user.id, "notifications:", notifications?.length, "error:", error?.message)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter out dismissed ones
  const { data: dismissals } = await supabase
    .from("notification_dismissals")
    .select("notification_id")
    .eq("user_id", user.id)

  const dismissedIds = new Set((dismissals || []).map((d: any) => d.notification_id))
  const undismissed = (notifications || []).filter((n: any) => !dismissedIds.has(n.id))

  return NextResponse.json({
    notifications: undismissed,
    totalActive: undismissed.length,
    hasPopup: undismissed.some((n: any) => n.show_popup),
  })
}

/** POST /api/notifications - create notification (superadmin only) */
export async function POST(request: NextRequest) {
  const { user: authUser, supabase } = await getAuthUserOrDev()
  const user = await checkSuperAdmin(authUser, supabase)
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const { feature_id, type, title, body: notifBody, show_popup } = body

  if (!title?.trim() || !notifBody?.trim()) {
    return NextResponse.json({ error: "Titolo e corpo obbligatori" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("platform_notifications")
    .insert({
      feature_id: feature_id || null,
      type: type || "announcement",
      title: title.trim(),
      body: notifBody.trim(),
      show_popup: show_popup ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notification: data }, { status: 201 })
}
