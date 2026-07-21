import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { recordLeadActivity } from "@/lib/sales/lead-messages"
import { linkCallRecaps } from "@/lib/sales/call-recaps"

export const dynamic = "force-dynamic"

/** Verifica autenticazione + ownership del lead. Ritorna { svc, lead } o un errore. */
async function authorizeLead(id: string) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  const svc = await createServiceRoleClient()
  const { data: lead } = await svc
    .from("sales_leads")
    .select("id, sales_agent_id, sales_agents!inner(user_id)")
    .eq("id", id)
    .maybeSingle()
  if (!lead) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) }

  const agent = (lead as any).sales_agents
  if (profile.role !== "super_admin" && agent?.user_id !== user.id) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  return { svc, lead, user }
}

/**
 * GET /api/sales/leads/[id]/activities
 * Timeline attivita' del lead (note, call, email, cambi stadio), piu' recenti
 * in cima.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorizeLead(id)
  if ("error" in auth) return auth.error
  const { svc } = auth

  // Aggancio ON-DEMAND dei riepiloghi Gemini per QUESTO lead: cosi' il recap
  // della call appena conclusa compare subito all'apertura della Cronologia,
  // senza attendere il cron (30 min). Best-effort: un errore (es. scope Google)
  // non deve mai impedire il caricamento della timeline.
  try {
    await linkCallRecaps({ leadId: id, sinceDays: 90 })
  } catch (e) {
    console.error("[lead-activities] on-demand recap link fallito:", e instanceof Error ? e.message : e)
  }

  const { data: activities, error } = await svc
    .from("sales_lead_activities")
    .select("id, activity_type, content, metadata, due_at, completed_at, created_at, created_by")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })

  return NextResponse.json({ activities: activities ?? [] })
}

/**
 * POST /api/sales/leads/[id]/activities
 * Crea una nota o una call/task manuale nella timeline.
 * Body: { type?: "note"|"call"|"task", content: string, due_at?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authorizeLead(id)
  if ("error" in auth) return auth.error
  const { svc, lead, user } = auth

  const body = await request.json().catch(() => ({}))
  const type = ["note", "call", "task"].includes(body?.type) ? body.type : "note"
  const content = String(body?.content ?? "").trim()
  const dueAt = body?.due_at ? new Date(body.due_at).toISOString() : null
  if (!content) return NextResponse.json({ error: "empty_content" }, { status: 400 })

  await recordLeadActivity({
    svc,
    leadId: id,
    salesAgentId: lead.sales_agent_id,
    createdBy: user.id,
    type,
    content,
    dueAt,
  })

  return NextResponse.json({ ok: true })
}
