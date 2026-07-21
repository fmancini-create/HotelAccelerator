import { NextResponse, type NextRequest } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/onboarding/tasks
 * body: { checklist_id, title, description?, category?, task_order?, due_date? }
 *
 * Solo super_admin: aggiunge un task custom (o da template) a una checklist
 * gia' creata.
 */
export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const body = await req.json()
  const { checklist_id, template_id, title, description, category, task_order, due_date } = body || {}
  if (!checklist_id) return NextResponse.json({ error: "checklist_id required" }, { status: 400 })

  const supabase = await createServiceRoleClient()
  let resolvedTitle: string | null = title ?? null
  let resolvedDescription: string | null = description ?? null
  let resolvedCategory: string | null = category ?? null
  let resolvedOrder: number = task_order ?? 999

  if (template_id) {
    const { data: tpl } = await supabase
      .from("onboarding_task_templates")
      .select("title, description, category, default_order")
      .eq("id", template_id)
      .maybeSingle()
    if (tpl) {
      resolvedTitle = resolvedTitle ?? tpl.title
      resolvedDescription = resolvedDescription ?? tpl.description
      resolvedCategory = resolvedCategory ?? tpl.category
      if (task_order === undefined) resolvedOrder = tpl.default_order ?? 999
    }
  }

  if (!resolvedTitle) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await supabase
    .from("onboarding_tasks")
    .insert({
      checklist_id,
      template_id: template_id ?? null,
      title: resolvedTitle,
      description: resolvedDescription,
      category: resolvedCategory,
      task_order: resolvedOrder,
      due_date: due_date ?? null,
      status: "todo",
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}
