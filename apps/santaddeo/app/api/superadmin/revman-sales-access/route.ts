import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

async function requireSuperAdmin() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createServiceRoleClient()
  if (isV0Preview) return { supabase, userId: "dev" as const }
  const authClient = await createClient()
  const user = await getAuthUser(authClient)
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, userId: user.id }
}

// GET ?hotel_id=...  -> elenca venditori con accesso RevMan a questo hotel
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const hotelId = req.nextUrl.searchParams.get("hotel_id")
  if (!hotelId) return NextResponse.json({ error: "hotel_id required" }, { status: 400 })

  const { data: grants, error } = await auth.supabase
    .from("revman_sales_access")
    .select("id, sales_agent_id, granted_at, granted_by")
    .eq("hotel_id", hotelId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Arricchisci con email/nome del venditore
  const ids = (grants || []).map((g) => g.sales_agent_id)
  let profiles: Record<string, { email?: string; full_name?: string }> = {}
  if (ids.length) {
    const { data: profs } = await auth.supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids)
    for (const p of profs || []) profiles[p.id] = { email: p.email, full_name: p.full_name }
  }

  return NextResponse.json({
    grants: (grants || []).map((g) => ({
      ...g,
      sales_agent_email: profiles[g.sales_agent_id]?.email || null,
      sales_agent_name: profiles[g.sales_agent_id]?.full_name || null,
    })),
  })
}

// POST { hotel_id, sales_agent_id }  -> concedi accesso (solo lettura)
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const body = await req.json().catch(() => null) as {
    hotel_id?: string
    sales_agent_id?: string
  } | null
  if (!body?.hotel_id || !body?.sales_agent_id) {
    return NextResponse.json({ error: "hotel_id e sales_agent_id richiesti" }, { status: 400 })
  }

  // Sanity check: il profilo deve essere sales_agent
  const { data: prof } = await auth.supabase
    .from("profiles").select("role").eq("id", body.sales_agent_id).maybeSingle()
  if (!prof || prof.role !== "sales_agent") {
    return NextResponse.json({ error: "L'utente selezionato non e' un venditore" }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from("revman_sales_access")
    .upsert(
      {
        hotel_id: body.hotel_id,
        sales_agent_id: body.sales_agent_id,
        granted_by: auth.userId === "dev" ? null : auth.userId,
      },
      { onConflict: "hotel_id,sales_agent_id" }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grant: data })
}

// DELETE ?id=... oppure DELETE ?hotel_id=...&sales_agent_id=...
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const id = req.nextUrl.searchParams.get("id")
  const hotelId = req.nextUrl.searchParams.get("hotel_id")
  const agentId = req.nextUrl.searchParams.get("sales_agent_id")

  let q = auth.supabase.from("revman_sales_access").delete()
  if (id) q = q.eq("id", id)
  else if (hotelId && agentId) q = q.eq("hotel_id", hotelId).eq("sales_agent_id", agentId)
  else return NextResponse.json({ error: "id oppure (hotel_id+sales_agent_id) richiesti" }, { status: 400 })

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
