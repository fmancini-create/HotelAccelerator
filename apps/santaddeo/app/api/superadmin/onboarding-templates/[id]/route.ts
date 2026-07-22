import { NextResponse, type NextRequest } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  const body = await req.json()
  const { title, description, category, default_order, is_active } = body || {}
  const update: Record<string, unknown> = {}
  if (title !== undefined) update.title = title
  if (description !== undefined) update.description = description
  if (category !== undefined) update.category = category
  if (default_order !== undefined) update.default_order = default_order
  if (is_active !== undefined) update.is_active = is_active
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("onboarding_task_templates")
    .update(update)
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  const supabase = await createServiceRoleClient()
  const { error } = await supabase.from("onboarding_task_templates").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
