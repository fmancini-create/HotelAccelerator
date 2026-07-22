import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * FIX 02/05/2026: bug duplicato qui.
 *  - Il check role usava `"superadmin"` ma il valore reale e' `"super_admin"`
 *    (con underscore). Risultato: il SuperAdmin riceveva sempre 403 e la UI
 *    "Lead dalla Guida Interattiva" mostrava 0 anche se in DB c'erano dati.
 *  - La route leggeva solo da `guide_leads` (visitatori anonimi che lasciano
 *    nome+email) ignorando le conversazioni di utenti autenticati. Ora ritorna
 *    anche `conversations` dalla nuova tabella `page_guide_conversations`.
 *
 * Pattern santaddeo: auth ABAC nel backend, super_admin = full access.
 */

async function ensureSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { supabase, user }
}

export async function GET() {
  try {
    const auth = await ensureSuperAdmin()
    if (auth.error) return auth.error
    const { supabase } = auth

    // RLS bypass: la tabella `page_guide_conversations` ha policy
    // "scrittura/lettura solo via service-role" (vedi memoria 02/05/2026:
    // serve perche' la chat guida deve poter scrivere anche per visitatori
    // anonimi). Quindi il client autenticato dell'utente NON puo' leggere
    // anche se e' super_admin → la UI mostrava sempre "Nessuna conversazione".
    // Auth gia' verificato in ensureSuperAdmin sopra (ABAC nel backend),
    // qui usiamo service-role solo per il SELECT.
    const svc = await createServiceRoleClient()

    // 1) Conversazioni nuova tabella (sia autenticati che anonimi)
    const { data: conversations, error: convErr } = await svc
      .from("page_guide_conversations")
      .select(`
        id,
        user_id,
        hotel_id,
        visitor_name,
        visitor_email,
        page_path,
        messages,
        is_authenticated,
        has_unread_for_admin,
        message_count,
        last_message_at,
        created_at
      `)
      .order("last_message_at", { ascending: false })
      .limit(200)

    if (convErr) {
      console.error("[superadmin/guide-leads] error fetching conversations:", convErr)
    }

    // Arricchimento: nome utente / hotel per le conversazioni autenticate.
    // Facciamo le 2 query in parallelo solo se ci sono righe rilevanti.
    // profiles e hotels rimangono leggibili dal client utente (super_admin
    // ha policy SELECT), ma per coerenza usiamo svc anche qui.
    let enrichedConversations = conversations || []
    if (enrichedConversations.length > 0) {
      const userIds = Array.from(
        new Set(enrichedConversations.map((c) => c.user_id).filter(Boolean) as string[]),
      )
      const hotelIds = Array.from(
        new Set(enrichedConversations.map((c) => c.hotel_id).filter(Boolean) as string[]),
      )

      const [profilesRes, hotelsRes] = await Promise.all([
        userIds.length
          ? svc.from("profiles").select("id, first_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as Array<{ id: string; first_name: string | null; email: string | null }> }),
        hotelIds.length
          ? svc.from("hotels").select("id, name").in("id", hotelIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ])

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]))
      const hotelMap = new Map((hotelsRes.data || []).map((h) => [h.id, h]))

      enrichedConversations = enrichedConversations.map((c) => ({
        ...c,
        user_name: c.user_id ? profileMap.get(c.user_id)?.first_name || null : null,
        user_email: c.user_id ? profileMap.get(c.user_id)?.email || null : null,
        hotel_name: c.hotel_id ? hotelMap.get(c.hotel_id)?.name || null : null,
      }))
    }

    // 2) Legacy guide_leads (anonimi che hanno lasciato nome+email)
    const { data: leads } = await supabase
      .from("guide_leads")
      .select("*")
      .order("created_at", { ascending: false })

    // 3) Domande [UNCERTAIN]
    const { data: questions } = await supabase
      .from("page_guide_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    return NextResponse.json({
      conversations: enrichedConversations,
      leads: leads || [],
      questions: questions || [],
      unread_count: enrichedConversations.filter((c) => c.has_unread_for_admin).length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await ensureSuperAdmin()
    if (auth.error) return auth.error

    // Stesso ragionamento del GET: page_guide_conversations ha RLS che
    // ammette solo service-role. Usiamo svc per l'update (auth gia'
    // verificato sopra).
    const svc = await createServiceRoleClient()

    const body = await request.json()
    const { id, is_contacted, notes, target, action } = body as {
      id?: string
      is_contacted?: boolean
      notes?: string
      target?: "lead" | "conversation"
      action?: "mark_read" | "mark_all_read"
    }

    // Mark all conversations as read (no id required)
    if (action === "mark_all_read") {
      const { error } = await svc
        .from("page_guide_conversations")
        .update({ has_unread_for_admin: false })
        .eq("has_unread_for_admin", true)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    // Mark a single conversation as read
    if (target === "conversation" && action === "mark_read") {
      const { error } = await svc
        .from("page_guide_conversations")
        .update({ has_unread_for_admin: false })
        .eq("id", id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // Legacy: aggiornamento di un lead in `guide_leads`
    const updates: Record<string, unknown> = {}
    if (typeof is_contacted === "boolean") updates.is_contacted = is_contacted
    if (typeof notes === "string") updates.notes = notes

    const { error } = await svc
      .from("guide_leads")
      .update(updates)
      .eq("id", id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
