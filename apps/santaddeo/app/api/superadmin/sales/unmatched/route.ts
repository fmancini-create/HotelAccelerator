import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { recordInboundMessage } from "@/lib/sales/lead-messages"

export const dynamic = "force-dynamic"

/** Verifica che l'utente sia super admin. Restituisce il client service-role. */
async function requireSuperAdmin() {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  const svc = await createServiceRoleClient()
  return { user, svc }
}

/**
 * GET: lista la posta NON abbinata (coda di revisione super admin).
 * ?status=pending|converted|archived (default pending)
 */
export async function GET(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { svc } = auth

  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "pending"

  const { data: emails, error } = await svc
    .from("sales_unmatched_emails")
    .select("*")
    .eq("status", status)
    .order("received_at", { ascending: false })
    .limit(200)
  if (error) {
    console.error("[unmatched] list error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Arricchisce con il nome del venditore suggerito (join manuale leggero).
  const agentIds = [...new Set((emails ?? []).map((e) => e.suggested_agent_id).filter(Boolean))]
  let agentsById: Record<string, { display_name: string | null; email: string | null; sender_email: string | null }> =
    {}
  if (agentIds.length > 0) {
    const { data: agents } = await svc
      .from("sales_agents")
      .select("id, display_name, email, sender_email")
      .in("id", agentIds as string[])
    agentsById = Object.fromEntries((agents ?? []).map((a) => [a.id, a]))
  }

  const enriched = (emails ?? []).map((e) => ({
    ...e,
    suggested_agent: e.suggested_agent_id ? agentsById[e.suggested_agent_id] ?? null : null,
  }))

  // Lista venditori attivi per la select "assegna a".
  const { data: agents } = await svc
    .from("sales_agents")
    .select("id, display_name, email, sender_email")
    .eq("is_active", true)
    .order("display_name")

  return NextResponse.json({ emails: enriched, agents: agents ?? [] })
}

/**
 * POST: agisce su una mail non abbinata.
 * Body: { id, action: "convert" | "archive", agent_id? }
 *  - convert: crea un nuovo lead (assegnato ad agent_id o al suggerito) con
 *    l'email del mittente, e importa la mail nel thread del lead.
 *  - archive: marca la mail come archiviata (spam / non rilevante).
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { user, svc } = auth

  const body = await request.json().catch(() => null)
  if (!body?.id || !body?.action) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const id = String(body.id)
  const action = String(body.action)

  const { data: email } = await svc
    .from("sales_unmatched_emails")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!email) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (email.status !== "pending") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 })
  }

  if (action === "archive") {
    await svc
      .from("sales_unmatched_emails")
      .update({ status: "archived", resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: "archived" })
  }

  if (action === "convert") {
    const agentId = body.agent_id ? String(body.agent_id) : email.suggested_agent_id
    if (!agentId) {
      return NextResponse.json({ error: "agent_required" }, { status: 400 })
    }
    const { data: agent } = await svc
      .from("sales_agents")
      .select("id")
      .eq("id", agentId)
      .maybeSingle()
    if (!agent) return NextResponse.json({ error: "agent_not_found" }, { status: 400 })

    const fromEmail = (email.from_email || "").toLowerCase()
    // Riusa un lead esistente con stessa email per quel venditore, se c'e'.
    const { data: existingLead } = await svc
      .from("sales_leads")
      .select("id")
      .eq("sales_agent_id", agentId)
      .ilike("email", fromEmail)
      .limit(1)
      .maybeSingle()

    let leadId = existingLead?.id ?? null
    if (!leadId) {
      // Deriva nome/cognome dal "From: Nome Cognome <email>".
      const name = (email.from_name || "").trim()
      const parts = name.split(/\s+/).filter(Boolean)
      const firstName = parts[0] || fromEmail.split("@")[0] || "Contatto"
      const lastName = parts.slice(1).join(" ") || ""
      const { data: newLead, error: leadErr } = await svc
        .from("sales_leads")
        .insert({
          sales_agent_id: agentId,
          first_name: firstName,
          last_name: lastName,
          hotel_name: "",
          email: fromEmail,
          notes: "Creato da posta non abbinata",
          pipeline_stage: "new",
          tracking_token: crypto.randomBytes(16).toString("hex"),
        })
        .select("id")
        .single()
      if (leadErr || !newLead) {
        console.error("[unmatched] create lead error:", leadErr?.message)
        return NextResponse.json({ error: "lead_create_failed" }, { status: 500 })
      }
      leadId = newLead.id
    }

    // Importa la mail nel thread del lead (come messaggio inbound).
    await recordInboundMessage({
      leadId,
      salesAgentId: agentId,
      fromEmail: email.from_email,
      toEmail: email.to_email,
      subject: email.subject,
      bodyHtml: email.body_html,
      bodyText: email.body_text,
      messageId: email.message_id,
      inReplyTo: email.in_reply_to,
      references: email.email_references,
      imapUid: email.imap_uid,
      receivedAt: email.received_at,
    })

    await svc
      .from("sales_unmatched_emails")
      .update({
        status: "converted",
        resolved_lead_id: leadId,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)

    return NextResponse.json({ ok: true, status: "converted", lead_id: leadId })
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 })
}
