import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Helper: verify superadmin
async function verifySuperAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  // FIX 03/05/2026: role canonico in profiles e' "super_admin", non
  // "system_admin". Stesso bug di tier-config / sessions: la Knowledge Base
  // mostrava sempre 0 voci e il "Nuova voce" non salvava nulla.
  if (!profile || profile.role !== "super_admin") return null
  return { user, supabase }
}

// GET - List all knowledge entries
export async function GET() {
  const auth = await verifySuperAdmin()
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: entries } = await auth.supabase
    .from("platform_knowledge")
    .select("*")
    .order("category")
    .order("title")

  return NextResponse.json({ entries: entries || [] })
}

// POST - Create new knowledge entry
export async function POST(request: NextRequest) {
  const auth = await verifySuperAdmin()
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { category, title, content } = await request.json()

  if (!category || !title || !content) {
    return NextResponse.json({ error: "category, title and content required" }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from("platform_knowledge")
    .insert({ category, title, content })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

// PUT - Update existing knowledge entry
export async function PUT(request: NextRequest) {
  const auth = await verifySuperAdmin()
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id, category, title, content, is_active } = await request.json()

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (category !== undefined) updateData.category = category
  if (title !== undefined) updateData.title = title
  if (content !== undefined) {
    updateData.content = content
    // Increment version when content changes
    const { data: current } = await auth.supabase
      .from("platform_knowledge")
      .select("version")
      .eq("id", id)
      .single()
    updateData.version = (current?.version || 1) + 1
  }
  if (is_active !== undefined) updateData.is_active = is_active

  const { error } = await auth.supabase
    .from("platform_knowledge")
    .update(updateData)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE - Remove knowledge entry
export async function DELETE(request: NextRequest) {
  const auth = await verifySuperAdmin()
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await auth.supabase
    .from("platform_knowledge")
    .delete()
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
