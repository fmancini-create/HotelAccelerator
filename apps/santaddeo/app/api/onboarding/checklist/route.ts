import { NextResponse, type NextRequest } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/onboarding/checklist?hotel_id=X
 *
 * Ritorna la checklist post-firma di una subscription (1:1 con hotel) e i
 * suoi task. Visibile sia al tenant del hotel che al super_admin.
 *
 * Status checklist:
 *  - pending          : creata, in attesa che il tenant inizi a flaggare
 *  - in_progress      : il tenant ha iniziato (almeno 1 task completed)
 *  - awaiting_review  : tutti i task completed, in attesa di approvazione
 *  - configuring      : tutti approvati, super_admin sta configurando
 *  - live             : la struttura e' andata live
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const hotelId = url.searchParams.get("hotel_id")
  if (!hotelId) return NextResponse.json({ error: "hotel_id required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createServiceRoleClient()
  const { data: checklist, error: cErr } = await supabase
    .from("onboarding_checklists")
    .select("*")
    .eq("hotel_id", hotelId)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!checklist) return NextResponse.json({ checklist: null, tasks: [] })

  const { data: tasks, error: tErr } = await supabase
    .from("onboarding_tasks")
    .select("*")
    .eq("checklist_id", checklist.id)
    .order("task_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  return NextResponse.json({ checklist, tasks: tasks || [] })
}

/**
 * POST /api/onboarding/checklist
 * body: { subscription_id: string, template_ids?: string[], custom_tasks?: [{title,description,category,task_order,due_date}] }
 *
 * Crea la checklist per una subscription se non esiste, e genera i task
 * iniziali da template + tasks custom. Solo super_admin.
 */
export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const body = await req.json()
  const { subscription_id, template_ids = [], custom_tasks = [] } = body || {}
  if (!subscription_id) return NextResponse.json({ error: "subscription_id required" }, { status: 400 })

  const supabase = await createServiceRoleClient()

  const { data: sub, error: sErr } = await supabase
    .from("accelerator_subscriptions")
    .select("id, hotel_id, plan_type")
    .eq("id", subscription_id)
    .single()
  if (sErr || !sub) return NextResponse.json({ error: "subscription not found" }, { status: 404 })

  // Trova/crea checklist
  let { data: existing } = await supabase
    .from("onboarding_checklists")
    .select("*")
    .eq("subscription_id", subscription_id)
    .maybeSingle()

  if (!existing) {
    const { data: created, error: ccErr } = await supabase
      .from("onboarding_checklists")
      .insert({ subscription_id, hotel_id: sub.hotel_id, status: "pending" })
      .select()
      .single()
    if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 })
    existing = created
  }

  // Carica template selezionati
  const tasksToInsert: Array<Record<string, unknown>> = []
  if (Array.isArray(template_ids) && template_ids.length > 0) {
    const { data: tpls } = await supabase
      .from("onboarding_task_templates")
      .select("*")
      .in("id", template_ids)
    for (const t of tpls || []) {
      tasksToInsert.push({
        checklist_id: existing!.id,
        template_id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        task_order: t.default_order ?? 0,
        status: "todo",
      })
    }
  }
  if (Array.isArray(custom_tasks)) {
    for (const c of custom_tasks) {
      if (!c?.title) continue
      tasksToInsert.push({
        checklist_id: existing!.id,
        title: String(c.title),
        description: c.description ?? null,
        category: c.category ?? null,
        task_order: Number(c.task_order ?? 999),
        due_date: c.due_date ?? null,
        status: "todo",
      })
    }
  }
  if (tasksToInsert.length > 0) {
    const { error: insErr } = await supabase.from("onboarding_tasks").insert(tasksToInsert)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Re-read tasks per ritornare lo stato aggiornato
  const { data: tasks } = await supabase
    .from("onboarding_tasks")
    .select("*")
    .eq("checklist_id", existing!.id)
    .order("task_order", { ascending: true })

  return NextResponse.json({ checklist: existing, tasks: tasks || [] })
}

/**
 * PATCH /api/onboarding/checklist
 * body: { checklist_id, status?, notes?, action?: 'go_configuring' | 'go_live' }
 *
 * Solo super_admin. `action=go_configuring` set status='configuring' +
 * configuration_started_at=now(). `action=go_live` set status='live' +
 * went_live_at=now().
 */
export async function PATCH(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied
  const body = await req.json()
  const { checklist_id, status, notes, action } = body || {}
  if (!checklist_id) return NextResponse.json({ error: "checklist_id required" }, { status: 400 })

  const supabase = await createServiceRoleClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) update.status = status
  if (notes !== undefined) update.notes = notes
  if (action === "go_configuring") {
    update.status = "configuring"
    update.configuration_started_at = new Date().toISOString()
  }
  if (action === "go_live") {
    update.status = "live"
    update.went_live_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("onboarding_checklists")
    .update(update)
    .eq("id", checklist_id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checklist: data })
}

// Suppress unused import warning in DEV (isDevAuthAsync used elsewhere in
// this file family; kept for symmetry).
void isDevAuthAsync
