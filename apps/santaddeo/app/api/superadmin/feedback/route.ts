import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

  // Verify superadmin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
  }

  // Fetch all feedback with user and hotel info
  const { data: feedback, error } = await supabase
    .from("user_feedback")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with user email and hotel name
  const userIds = [...new Set((feedback || []).map(f => f.user_id))]
  const hotelIds = [...new Set((feedback || []).filter(f => f.hotel_id).map(f => f.hotel_id))]

  const [usersRes, hotelsRes] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, email, first_name, last_name").in("id", userIds)
      : { data: [] },
    hotelIds.length > 0
      ? supabase.from("hotels").select("id, name").in("id", hotelIds)
      : { data: [] },
  ])

  const usersMap = new Map((usersRes.data || []).map(u => [u.id, u]))
  const hotelsMap = new Map((hotelsRes.data || []).map(h => [h.id, h]))

  const enriched = (feedback || []).map(f => ({
    ...f,
    user_email: usersMap.get(f.user_id)?.email || null,
    user_name: usersMap.get(f.user_id) ? [usersMap.get(f.user_id)?.first_name, usersMap.get(f.user_id)?.last_name].filter(Boolean).join(" ") || null : null,
    hotel_name: f.hotel_id ? hotelsMap.get(f.hotel_id)?.name || null : null,
  }))

  return NextResponse.json({ feedback: enriched })
}
