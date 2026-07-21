import { NextResponse, type NextRequest } from "next/server"
import { createServiceRoleClient, createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

async function getCurrentUserId(): Promise<string | null> {
  const isDev = await isDevAuthAsync()
  if (isDev) return "5de43b7b-e661-4e4e-8177-7943df06470c"
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function isSuperAdmin(userId: string | null): Promise<boolean> {
  if (await isDevAuthAsync()) return true
  if (!userId) return false
  const supabase = await createServiceRoleClient()
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
  return data?.role === "super_admin" || data?.role === "superadmin"
}

/**
 * PATCH /api/onboarding/tasks/[id]
 * body: { action: 'complete' | 'uncomplete' | 'approve' | 'reject', rejection_reason?, ...editable }
 *
 * - `complete`/`uncomplete`: il tenant marca il task come completato (o lo rimuove).
 * - `approve`/`reject`: solo super_admin valida/rimanda.
 * - Altri campi (title, description, due_date, category, task_order): solo super_admin.
 *
 * Quando tutti i task sono `approved`, la checklist passa automaticamente a
 * `awaiting_review` -> il super_admin puo' poi cliccare "Avvia configurazione"
 * (action=go_configuring nel route checklist) per partire col setup.
 * Se almeno un task e' `completed` ma non ancora approvato la checklist e'
 * in stato `awaiting_review`. Se almeno un task e' completed e tutti i restanti
 * sono completed/approved → awaiting_review. Se almeno un task e' completed/approved
 * ma esistono ancora 'todo' → in_progress.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const action = body?.action as string | undefined

  const supabase = await createServiceRoleClient()
  const { data: task, error: tErr } = await supabase
    .from("onboarding_tasks")
    .select("*, checklist:onboarding_checklists(id, hotel_id)")
    .eq("id", id)
    .single()
  if (tErr || !task) return NextResponse.json({ error: "task not found" }, { status: 404 })

  const hotelId = (task as any).checklist?.hotel_id as string | undefined
  if (!hotelId) return NextResponse.json({ error: "hotel mapping missing" }, { status: 500 })

  const userId = await getCurrentUserId()
  const isAdmin = await isSuperAdmin(userId)

  // Tenant-only actions
  if (action === "complete" || action === "uncomplete") {
    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (action === "complete") {
      update.status = "completed"
      update.completed_at = new Date().toISOString()
      update.completed_by = userId
    } else {
      update.status = "todo"
      update.completed_at = null
      update.completed_by = null
      update.approved_at = null
      update.approved_by = null
    }
    const { data: updated, error } = await supabase
      .from("onboarding_tasks")
      .update(update)
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recomputeChecklistStatus(supabase, (task as any).checklist.id)
    return NextResponse.json({ task: updated })
  }

  // Super_admin actions
  if (action === "approve" || action === "reject") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (action === "approve") {
      update.status = "approved"
      update.approved_at = new Date().toISOString()
      update.approved_by = userId
      update.rejection_reason = null
    } else {
      update.status = "rejected"
      update.rejection_reason = String(body?.rejection_reason ?? "")
      update.approved_at = null
      update.approved_by = null
    }
    const { data: updated, error } = await supabase
      .from("onboarding_tasks")
      .update(update)
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recomputeChecklistStatus(supabase, (task as any).checklist.id)
    return NextResponse.json({ task: updated })
  }

  // Edit-only super_admin
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ["title", "description", "category", "task_order", "due_date"]) {
    if (body?.[k] !== undefined) update[k] = body[k]
  }
  const { data: updated, error } = await supabase
    .from("onboarding_tasks")
    .update(update)
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: updated })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  const supabase = await createServiceRoleClient()
  // recompute dopo
  const { data: task } = await supabase
    .from("onboarding_tasks")
    .select("checklist_id")
    .eq("id", id)
    .single()
  const { error } = await supabase.from("onboarding_tasks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (task?.checklist_id) await recomputeChecklistStatus(supabase, task.checklist_id)
  return NextResponse.json({ ok: true })
}

async function recomputeChecklistStatus(supabase: any, checklistId: string) {
  const { data: tasks } = await supabase
    .from("onboarding_tasks")
    .select("status")
    .eq("checklist_id", checklistId)
  const statuses: string[] = (tasks || []).map((t: any) => String(t.status))
  const total = statuses.length
  const todoCount = statuses.filter((s) => s === "todo" || s === "rejected").length
  const completedCount = statuses.filter((s) => s === "completed").length
  const approvedCount = statuses.filter((s) => s === "approved").length

  let next = "pending"
  if (total === 0) next = "pending"
  else if (approvedCount === total) {
    // Tutto approvato: la checklist e' pronta. Non avanziamo automaticamente
    // a 'configuring' per lasciare il super_admin in controllo del trigger.
    next = "awaiting_review"
  } else if (completedCount > 0 && todoCount === 0) {
    next = "awaiting_review"
  } else if (completedCount > 0 || approvedCount > 0) {
    next = "in_progress"
  } else {
    next = "pending"
  }

  // Non sovrascrivere stati avanzati gia' impostati dal super_admin
  const { data: cl } = await supabase
    .from("onboarding_checklists")
    .select("status")
    .eq("id", checklistId)
    .single()
  if (cl?.status === "configuring" || cl?.status === "live") return

  await supabase
    .from("onboarding_checklists")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", checklistId)
}
