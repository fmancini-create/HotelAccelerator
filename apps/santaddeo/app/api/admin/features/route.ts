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

/** GET /api/admin/features - lista tutte le feature (solo superadmin) */
export async function GET() {
  const supabase = await createClient()
  const user = await checkSuperAdmin(supabase)
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("feature_development")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ features: data })
}

/** POST /api/admin/features - crea nuova feature (solo superadmin) */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const user = await checkSuperAdmin(supabase)
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const { title, description } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 })
  }

  // Get next sort_order
  const { data: maxRow } = await supabase
    .from("feature_development")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (maxRow?.sort_order || 0) + 1

  const { data, error } = await supabase
    .from("feature_development")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feature: data }, { status: 201 })
}
