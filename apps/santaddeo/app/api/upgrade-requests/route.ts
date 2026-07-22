import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// POST - User requests an upgrade (KPI or plan)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const body = await request.json()
  const { hotelId, requestType, message } = body

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId obbligatorio" }, { status: 400 })
  }

  const supabaseAdmin = await createClient()

  const { data, error } = await supabaseAdmin
    .from("upgrade_requests")
    .insert({
      user_id: user.id,
      hotel_id: hotelId,
      request_type: requestType || "kpi_upgrade",
      message: message?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}

// GET - Superadmin: list upgrade requests
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const status = request.nextUrl.searchParams.get("status")

  let query = supabaseAdmin
    .from("upgrade_requests")
    .select("*")
    .order("created_at", { ascending: false })

  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich
  const userIds = [...new Set((data || []).map(r => r.user_id))]
  const hotelIds = [...new Set((data || []).map(r => r.hotel_id))]

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", userIds)

  const { data: hotels } = await supabaseAdmin
    .from("hotels")
    .select("id, name")
    .in("id", hotelIds)

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
  const hotelMap = Object.fromEntries((hotels || []).map(h => [h.id, h]))

  const enriched = (data || []).map(r => ({
    ...r,
    user_name: profileMap[r.user_id] ? [profileMap[r.user_id].first_name, profileMap[r.user_id].last_name].filter(Boolean).join(" ") || profileMap[r.user_id].email : "Utente",
    user_email: profileMap[r.user_id]?.email || "",
    hotel_name: hotelMap[r.hotel_id]?.name || "Struttura sconosciuta",
  }))

  return NextResponse.json({ requests: enriched })
}

// PUT - Superadmin: update request status
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()
  const { requestId, status: newStatus, adminNotes } = body

  if (!requestId || !newStatus) {
    return NextResponse.json({ error: "requestId e status obbligatori" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("upgrade_requests")
    .update({
      status: newStatus,
      admin_notes: adminNotes || null,
      resolved_at: ["approved", "rejected", "completed"].includes(newStatus) ? new Date().toISOString() : null,
      resolved_by: ["approved", "rejected", "completed"].includes(newStatus) ? user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
