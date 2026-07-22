import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

async function checkSuperAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  // Accept both super_admin and system_admin roles
  const isSuperAdmin = profile?.role === "super_admin" || profile?.role === "system_admin"
  if (!profile || !isSuperAdmin) return null
  return user
}

/** PUT /api/admin/features/[id] - aggiorna feature */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const user = await checkSuperAdmin(supabase)
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { title, description, status, sort_order, published_at, release_note_title, release_note_body } = body

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (title !== undefined) update.title = title.trim()
  if (description !== undefined) update.description = description?.trim() || null
  if (status !== undefined) update.status = status
  if (sort_order !== undefined) update.sort_order = sort_order
  if (published_at !== undefined) update.published_at = published_at
  if (release_note_title !== undefined) update.release_note_title = release_note_title?.trim() || null
  if (release_note_body !== undefined) update.release_note_body = release_note_body?.trim() || null

  const { data, error } = await supabase
    .from("feature_development")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feature: data })
}

/** DELETE /api/admin/features/[id] - elimina feature */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const user = await checkSuperAdmin(supabase)
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { error } = await supabase
    .from("feature_development")
    .delete()
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
