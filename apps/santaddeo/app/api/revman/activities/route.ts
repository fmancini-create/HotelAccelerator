import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateRevmanAccess } from "@/lib/auth/validateRevmanAccess"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  if (!hotelId) return NextResponse.json({ error: "hotel_id required" }, { status: 400 })

  const access = await validateRevmanAccess(hotelId)
  if (!access.granted) return access.response

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("revman_activities")
    .select("id, hotel_id, title, description, status, due_date, assigned_to, created_by, completed_at, created_at, updated_at")
    .eq("hotel_id", hotelId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activities: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    hotel_id?: string
    title?: string
    description?: string
    due_date?: string | null
    assigned_to?: "tenant" | "staff" | null
  } | null
  if (!body?.hotel_id || !body?.title) {
    return NextResponse.json({ error: "hotel_id e title sono richiesti" }, { status: 400 })
  }

  const access = await validateRevmanAccess(body.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) {
    return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })
  }

  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("revman_activities")
    .insert({
      hotel_id: body.hotel_id,
      title: body.title,
      description: body.description || null,
      due_date: body.due_date || null,
      assigned_to: body.assigned_to || null,
      // owner_role e' la colonna vecchia (NOT NULL se schema-fix non eseguito):
      // popoliamo entrambe.
      owner_role: body.assigned_to || "staff",
      created_by: user.id,
      status: "open",
    } as any)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}
