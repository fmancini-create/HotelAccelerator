/**
 * Cron: notifica venditori per task in scadenza e task scaduti.
 *
 * Logica:
 *  - Trova tutti i task `task_status='pending'` con `due_at <= now() + 24h`
 *    raggruppati per agente.
 *  - Per ogni task:
 *      - se due_at < now()  -> notifica "task_overdue" (1 per task,
 *        dedup_key=overdue:<activity_id>)
 *      - se due_at >= now() -> notifica "task_due_soon" (1 per task,
 *        dedup_key=due_soon:<activity_id>:<due_at_iso>)
 *
 * Gira ogni mattina alle 8:00 (vedi vercel.json).
 *
 * Sicurezza: route pubblica via PUBLIC_ROUTES `/api/cron/*`, il route handler
 * richiede `Authorization: Bearer ${CRON_SECRET}` (stesso pattern degli altri cron).
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { notifyUser } from "@/lib/notifications/notify"
import { requireCronAuth } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  // Auth cron
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const svc = await createServiceRoleClient()
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Pesca i task pending con due_at <= now+24h (include sia scaduti che in scadenza).
  // Range robusto: 30 giorni indietro per non lasciare orfani vecchi.
  const lowerBound = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: tasks, error } = await svc
    .from("prospect_activities")
    .select(
      "id, prospect_id, agent_id, type, title, due_at, prospect:prospect_id(name), agent:agent_id(user_id, display_name)",
    )
    .eq("task_status", "pending")
    .not("agent_id", "is", null)
    .gte("due_at", lowerBound)
    .lte("due_at", in24h.toISOString())
    .order("due_at", { ascending: true })
    .limit(1000)

  if (error) {
    console.error("[cron/notify-overdue-tasks] query error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let overdueCreated = 0
  let dueSoonCreated = 0
  let deduped = 0
  let failed = 0
  let skippedNoUser = 0

  const nowMs = now.getTime()

  for (const t of tasks ?? []) {
    const userId = (t as any).agent?.user_id
    if (!userId) {
      skippedNoUser++
      continue
    }
    const dueMs = t.due_at ? new Date(t.due_at).getTime() : NaN
    if (!isFinite(dueMs)) continue

    const prospectName = (t as any).prospect?.name ?? "una struttura"
    const taskTitle = t.title || labelForType(t.type)

    const isOverdue = dueMs < nowMs
    const dedupKey = isOverdue
      ? `task_overdue:${t.id}`
      : `task_due_soon:${t.id}:${new Date(dueMs).toISOString().slice(0, 10)}`

    const r = await notifyUser({
      userId,
      type: isOverdue ? "task_overdue" : "task_due_soon",
      title: isOverdue
        ? `Task scaduto: ${taskTitle}`
        : `Task in scadenza: ${taskTitle}`,
      body: isOverdue
        ? `Hai un task scaduto per ${prospectName}.`
        : `Hai un task entro 24 ore per ${prospectName}.`,
      actionUrl: `/sales/prospects/${t.prospect_id}`,
      dedupKey,
    })

    if (r.ok) {
      if (r.deduped) deduped++
      else if (isOverdue) overdueCreated++
      else dueSoonCreated++
    } else {
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: tasks?.length ?? 0,
    overdueCreated,
    dueSoonCreated,
    deduped,
    failed,
    skippedNoUser,
  })
}

function labelForType(type: string): string {
  switch (type) {
    case "call":
      return "chiamata"
    case "email":
      return "email"
    case "visit":
      return "visita"
    case "meeting":
      return "incontro"
    case "note":
      return "nota"
    default:
      return "attività"
  }
}
