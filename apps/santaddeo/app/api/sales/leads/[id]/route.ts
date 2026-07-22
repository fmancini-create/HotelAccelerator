import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Recupera/verifica il lead e che l'utente corrente possa gestirlo.
 * Ritorna { lead, svc } se ok, altrimenti { error } con la response.
 */
async function loadOwnedLead(id: string) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }
  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  const svc = await createServiceRoleClient()
  const { data: lead, error } = await svc
    .from("sales_leads")
    .select("*, sales_agents!inner(id, user_id)")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[sales/leads/:id] lookup error:", error)
    return { error: NextResponse.json({ error: "db_error" }, { status: 500 }) }
  }
  if (!lead) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) }
  }
  const agent = (lead as any).sales_agents
  // Ownership: il venditore gestisce solo i propri lead; il super admin tutti.
  if (profile.role !== "super_admin" && agent.user_id !== user.id) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return { lead, svc }
}

/**
 * Modifica i dati di un lead esistente (nome, struttura, email, telefono, note).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { lead, svc, error } = await loadOwnedLead(id)
  if (error) return error

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const update: Record<string, unknown> = {}

  if (body.first_name !== undefined) {
    const v = String(body.first_name).trim()
    if (!v) return NextResponse.json({ error: "invalid_field", field: "first_name" }, { status: 400 })
    update.first_name = v
  }
  if (body.last_name !== undefined) {
    const v = String(body.last_name).trim()
    if (!v) return NextResponse.json({ error: "invalid_field", field: "last_name" }, { status: 400 })
    update.last_name = v
  }
  if (body.hotel_name !== undefined) {
    const v = String(body.hotel_name).trim()
    if (!v) return NextResponse.json({ error: "invalid_field", field: "hotel_name" }, { status: 400 })
    update.hotel_name = v
  }
  if (body.email !== undefined) {
    const v = String(body.email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }
    update.email = v
  }
  if (body.phone !== undefined) {
    update.phone = body.phone ? String(body.phone).trim() : null
  }
  if (body.notes !== undefined) {
    update.notes = body.notes ? String(body.notes).trim() : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 })
  }

  const { data: updated, error: updErr } = await svc!
    .from("sales_leads")
    .update(update)
    .eq("id", (lead as any).id)
    .select("*")
    .single()

  if (updErr) {
    if (updErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_lead", message: "Hai gia' un lead con questa email" },
        { status: 409 },
      )
    }
    console.error("[sales/leads/:id] update error:", updErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ lead: updated })
}

/**
 * Elimina un lead.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { lead, svc, error } = await loadOwnedLead(id)
  if (error) return error

  const { error: delErr } = await svc!.from("sales_leads").delete().eq("id", (lead as any).id)
  if (delErr) {
    console.error("[sales/leads/:id] delete error:", delErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
