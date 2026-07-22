import { type NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

// POST - Submit feedback (suggestion or problem)
export async function POST(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const body = await request.json()
  const { type, message, hotelId } = body

  if (!type || !message?.trim()) {
    return NextResponse.json({ error: "Tipo e messaggio sono obbligatori" }, { status: 400 })
  }

  if (!["suggestion", "problem"].includes(type)) {
    return NextResponse.json({ error: "Tipo non valido" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("user_feedback")
    .insert({
      user_id: user.id,
      hotel_id: hotelId || null,
      type,
      message: message.trim(),
      status: "open",
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}

// GET - Superadmin: list all feedback
export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const status = request.nextUrl.searchParams.get("status")

  let query = supabase
    .from("user_feedback")
    .select("*")
    .order("created_at", { ascending: false })

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with user email and hotel name
  const userIds = [...new Set((data || []).map(f => f.user_id))]
  const hotelIds = [...new Set((data || []).filter(f => f.hotel_id).map(f => f.hotel_id))]

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", userIds)

  const { data: hotels } = hotelIds.length > 0
    ? await supabase.from("hotels").select("id, name").in("id", hotelIds)
    : { data: [] }

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  const hotelMap = Object.fromEntries((hotels || []).map(h => [h.id, h]))

  const enriched = (data || []).map(f => ({
    ...f,
    user_name: profileMap[f.user_id] ? [profileMap[f.user_id].first_name, profileMap[f.user_id].last_name].filter(Boolean).join(" ") || profileMap[f.user_id].email : "Utente sconosciuto",
    user_email: profileMap[f.user_id]?.email || "",
    hotel_name: f.hotel_id ? hotelMap[f.hotel_id]?.name || "Struttura sconosciuta" : null,
  }))

  return NextResponse.json({ feedback: enriched })
}

// PUT - Superadmin: reply to feedback or change status
export async function PUT(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()
  const { feedbackId, status: newStatus, adminReply } = body

  if (!feedbackId) {
    return NextResponse.json({ error: "feedbackId obbligatorio" }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (newStatus) updateData.status = newStatus
  if (adminReply !== undefined) {
    updateData.admin_reply = adminReply
    updateData.admin_reply_at = new Date().toISOString()
    updateData.admin_reply_by = user.id
    updateData.status = "replied"
  }

  const { error } = await supabase
    .from("user_feedback")
    .update(updateData)
    .eq("id", feedbackId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
