import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { sendSalesAgentInviteEmail } from "@/lib/sales/agent-invitation"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/superadmin/sales/invitations/[id]/approval
 *
 * Approva o rifiuta un invito agente creato da un capo area.
 *
 * Body:
 *   { action: 'approve' } -> setta approval_status='approved', salva
 *     approved_by_user_id/approved_at, manda email all'invitato col token.
 *   { action: 'reject', reason: string } -> setta approval_status='rejected',
 *     salva rejection_reason. Nessuna email all'invitato (l'invito muore qui),
 *     notifica al capo area inviante.
 *
 * Solo super_admin. Idempotente sui valori finali (approve di un gia'
 * approved e' no-op).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

  let body: { action?: string; reason?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const action = body.action
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 })
  }
  if (action === "reject" && !body.reason?.trim()) {
    return NextResponse.json(
      { error: "missing_reason", details: "Motivazione obbligatoria per rifiutare." },
      { status: 400 },
    )
  }

  const svc = await createServiceRoleClient()
  const { data: inv, error: invErr } = await svc
    .from("sales_agent_invitations")
    .select("*")
    .eq("id", id)
    .is("accepted_at", null)
    .maybeSingle()

  if (invErr) {
    return NextResponse.json({ error: "db_error", details: invErr.message }, { status: 500 })
  }
  if (!inv) {
    return NextResponse.json(
      { error: "not_found_or_accepted", details: "Invito non trovato o gia' accettato." },
      { status: 404 },
    )
  }

  if (action === "approve") {
    // Rinnova scadenza a 7 giorni dall'approvazione (l'invito puo' essere
    // stato in coda per giorni in attesa di review).
    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7)

    const { error: updErr } = await svc
      .from("sales_agent_invitations")
      .update({
        approval_status: "approved",
        approved_by_user_id: guard.user.id,
        approved_at: new Date().toISOString(),
        expires_at: newExpiresAt.toISOString(),
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updErr) {
      return NextResponse.json({ error: "db_error", details: updErr.message }, { status: 500 })
    }

    // Email all'invitato con il token. Best-effort: errore non blocca
    // l'approvazione (il super-admin puo' reinviare dall'altro endpoint).
    const requestOrigin =
      req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || undefined
    await sendSalesAgentInviteEmail({
      email: inv.email,
      inviteeName: inv.display_name ?? inv.email,
      token: inv.token,
      inviterName: inv.invited_by_name ?? "il team SANTADDEO",
      commissionPercentage: inv.default_commission_percentage,
      expiresInDays: 7,
      invitationId: inv.id,
      appOrigin: requestOrigin,
    })

    // Notifica il capo area inviante (fire-and-forget).
    if (inv.invited_by_agent_id) {
      void notifyInviter({
        svc,
        inviterAgentId: inv.invited_by_agent_id as string,
        inviteeEmail: inv.email,
        action: "approve",
      })
    }

    return NextResponse.json({ ok: true, status: "approved" })
  }

  // Reject
  const { error: rejErr } = await svc
    .from("sales_agent_invitations")
    .update({
      approval_status: "rejected",
      rejection_reason: body.reason!.trim(),
      approved_by_user_id: guard.user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (rejErr) {
    return NextResponse.json({ error: "db_error", details: rejErr.message }, { status: 500 })
  }

  if (inv.invited_by_agent_id) {
    void notifyInviter({
      svc,
      inviterAgentId: inv.invited_by_agent_id as string,
      inviteeEmail: inv.email,
      action: "reject",
      reason: body.reason!.trim(),
    })
  }

  return NextResponse.json({ ok: true, status: "rejected" })
}

/**
 * Manda al capo area inviante una conferma dell'esito. Sempre best-effort.
 * Niente template HTML elaborati: testo plain dentro un <p> per coerenza
 * col tono delle altre notifiche operative.
 */
async function notifyInviter(args: {
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>
  inviterAgentId: string
  inviteeEmail: string
  action: "approve" | "reject"
  reason?: string
}) {
  try {
    const { data: agent } = await args.svc
      .from("sales_agents")
      .select("display_name, email")
      .eq("id", args.inviterAgentId)
      .maybeSingle()

    if (!agent?.email) return

    const subject =
      args.action === "approve"
        ? `Invito agente approvato: ${args.inviteeEmail}`
        : `Invito agente rifiutato: ${args.inviteeEmail}`

    const body =
      args.action === "approve"
        ? `<p>Ciao ${agent.display_name ?? ""},</p>
           <p>Il super-admin ha <strong>approvato</strong> l'invito a <code>${escapeHtml(args.inviteeEmail)}</code>.
           L'agente ricevera' a momenti l'email per completare la registrazione.</p>
           <p>Una volta registrato, lo vedrai comparire nel tuo team su <a href="https://www.santaddeo.com/sales/team">santaddeo.com/sales/team</a>.</p>`
        : `<p>Ciao ${agent.display_name ?? ""},</p>
           <p>Il super-admin ha <strong>rifiutato</strong> l'invito a <code>${escapeHtml(args.inviteeEmail)}</code>.</p>
           <p><strong>Motivazione:</strong> ${escapeHtml(args.reason ?? "")}</p>
           <p>Se ritieni che sia un errore, contatta il super-admin.</p>`

    await sendEmail({ to: agent.email, subject, html: body })
  } catch (e) {
    console.error("[invitations/approval] notifyInviter failed:", e)
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
