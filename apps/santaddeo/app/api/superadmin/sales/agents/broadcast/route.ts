import { NextResponse } from "next/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { renderSantaddeoEmail } from "@/lib/sales/email-layout"

export const dynamic = "force-dynamic"

/**
 * Alias mittente consentiti per le comunicazioni del superadmin. Devono essere
 * configurati come "Invia come" / alias dell'account SMTP autenticato su Google
 * Workspace, altrimenti Gmail riscrive il From sull'account reale.
 */
const ALLOWED_SENDER_ALIASES = [
  "noreply@santaddeo.com",
  "commerciale@santaddeo.com",
  "direzione@santaddeo.com",
  "amministrazione@santaddeo.com",
  "support@santaddeo.com",
  "marketing@santaddeo.com",
  "f.mancini@santaddeo.com",
] as const
const DEFAULT_SENDER_ALIAS = "noreply@santaddeo.com"

/**
 * POST /api/superadmin/sales/agents/broadcast
 *
 * Invia una comunicazione (email) da parte del superadmin a uno o piu'
 * venditori selezionati. NON usa CC: spedisce una copia INDIVIDUALE a
 * ciascun venditore (privacy + personalizzazione del saluto col suo nome).
 *
 * Body:
 *  - agent_ids: string[]   id dei sales_agents destinatari (>=1)
 *  - subject: string       oggetto della mail
 *  - body: string          testo del messaggio (plain text, multilinea)
 *
 * Risposta: { sent, failed, results: [{agentId, email, ok, error?}] }
 */
export async function POST(request: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await request.json().catch(() => null)
  const agentIds: string[] = Array.isArray(body?.agent_ids)
    ? body.agent_ids.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    : []
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const messageBody = typeof body?.body === "string" ? body.body.trim() : ""
  // Alias mittente scelto in UI; validato contro l'allowlist (default: noreply).
  const requestedAlias = typeof body?.from_alias === "string" ? body.from_alias.trim().toLowerCase() : ""
  const fromAlias = (ALLOWED_SENDER_ALIASES as readonly string[]).includes(requestedAlias)
    ? requestedAlias
    : DEFAULT_SENDER_ALIAS

  if (agentIds.length === 0) {
    return NextResponse.json({ error: "no_recipients" }, { status: 400 })
  }
  if (!subject) {
    return NextResponse.json({ error: "missing_subject" }, { status: 400 })
  }
  if (!messageBody) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()

  // Nome del superadmin per il mittente "Nome - SANTADDEO <alias>".
  const { data: me } = await svc
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", guard.user.id)
    .maybeSingle()
  const adminName = [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim()
  const fromName = adminName ? `${adminName} - SANTADDEO` : "SANTADDEO"
  // Header From completo (es. "Filippo - SANTADDEO <commerciale@santaddeo.com>").
  const fromHeader = `${fromName} <${fromAlias}>`

  // Carico gli agenti selezionati col profile collegato (email + nome).
  const { data: agents, error: agentsErr } = await svc
    .from("sales_agents")
    .select("id, user_id, display_name, email, profiles:user_id (email, first_name, last_name)")
    .in("id", agentIds)

  if (agentsErr) {
    console.error("[sales/agents/broadcast] load agents error:", agentsErr)
    return NextResponse.json({ error: "db_error", details: agentsErr.message }, { status: 500 })
  }

  // Converto il testo plain in HTML sicuro (escape + <br/> + paragrafi).
  function textToHtml(text: string): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    return text
      .split(/\n{2,}/)
      .map((para) => `<p style="margin:0 0 16px 0">${esc(para).replace(/\n/g, "<br/>")}</p>`)
      .join("")
  }

  const results: Array<{ agentId: string; email: string | null; ok: boolean; error?: string }> = []

  for (const agent of agents ?? []) {
    // Email: prima quella dell'agente, poi dal profile collegato, infine auth.
    let email = (agent as any).email ?? (agent as any).profiles?.email ?? null
    if (!email && agent.user_id) {
      const { data: authUser } = await svc.auth.admin.getUserById(agent.user_id)
      email = authUser?.user?.email ?? null
    }

    if (!email) {
      results.push({ agentId: agent.id, email: null, ok: false, error: "email_mancante" })
      continue
    }

    const agentName =
      agent.display_name?.trim() ||
      [(agent as any).profiles?.first_name, (agent as any).profiles?.last_name].filter(Boolean).join(" ").trim() ||
      email.split("@")[0]

    // Saluto col solo nome di battesimo (prima parola del nome completo).
    const firstName = (agent as any).profiles?.first_name?.trim() || agentName.split(/\s+/)[0]
    const greeting = `<p style="margin:0 0 16px 0">Ciao <strong>${firstName.replace(
      /</g,
      "&lt;",
    )}</strong>,</p>`

    const html = renderSantaddeoEmail({
      preheader: messageBody.slice(0, 120),
      bodyHtml: greeting + textToHtml(messageBody),
    })

    const res = await sendEmail({
      to: email,
      subject,
      html,
      type: "sales_agent_broadcast",
      from: fromHeader,
      // Le risposte dei venditori tornano all'alias scelto dal superadmin.
      replyTo: fromAlias,
      userId: agent.user_id ?? undefined,
      metadata: { agent_id: agent.id, sent_by: guard.user.id, from_alias: fromAlias },
    }).catch((e) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))

    results.push({
      agentId: agent.id,
      email,
      ok: res.success,
      error: res.success ? undefined : ("error" in res ? res.error : "unknown"),
    })
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent

  return NextResponse.json({ sent, failed, results })
}
