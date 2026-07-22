import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET personal notifications for the current user.
 * Returns up to 30 latest notifications plus the unread count.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("user_notifications")
      .select("id, type, title, body, action_url, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ])

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: unreadCount ?? 0,
  })
}

/**
 * PATCH marks one or many notifications as read.
 * Body: { ids?: string[], markAll?: boolean }
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids : undefined
  const markAll = body?.markAll === true
  const nowIso = new Date().toISOString()

  let query = supabase
    .from("user_notifications")
    .update({ is_read: true, read_at: nowIso })
    .eq("user_id", user.id)
    .eq("is_read", false)

  if (!markAll) {
    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "ids or markAll required" }, { status: 400 })
    }
    query = query.in("id", ids)
  }

  const { error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
