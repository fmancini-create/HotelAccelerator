import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireAreaManager } from "@/lib/sales/area-manager-guard"
import { sendEmail } from "@/lib/email"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"

export const dynamic = "force-dynamic"

// Default 14 giorni di validita': il super-admin di solito approva entro
// pochi giorni, ma teniamo margine. La scadenza viene comunque rinnovata a
// 7 giorni al momento dell'approvazione.
const INVITE_EXPIRY_DAYS = 14

/**
 * GET /api/sales/area-manager/invitations
 *
 * Ritorna gli inviti agente creati dal capo area corrente (ogni stato).
 * Ordinati per data di creazione discendente. La UI mostra badge diversi
 * per pending/approved/rejected.
 */
export async function GET(request: Request) {
  const auth = await requireAreaManager(request, { allowSuperAdminImpersonation: true })
  if ("error" in auth) return auth.error

  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_agent_invitations")
    .select(
      "id, email, display_name, default_commission_percentage, expires_at, approval_status, approved_at, rejection_reason, accepted_at, accepted_user_id, created_at",
    )
    .eq("invited_by_agent_id", auth.areaManagerId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    console.error("[area-manager/invitations/GET] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  return NextResponse.json({ invitations: data ?? [] })
}

/**
 * POST /api/sales/area-manager/invitations
 *
 * Body: { email, display_name?, phone?, default_commission_percentage?, notes? }
 *
 * Crea un invito venditore con approval_status='pending'. Pre-imposta
 * parent_agent_id = capo area corrente, cosi' al claim il nuovo agente
 * verra' agganciato sotto il suo team automaticamente.
 *
 * NESSUNA email all'invitato finche' il super-admin non approva.
 * Notifica via email tutti i super-admin attivi (best-effort).
 */
export async function POST(request: Request) {
  const auth = await requireAreaManager(request)
  if ("error" in auth) return auth.error

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const displayName = typeof body.display_name === "string" ? body.display_name.trim() || null : null
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null
  const commission =
    typeof body.default_commission_percentage === "number" &&
    Number.isFinite(body.default_commission_percentage)
      ? body.default_commission_percentage
      : null

  const svc = await createServiceRoleClient()

  // Sanity: l'email non deve gia' essere associata a un agente attivo.
  // Caso d'uso del capo area: ho un nuovo collaboratore, lo invito. Se
  // esistesse gia' un agente con quella email, va gestito dal super-admin
  // (potrebbe essere stato in un altro team).
  const { data: existingAgent } = await svc
    .from("sales_agents")
    .select("id")
    .ilike("email", rawEmail)
    .maybeSingle()
  if (existingAgent) {
    return NextResponse.json(
      {
        error: "email_already_agent",
        details: "Esiste gia' un venditore con questa email. Chiedi al super-admin di assegnartelo.",
      },
      { status: 409 },
    )
  }

  // Recupera nome del capo area inviante per popolare invited_by_name
  // (usato nelle email).
  const { data: inviterAgent } = await svc
    .from("sales_agents")
    .select("display_name, email")
    .eq("id", auth.areaManagerId)
    .maybeSingle()

  const inviterName = inviterAgent?.display_name || inviterAgent?.email || "Un capo area"

  // Upsert idempotente su email pendente (stesso pattern del flusso
  // super-admin). Se esiste gia' un invito pending creato dallo stesso
  // capo area per la stessa email, lo aggiorniamo invece di duplicare.
  const { data: existing } = await svc
    .from("sales_agent_invitations")
    .select("id, approval_status")
    .ilike("email", rawEmail)
    .is("accepted_at", null)
    .maybeSingle()

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

  const payload = {
    email: rawEmail,
    token,
    display_name: displayName,
    phone,
    default_commission_percentage: commission,
    notes,
    invited_by: auth.userId,
    invited_by_name: inviterName,
    invited_by_agent_id: auth.areaManagerId,
    parent_agent_id: auth.areaManagerId,
    approval_status: "pending",
    approved_by_user_id: null,
    approved_at: null,
    rejection_reason: null,
    expires_at: expiresAt.toISOString(),
    email_last_error: null,
  }

  let invitationId: string
  if (existing) {
    // Se l'invito pre-esistente non era stato creato da questo capo area
    // o era gia' approvato, blocco per evitare conflitti di parent.
    const { data: row } = await svc
      .from("sales_agent_invitations")
      .select("invited_by_agent_id, approval_status")
      .eq("id", existing.id)
      .single()
    if (
      row?.invited_by_agent_id &&
      row.invited_by_agent_id !== auth.areaManagerId
    ) {
      return NextResponse.json(
        { error: "email_already_invited", details: "Email gia' invitata da un altro capo area." },
        { status: 409 },
      )
    }
    if (row?.approval_status === "approved") {
      return NextResponse.json(
        { error: "email_already_invited", details: "Email gia' invitata e approvata: aspetta il signup." },
        { status: 409 },
      )
    }
    const { data, error: upErr } = await svc
      .from("sales_agent_invitations")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id")
      .single()
    if (upErr || !data) {
      console.error("[area-manager/invitations/POST] update err:", upErr)
      return NextResponse.json({ error: "db_error", details: upErr?.message }, { status: 500 })
    }
    invitationId = data.id
  } else {
    const { data, error: insErr } = await svc
      .from("sales_agent_invitations")
      .insert(payload)
      .select("id")
      .single()
    if (insErr || !data) {
      console.error("[area-manager/invitations/POST] insert err:", insErr)
      return NextResponse.json({ error: "db_error", details: insErr?.message }, { status: 500 })
    }
    invitationId = data.id
  }

  // Notifica super-admin. Best-effort: errori loggati, non bloccano.
  void notifySuperAdminsPending({
    inviteeEmail: rawEmail,
    inviteeName: displayName,
    inviterName,
  }).catch((e) => console.error("[area-manager/invitations] notify err:", e))

  return NextResponse.json({ ok: true, invitation_id: invitationId, status: "pending" })
}

async function notifySuperAdminsPending(args: {
  inviteeEmail: string
  inviteeName: string | null
  inviterName: string
}) {
  const recipients = await getSuperAdminEmails()
  if (recipients.length === 0) return

  const subject = `Nuovo invito agente da approvare: ${args.inviteeEmail}`
  const html = `
    <p><strong>${escapeHtml(args.inviterName)}</strong> ha invitato un nuovo agente:</p>
    <ul>
      <li><strong>Email:</strong> <code>${escapeHtml(args.inviteeEmail)}</code></li>
      ${args.inviteeName ? `<li><strong>Nome:</strong> ${escapeHtml(args.inviteeName)}</li>` : ""}
    </ul>
    <p>L'invito e' in attesa di approvazione. Esamina e approva o rifiuta da
    <a href="https://www.santaddeo.com/superadmin/sales/invitations">santaddeo.com/superadmin/sales/invitations</a>.</p>
  `
  await Promise.allSettled(
    recipients.map((to) => sendEmail({ to, subject, html })),
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
