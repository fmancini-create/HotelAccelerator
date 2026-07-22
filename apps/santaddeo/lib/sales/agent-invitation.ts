/**
 * Helpers per il flusso "invito venditore" (sales_agent_invitations).
 *
 *  - validateSalesAgentInvitation(token): verifica che il token sia valido,
 *    non scaduto, non gia' accettato.
 *  - claimSalesAgentInvitation({...}): chiamato dal signup dopo aver creato
 *    l'utente. Marca l'invito accettato e crea/aggiorna sales_agents
 *    copiando i campi pre-impostati dal superadmin.
 *  - sendSalesAgentInviteEmail({...}): manda l'email di invito (usata sia
 *    al primo invio in /api/superadmin/sales/agents POST sia al reinvio in
 *    /api/superadmin/sales/invitations/[id] POST).
 *
 * Tutto il flusso e' idempotente.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { getSalesAgentInviteEmail } from "@/lib/email-templates"

export interface AgentInvitationSummary {
  id: string
  email: string
  display_name: string | null
  default_commission_percentage: number | null
  invited_by_name: string | null
  expires_at: string
}

/** Type guard: valida la forma del token (esadecimale o alfanumerico). */
function isValidTokenShape(token: unknown): token is string {
  if (typeof token !== "string" || !token) return false
  return /^[a-f0-9]{32,128}$/i.test(token) || /^[a-zA-Z0-9]{16,128}$/.test(token)
}

/**
 * Lookup di un'invitation per token. Ritorna `null` se token non esiste,
 * scaduto o gia' accettato.
 */
export async function validateSalesAgentInvitation(
  token: string,
): Promise<AgentInvitationSummary | null> {
  if (!isValidTokenShape(token)) return null

  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_agent_invitations")
    .select(
      "id, email, display_name, default_commission_percentage, invited_by_name, expires_at, accepted_at, approval_status",
    )
    .eq("token", token)
    .maybeSingle()

  if (error || !data) return null
  if (data.accepted_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null
  // Solo inviti approvati possono essere accettati. Inviti 'pending' creati
  // dal capo area NON devono permettere il signup finche' il super-admin
  // non li approva. Inviti 'rejected' sono morti.
  if (data.approval_status && data.approval_status !== "approved") return null

  return {
    id: data.id,
    email: data.email,
    display_name: data.display_name,
    default_commission_percentage: data.default_commission_percentage,
    invited_by_name: data.invited_by_name,
    expires_at: data.expires_at,
  }
}

/**
 * Accetta un invito: crea sales_agents per il nuovo userId copiando i campi
 * pre-impostati nell'invito, marca invitation.accepted_at, setta
 * profiles.role = 'sales_agent' (non sovrascrive 'super_admin').
 *
 * Tollerante: se invitation non valida ritorna null e il signup prosegue.
 */
export async function claimSalesAgentInvitation(args: {
  token: string
  userId: string
  email: string
  firstName?: string
  lastName?: string
}): Promise<{ invitationId: string; agentId: string } | null> {
  const summary = await validateSalesAgentInvitation(args.token)
  if (!summary) return null

  // Sanity: l'email che si registra deve corrispondere a quella invitata
  // (case-insensitive). Se non corrisponde non promuoviamo a sales_agent
  // ma lasciamo che il signup prosegua.
  if (summary.email.toLowerCase() !== args.email.toLowerCase()) {
    console.warn(
      "[agent-invitation] email mismatch on claim, expected:",
      summary.email,
      "got:",
      args.email,
    )
    return null
  }

  const svc = await createServiceRoleClient()

  // Carica i campi completi dell'invitation. Spezzo la lista colonne in
  // un array per evitare ambiguita' di typing su select() concatenata che
  // TS narrowing non riesce a inferire.
  const { data: full, error: fullErr } = await svc
    .from("sales_agent_invitations")
    .select([
      "id",
      "display_name",
      "phone",
      "default_commission_percentage",
      "global_can_view_subscription",
      "global_can_view_payments",
      "global_can_view_metrics",
      "global_can_view_full_dashboard",
      "notes",
      "parent_agent_id",
    ].join(","))
    .eq("id", summary.id)
    .single<AgentInvitationFullRow>()

  if (fullErr || !full) {
    console.error("[agent-invitation] failed to load full invitation row:", fullErr)
    return null
  }

  const fullName = [args.firstName, args.lastName].filter(Boolean).join(" ").trim()

  const agentPayload: Record<string, unknown> = {
    user_id: args.userId,
    display_name: full.display_name || fullName || null,
    email: args.email,
    phone: full.phone,
    default_commission_percentage: full.default_commission_percentage,
    global_can_view_subscription: !!full.global_can_view_subscription,
    global_can_view_payments: !!full.global_can_view_payments,
    global_can_view_metrics: !!full.global_can_view_metrics,
    global_can_view_full_dashboard: !!full.global_can_view_full_dashboard,
    notes: full.notes,
    is_active: true,
  }
  // Se l'invito e' stato creato dal capo area (parent_agent_id pre-impostato),
  // alla nascita dell'agente lo agganciamo subito sotto il suo capo area.
  // Il trigger trg_validate_parent_is_area_manager verifica che il parent
  // sia effettivamente un capo area attivo: se nel frattempo il capo area
  // e' stato demote/disattivato, l'upsert fallira' e il signup verra'
  // completato senza parent (l'agente restera' orfano fino a riassegnazione).
  if (full.parent_agent_id) {
    agentPayload.parent_agent_id = full.parent_agent_id
  }

  const { data: agent, error: upErr } = await svc
    .from("sales_agents")
    .upsert(agentPayload, { onConflict: "user_id" })
    .select("id")
    .single<{ id: string }>()

  if (upErr || !agent) {
    console.error("[agent-invitation] upsert sales_agents failed:", upErr)
    return null
  }

  // Promuovi profile a sales_agent (se non gia' superadmin)
  await svc
    .from("profiles")
    .update({ role: "sales_agent" })
    .eq("id", args.userId)
    .neq("role", "super_admin")

  // Marca invitation come accettata
  await svc
    .from("sales_agent_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_user_id: args.userId,
    })
    .eq("id", full.id)

  return { invitationId: full.id, agentId: agent.id }
}

