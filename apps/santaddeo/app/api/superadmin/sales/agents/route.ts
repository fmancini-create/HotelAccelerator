import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { sendSalesAgentInviteEmail } from "@/lib/sales/agent-invitation"

export const dynamic = "force-dynamic"

const INVITE_EXPIRY_DAYS = 14

/**
 * GET /api/superadmin/sales/agents
 *
 * Lista venditori (sales_agents) col profile collegato e i conteggi
 * strutture/lead. Usato dalla tab "Agenti" superadmin.
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()

  // 1. Agenti gia' registrati. Carichiamo agent + profile, poi aggreghiamo
  // a parte hotels e leads per produrre i campi flat che la UI consuma:
  //   - hotels_count, active_hotels_count
  //   - leads_count, converted_leads_count, conversion_rate
  // Il nesting Supabase con select(`hotels:...(count)`) ritornava un array
  // tipo [{count: N}] che il client non sapeva interpretare → undefined/NaN.
  const { data: rawAgents, error } = await svc
    .from("sales_agents")
    .select(
      `
      *,
      profiles:user_id (id, email, first_name, last_name, role, is_active)
      `,
    )
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[superadmin/sales/agents] list error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // 1b. Stats per-agente: una select per relazione, aggreghiamo in JS.
  const [{ data: hotelRows }, { data: leadRows }] = await Promise.all([
    svc.from("sales_agent_hotels").select("sales_agent_id, activated_at"),
    svc.from("sales_leads").select("sales_agent_id, converted_at"),
  ])

  const hotelStatsByAgent = new Map<string, { total: number; active: number }>()
  for (const h of hotelRows ?? []) {
    const agentId = (h as any).sales_agent_id as string
    if (!agentId) continue
    const cur = hotelStatsByAgent.get(agentId) ?? { total: 0, active: 0 }
    cur.total += 1
    if ((h as any).activated_at) cur.active += 1
    hotelStatsByAgent.set(agentId, cur)
  }

  const leadStatsByAgent = new Map<string, { total: number; converted: number }>()
  for (const l of leadRows ?? []) {
    const agentId = (l as any).sales_agent_id as string
    if (!agentId) continue
    const cur = leadStatsByAgent.get(agentId) ?? { total: 0, converted: 0 }
    cur.total += 1
    if ((l as any).converted_at) cur.converted += 1
    leadStatsByAgent.set(agentId, cur)
  }

  const agents = (rawAgents ?? []).map((a) => {
    const hs = hotelStatsByAgent.get(a.id) ?? { total: 0, active: 0 }
    const ls = leadStatsByAgent.get(a.id) ?? { total: 0, converted: 0 }
    return {
      ...a,
      // Campi flat consumati dalla UI superadmin/sales:
      hotels_count: hs.total,
      active_hotels_count: hs.active,
      leads_count: ls.total,
      converted_leads_count: ls.converted,
      conversion_rate: ls.total > 0 ? ls.converted / ls.total : 0,
      // Email/nome flat per filtri tabellari (la UI cerca su `a.email` e
      // `a.display_name`).
      email: a.profiles?.email ?? a.contact_email ?? null,
      display_name:
        a.display_name ??
        [a.profiles?.first_name, a.profiles?.last_name].filter(Boolean).join(" ").trim() ??
        null,
    }
  })

  // 2. Inviti pendenti (venditori non ancora registrati). Restituiti come
  // lista separata cosi la UI puo' mostrarli con un badge "Invito inviato".
  const { data: invitations, error: invErr } = await svc
    .from("sales_agent_invitations")
    .select(
      "id, email, display_name, phone, default_commission_percentage, " +
        "global_can_view_subscription, global_can_view_payments, global_can_view_metrics, global_can_view_full_dashboard, " +
        "invited_by_name, expires_at, accepted_at, email_sent_count, email_last_sent_at, email_last_error, created_at",
    )
    .is("accepted_at", null)
    .order("created_at", { ascending: false })

  if (invErr) {
    console.warn("[superadmin/sales/agents] invitations list warning:", invErr)
  }

  return NextResponse.json({
    agents: agents ?? [],
    invitations: invitations ?? [],
  })
}

/**
 * POST /api/superadmin/sales/agents
 *
 * Due flussi:
 *  A) Email corrisponde a un profile gia' registrato → upsert sales_agents
 *     e set role='sales_agent' (comportamento storico).
 *  B) Email NON corrisponde a nessun profile → upsert sales_agent_invitations
 *     (token + scadenza) e invia email di invito. Quando l'utente clicchera'
 *     il link e completera' la registrazione, il signup riconoscera' il
 *     token e lo promuovera' automaticamente a sales_agent copiando i campi
 *     pre-impostati qui.
 *
 * Body:
 *  - user_id (opt): id del profile da promuovere (alternativa a email)
 *  - email (opt): lookup profile via email (case-insensitive). Se assente
 *    dal DB, parte il flusso invito.
 *  - display_name, phone, default_commission_percentage,
 *    global_can_view_*, notes: salvati direttamente sull'agent o
 *    sull'invitation (per essere applicati al momento dell'accettazione).
 *
 * Almeno uno tra user_id ed email deve essere fornito.
 */
