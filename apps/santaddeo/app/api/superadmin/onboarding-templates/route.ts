import { NextResponse, type NextRequest } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET: lista template (visibile anche al tenant per scegliere quale aggiungere?
// No: solo super_admin gestisce la libreria, il tenant vede solo i task della
// propria checklist). Tutti gli endpoint qui sono super_admin-only.

export async function GET() {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("onboarding_task_templates")
    .select("*")
    .order("default_order", { ascending: true })
    .order("title", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const body = await req.json()
  const { title, description, category, default_order, is_active } = body || {}
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 })
  }
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("onboarding_task_templates")
    .insert({
      title,
      description: description ?? null,
      category: category ?? null,
      default_order: default_order ?? 0,
      is_active: is_active ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}
