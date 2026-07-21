import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateRevmanAccess } from "@/lib/auth/validateRevmanAccess"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null) as {
    title?: string
    description?: string | null
    status?: "open" | "in_progress" | "done" | "cancelled"
    due_date?: string | null
    assigned_to?: "tenant" | "staff" | null
  } | null
  if (!body) return NextResponse.json({ error: "body richiesto" }, { status: 400 })

  const supabase = await createServiceRoleClient()
  const { data: existing } = await supabase
    .from("revman_activities").select("hotel_id").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const access = await validateRevmanAccess(existing.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === "string") update.title = body.title
  if (body.description !== undefined) update.description = body.description
  if (body.due_date !== undefined) update.due_date = body.due_date
  if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to
  if (body.status) {
    update.status = body.status
    update.completed_at = body.status === "done" ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from("revman_activities").update(update).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceRoleClient()
  const { data: existing } = await supabase
    .from("revman_activities").select("hotel_id").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const access = await validateRevmanAccess(existing.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })

  const { error } = await supabase.from("revman_activities").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