export async function POST(request: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await request.json().catch(() => null)
  const rawUserId = typeof body?.user_id === "string" ? body.user_id.trim() : ""
  const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

  if (!rawUserId && !rawEmail) {
    return NextResponse.json({ error: "missing_user_id_or_email" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()

  // Gerarchia / capo area. Stessa semantica del form di modifica
  // (agent-detail-client): se e' capo area, parent va forzato a null;
  // l'override % si applica solo se e' capo area.
  const isAreaManager = !!body.is_area_manager
  const parentAgentId =
    !isAreaManager &&
    typeof body.parent_agent_id === "string" &&
    body.parent_agent_id.trim()
      ? body.parent_agent_id.trim()
      : null
  const areaOverridePct =
    isAreaManager &&
    body.area_manager_override_pct != null &&
    body.area_manager_override_pct !== ""
      ? Number.parseFloat(String(body.area_manager_override_pct))
      : null

  // Fields condivisi tra agent diretto e invitation. Includono i 4 permessi
  // globali, le note e `parent_agent_id` (colonna presente su ENTRAMBE le
  // tabelle: per gli invitati, all'accettazione l'agente viene agganciato
  // sotto il capo area pre-impostato).
  const sharedFields = {
    display_name: body.display_name ?? null,
    phone: body.phone ?? null,
    default_commission_percentage: body.default_commission_percentage ?? null,
    global_can_view_subscription: !!body.global_can_view_subscription,
    global_can_view_payments: !!body.global_can_view_payments,
    global_can_view_metrics: !!body.global_can_view_metrics,
    global_can_view_full_dashboard: !!body.global_can_view_full_dashboard,
    notes: body.notes ?? null,
    parent_agent_id: parentAgentId,
  }

  // Lookup profile esistente
  let profileQuery = svc.from("profiles").select("id, email, first_name, last_name, role").limit(1)
  if (rawUserId) {
    profileQuery = profileQuery.eq("id", rawUserId)
  } else {
    profileQuery = profileQuery.ilike("email", rawEmail)
  }
  const { data: profile } = await profileQuery.maybeSingle()

  // ─── FLUSSO A: profile esistente, promuovo direttamente ─────────────────
  if (profile) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
    const insertPayload: Record<string, unknown> = {
      user_id: profile.id,
      email: body.email ?? profile.email ?? null,
      ...sharedFields,
      display_name: sharedFields.display_name ?? (fullName || null),
      is_active: body.is_active ?? true,
      // Campi gerarchia disponibili solo sulla tabella sales_agents (non sugli
      // inviti): qui possiamo impostarli subito perche' l'agente esiste gia'.
      is_area_manager: isAreaManager,
      area_manager_override_pct: areaOverridePct,
    }

    const { data: agent, error: upErr } = await svc
      .from("sales_agents")
      .upsert(insertPayload, { onConflict: "user_id" })
      .select()
      .single()

    if (upErr) {
      console.error("[superadmin/sales/agents] upsert error:", upErr)
      return NextResponse.json({ error: "db_error", details: upErr.message }, { status: 500 })
    }

    if (profile.role !== "super_admin" && profile.role !== "sales_agent") {
      const { error: roleErr } = await svc
        .from("profiles")
        .update({ role: "sales_agent" })
        .eq("id", profile.id)
      if (roleErr) {
        // Errore tipico: il CHECK constraint profiles_role_check non
        // include 'sales_agent'. La migration e' stata applicata in
        // 03/05/2026 (vedi ALTER TABLE profiles_role_check), ma se per
        // qualche motivo viene rimossa, lo logghiamo invece di fallire
        // silenziosamente come succedeva prima.
        console.error(
          "[superadmin/sales/agents] failed to set role=sales_agent on profile",
          profile.id,
          roleErr,
        )
      }
    }

    return NextResponse.json({ status: "created", agent })
  }

  // ─── FLUSSO B: profile non esiste → invio invito ────────────────────────
  if (!rawEmail) {
    // user_id senza profile: scenario impossibile a meno che l'utente sia
    // stato cancellato. Ritorno errore esplicito.
    return NextResponse.json(
      { error: "profile_not_found", details: "Profile id non trovato" },
      { status: 404 },
    )
  }

  // Genero token + scadenza
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

  // Recupero il nome dell'inviter per l'email
  const inviterName = await getInviterName(svc, guard.user.id)

  // Upsert idempotente sull'email pendente. Se esiste gia' un'invitation
  // attiva per la stessa email, la rinnovo (nuovo token + scadenza + email).
  // Se invece esiste una invitation gia' accettata, la lascio stare e
  // creo un nuovo record (caso ultra-raro: stesso utente reinvitato dopo
  // aver cancellato il suo profile).
  const { data: existing } = await svc
    .from("sales_agent_invitations")
    .select("id")
    .ilike("email", rawEmail)
    .is("accepted_at", null)
    .maybeSingle()

  const invitationPayload = {
    email: rawEmail,
    token,
    ...sharedFields,
    invited_by: guard.user.id,
    invited_by_name: inviterName,
    expires_at: expiresAt.toISOString(),
    email_last_error: null,
  }

  let invitationId: string | null = null
  if (existing) {
    const { data, error: upErr } = await svc
      .from("sales_agent_invitations")
      .update({
        ...invitationPayload,
        // email_sent_count viene incrementato dopo l'invio email
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single()
    if (upErr) {
      console.error("[superadmin/sales/agents] invitation update error:", upErr)
      return NextResponse.json({ error: "db_error", details: upErr.message }, { status: 500 })
    }
    invitationId = data.id
  } else {
    const { data, error: insErr } = await svc
      .from("sales_agent_invitations")
      .insert(invitationPayload)
      .select("id")
      .single()
    if (insErr) {
      console.error("[superadmin/sales/agents] invitation insert error:", insErr)
      return NextResponse.json({ error: "db_error", details: insErr.message }, { status: 500 })
    }
    invitationId = data.id
  }

  // Origin per la URL di invito: preferisci la request, fallback su NEXT_PUBLIC_APP_URL
  const requestOrigin =
    request.headers.get("origin") ||
    request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
    undefined

  const inviteeName =
    sharedFields.display_name ||
    rawEmail.split("@")[0] ||
    "Venditore"

  // A questo punto invitationId e' sempre impostato (entrambi i branch
  // sopra ritornano early in caso di errore). Type-narrow esplicito.
  if (!invitationId) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
  const emailResult = await sendSalesAgentInviteEmail({
    email: rawEmail,
    inviteeName,
    token,
    inviterName,
    commissionPercentage: sharedFields.default_commission_percentage as number | null,
    expiresInDays: INVITE_EXPIRY_DAYS,
    invitationId,
    appOrigin: requestOrigin,
  })

  return NextResponse.json({
    status: "invited",
    invitation: {
      id: invitationId,
      email: rawEmail,
      expires_at: expiresAt.toISOString(),
    },
    emailSent: emailResult.success,
    message: emailResult.success
      ? "Invito inviato. Il venditore ricevera' una email per completare la registrazione."
      : "Invito creato ma l'email non e' stata inviata. Condividi il link manualmente con il venditore.",
  })
}

async function getInviterName(
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
): Promise<string> {
  const { data: me } = await svc
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", userId)
    .maybeSingle()
  if (!me) return "SANTADDEO"
  const full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim()
  return full || me.email || "SANTADDEO"
}