/** Forma della riga restituita dalla select() in claim. */
type AgentInvitationFullRow = {
  id: string
  display_name: string | null
  phone: string | null
  default_commission_percentage: number | null
  global_can_view_subscription: boolean
  global_can_view_payments: boolean
  global_can_view_metrics: boolean
  global_can_view_full_dashboard: boolean
  notes: string | null
  parent_agent_id: string | null
}

/**
 * Manda (o re-invia) l'email di invito al venditore. Aggiorna i contatori
 * email_sent_count, email_last_sent_at, email_last_error sull'invitation.
 *
 * Non lancia: errori loggati e marcati come email_last_error nel DB.
 */
export async function sendSalesAgentInviteEmail(args: {
  email: string
  inviteeName: string
  token: string
  inviterName: string
  commissionPercentage: number | null
  expiresInDays: number
  invitationId: string
  appOrigin?: string
}): Promise<{ success: boolean; error?: string }> {
  const appUrl = (
    args.appOrigin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.santaddeo.com"
  ).replace(/\/$/, "")
  const inviteUrl = `${appUrl}/auth/sign-up?invite_agent=${args.token}&email=${encodeURIComponent(args.email)}`

  const html = getSalesAgentInviteEmail({
    inviteeName: args.inviteeName,
    inviterName: args.inviterName,
    inviteUrl,
    commissionPercentage: args.commissionPercentage,
    expiresInDays: args.expiresInDays,
  })

  const result = await sendEmail({
    to: args.email,
    subject: "Sei stato invitato come venditore SANTADDEO",
    html,
  }).catch((e) => ({
    success: false as const,
    error: e instanceof Error ? e.message : String(e),
  }))

  // Bookkeeping
  const svc = await createServiceRoleClient()
  if (result.success) {
    // Incrementa il counter atomically via fetch + update (best-effort, no
    // CAS: la race window e' negligibile per UI superadmin).
    const { data: row } = await svc
      .from("sales_agent_invitations")
      .select("email_sent_count")
      .eq("id", args.invitationId)
      .maybeSingle<{ email_sent_count: number | null }>()
    const nextCount = ((row?.email_sent_count ?? 0) as number) + 1
    await svc
      .from("sales_agent_invitations")
      .update({
        email_sent_count: nextCount,
        email_last_sent_at: new Date().toISOString(),
        email_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.invitationId)
    return { success: true }
  } else {
    const errMsg = "error" in result ? result.error : "unknown"
    await svc
      .from("sales_agent_invitations")
      .update({
        email_last_error: errMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.invitationId)
    return { success: false, error: errMsg }
  }
}
