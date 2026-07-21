import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateRevmanAccess } from "@/lib/auth/validateRevmanAccess"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null) as {
    title?: string | null
    body?: string
    pinned?: boolean
  } | null
  if (!body) return NextResponse.json({ error: "body richiesto" }, { status: 400 })

  const supabase = await createServiceRoleClient()
  const { data: existing } = await supabase
    .from("revman_notes").select("hotel_id").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const access = await validateRevmanAccess(existing.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) update.title = body.title
  if (typeof body.body === "string") update.body = body.body
  if (typeof body.pinned === "boolean") update.pinned = body.pinned

  const { data, error } = await supabase
    .from("revman_notes").update(update).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceRoleClient()
  const { data: existing } = await supabase
    .from("revman_notes").select("hotel_id").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const access = await validateRevmanAccess(existing.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })

  const { error } = await supabase.from("revman_notes").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
