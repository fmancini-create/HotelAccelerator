import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { sendSalesAgentInviteEmail } from "@/lib/sales/agent-invitation"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/superadmin/sales/invitations/[id]
 *
 * Cancella un invito venditore pendente. Usato dal superadmin per
 * "annullare" l'invito (es. email sbagliata, persona non disponibile).
 * Non tocca nulla se l'invito e' gia' stato accettato.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

  const svc = await createServiceRoleClient()
  const { error, count } = await svc
    .from("sales_agent_invitations")
    .delete({ count: "exact" })
    .eq("id", id)
    .is("accepted_at", null)

  if (error) {
    console.error("[invitations/DELETE] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  if (!count) {
    return NextResponse.json(
      { error: "not_found_or_accepted", details: "Invito non trovato o gia' accettato" },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/superadmin/sales/invitations/[id]
 *
 * Reinvia l'email di invito (usa stesso token, aggiorna expires_at +7 giorni
 * dalla data corrente cosi non scade subito). Incrementa il counter
 * email_sent_count.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })

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
      { error: "not_found_or_accepted", details: "Invito non trovato o gia' accettato" },
      { status: 404 },
    )
  }

  // Estendi scadenza a 7 giorni se gia' scaduto o vicino alla scadenza.
  const newExpiresAt = new Date()
  newExpiresAt.setDate(newExpiresAt.getDate() + 7)
  await svc
    .from("sales_agent_invitations")
    .update({ expires_at: newExpiresAt.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)

  // Manda l'email (la funzione fa anche il bookkeeping di email_sent_count
  // e last_sent_at). Errori loggati ma non bloccanti per l'UX: meglio
  // mostrare "Reinviato" che fallire perche' SMTP e' rallentato.
  await sendSalesAgentInviteEmail({
    email: inv.email,
    inviteeName: inv.display_name ?? inv.email,
    token: inv.token,
    inviterName: inv.invited_by_name ?? "il team SANTADDEO",
    commissionPercentage: inv.default_commission_percentage,
    expiresInDays: 7,
    invitationId: inv.id,
  })

  return NextResponse.json({ ok: true })
}
