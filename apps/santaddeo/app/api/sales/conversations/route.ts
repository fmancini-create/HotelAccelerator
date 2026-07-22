import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Aggrega le CONVERSAZIONI email (thread coi lead) per la vista posta stile
 * Gmail. Restituisce una riga per lead che abbia almeno un messaggio, con
 * anteprima dell'ultimo messaggio, mittente, stato lettura e stadio pipeline.
 *
 * Scope gerarchico (allineato a `sales_leads.sales_agent_id`):
 *  - super_admin            -> tutte le conversazioni
 *  - venditore capo area    -> le proprie + quelle dei venditori del suo team
 *                              (sales_agents.parent_agent_id === me.id)
 *  - venditore semplice     -> solo le proprie
 *
 * Query string opzionali:
 *  - folder: "inbox" (default) | "unread" | "all"
 *  - q: ricerca testuale su nome lead / hotel / email
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const isSuperAdmin = profile.role === "super_admin"
  const svc = await createServiceRoleClient()

  const url = new URL(request.url)
  const folder = (url.searchParams.get("folder") || "inbox").toLowerCase()
  const q = (url.searchParams.get("q") || "").trim()
  const wantTeam = url.searchParams.get("scope") === "team"

  // ---- Determina gli agent_id visibili in base al ruolo/scope ----
  let agentIds: string[] | null = null // null = tutti (solo super admin)
  let canViewTeam = false

  if (!isSuperAdmin) {
    const { data: me } = await svc
      .from("sales_agents")
      .select("id, is_area_manager, is_active")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!me) {
      // Nessun profilo agente: nessuna conversazione.
      return NextResponse.json({ conversations: [], can_view_team: false, counts: { inbox: 0, unread: 0 } })
    }

    agentIds = [me.id]
    canViewTeam = me.is_area_manager === true && me.is_active === true
    // Il team viene incluso solo se il capo area lo richiede esplicitamente
    // (toggle "Tutto il team" nella UI).
    if (canViewTeam && wantTeam) {
      const { data: team } = await svc
        .from("sales_agents")
        .select("id")
        .eq("parent_agent_id", me.id)
      for (const t of team ?? []) agentIds.push(t.id)
    }
  }

  // ---- Lead nello scope (solo quelli con conversazione attiva) ----
  let leadQuery = svc
    .from("sales_leads")
    .select(
      "id, first_name, last_name, hotel_name, email, pipeline_stage, unread_replies, last_reply_at, last_email_subject, sales_agent_id, sales_agents(display_name)",
    )
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .limit(300)

  if (agentIds) leadQuery = leadQuery.in("sales_agent_id", agentIds)
  if (folder === "unread") leadQuery = leadQuery.gt("unread_replies", 0)
  if (q) {
    const like = `%${q}%`
    leadQuery = leadQuery.or(
      `first_name.ilike.${like},last_name.ilike.${like},hotel_name.ilike.${like},email.ilike.${like}`,
    )
  }

  const { data: leads, error: leadErr } = await leadQuery
  if (leadErr) {
    console.error("[sales/conversations] lead query error:", leadErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  const leadIds = (leads ?? []).map((l) => l.id)
  if (leadIds.length === 0) {
    return NextResponse.json({ conversations: [], can_view_team: canViewTeam, counts: { inbox: 0, unread: 0 } })
  }

  // ---- Ultimo messaggio per lead (per anteprima) ----
  const { data: msgs, error: msgErr } = await svc
    .from("sales_lead_messages")
    .select("lead_id, direction, subject, body_text, from_email, received_at")
    .in("lead_id", leadIds)
    .order("received_at", { ascending: false })
  if (msgErr) {
    console.error("[sales/conversations] messages query error:", msgErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Riduci all'ultimo messaggio + conta i messaggi per lead.
  const lastByLead = new Map<string, any>()
  const countByLead = new Map<string, number>()
  for (const m of msgs ?? []) {
    countByLead.set(m.lead_id, (countByLead.get(m.lead_id) ?? 0) + 1)
    if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m)
  }

  // Costruisci le conversazioni: solo i lead che hanno almeno un messaggio.
  const conversations = (leads ?? [])
    .filter((l) => lastByLead.has(l.id))
    .map((l) => {
      const last = lastByLead.get(l.id)
      const preview = (last?.body_text || "").replace(/\s+/g, " ").trim().slice(0, 140)
      return {
        lead_id: l.id,
        first_name: l.first_name,
        last_name: l.last_name,
        hotel_name: l.hotel_name,
        email: l.email,
        pipeline_stage: l.pipeline_stage ?? "new",
        unread_replies: l.unread_replies ?? 0,
        agent_name: (l as any).sales_agents?.display_name ?? null,
        last_direction: last?.direction ?? null,
        last_subject: last?.subject ?? l.last_email_subject ?? null,
        last_from: last?.from_email ?? null,
        last_at: last?.received_at ?? l.last_reply_at ?? null,
        message_count: countByLead.get(l.id) ?? 0,
        preview,
      }
    })

  // Ordina per ultimo messaggio (desc).
  conversations.sort((a, b) => {
    const ta = a.last_at ? new Date(a.last_at).getTime() : 0
    const tb = b.last_at ? new Date(b.last_at).getTime() : 0
    return tb - ta
  })

  const unreadCount = conversations.filter((c) => c.unread_replies > 0).length

  return NextResponse.json({
    conversations,
    can_view_team: canViewTeam,
    counts: {
      inbox: conversations.length,
      unread: unreadCount,
    },
  })
}
