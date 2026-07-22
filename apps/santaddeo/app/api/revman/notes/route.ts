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
    .from("revman_notes")
    .select("id, hotel_id, author_id, author_role, title, body, pinned, created_at, updated_at")
    .eq("hotel_id", hotelId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    hotel_id?: string
    title?: string
    body?: string
    pinned?: boolean
  } | null
  if (!body?.hotel_id || !body?.body) {
    return NextResponse.json({ error: "hotel_id e body sono richiesti" }, { status: 400 })
  }

  const access = await validateRevmanAccess(body.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) {
    return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })
  }

  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

  const supabase = await createServiceRoleClient()
  const isStaff = access.role === "super_admin" || access.role === "superadmin"

  const { data, error } = await supabase
    .from("revman_notes")
    .insert({
      hotel_id: body.hotel_id,
      // colonne nuove
      author_id: user.id,
      author_role: isStaff ? "staff" : "tenant",
      body: body.body,
      // colonne vecchie (NOT NULL se schema-fix non eseguito): popola entrambe
      created_by: user.id,
      content: body.body,
      title: body.title || null,
      pinned: !!body.pinned,
    } as any)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}
