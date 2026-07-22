import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createEvent, updateEvent, deleteEvent, isGoogleCalendarConfigured } from "@/lib/google/calendar"
import { sendDemoConfirmationEmails } from "@/lib/sales/lead-call"

export const dynamic = "force-dynamic"

const SELECT =
  "id, agent_id, prospect_id, lead_id, title, notes, requested_start, requested_end, attendee_email, status, google_event_id, google_event_link, meet_link, decision_notes, decided_at, created_at, prospects:prospect_id(id, name, city), sales_agents:agent_id(id, display_name, email)"

async function requireSuperAdmin() {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") return { ok: false as const, status: 403, error: "forbidden" }
  return { ok: true as const, user }
}

/**
 * GET /api/superadmin/demo-requests?status=pending|approved|rejected|cancelled
 * Lista richieste demo + conteggi per stato + flag googleConfigured.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = await createServiceRoleClient()
  const status = new URL(request.url).searchParams.get("status") || "pending"

  const [listRes, allRes] = await Promise.all([
    svc.from("demo_requests").select(SELECT).eq("status", status).order("requested_start", { ascending: true }).limit(300),
    svc.from("demo_requests").select("status"),
  ])

  if (listRes.error) {
    console.error("[superadmin/demo-requests/GET]", listRes.error.message)
    return NextResponse.json({ error: listRes.error.message }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const row of allRes.data ?? []) {
    counts[row.status] = (counts[row.status] || 0) + 1
  }

  return NextResponse.json({
    requests: listRes.data ?? [],
    counts,
    googleConfigured: isGoogleCalendarConfigured(),
  })
}

/**
 * PATCH /api/superadmin/demo-requests
 * Body: { id, action: "approve" | "reject" | "reschedule", decision_notes?, requested_start?, requested_end? }
 * - approve: crea/conferma l'evento su clienti@4bid.it, salva id/link e invia le
 *   email di conferma a lead + venditore con il link alla call.
 * - reject: marca rejected e rimuove la bozza.
 * - reschedule: aggiorna data/ora della proposta (resta pending) e sposta la
 *   bozza sul calendario. Richiede requested_start e requested_end.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const { id, action } = body || {}
  const decisionNotes = (body?.decision_notes || "").toString().trim() || null
  if (!id || (action !== "approve" && action !== "reject" && action !== "reschedule")) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const { data: req, error: loadErr } = await svc.from("demo_requests").select("*").eq("id", id).maybeSingle()
  if (loadErr || !req) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (req.status !== "pending") {
    return NextResponse.json({ error: "already_decided" }, { status: 409 })
  }

  const decidedBy = "user" in auth && (auth.user as any)?.id ? (auth.user as any).id : null

  // ── RESCHEDULE: il super admin modifica giorno/ora della proposta. La
  //    richiesta resta "pending" (va comunque approvata). Spostiamo anche la
  //    bozza sul calendario, se esiste.
  if (action === "reschedule") {
    const startIso = body?.requested_start
    const endIso = body?.requested_end
    const start = startIso ? new Date(startIso) : null
    const end = endIso ? new Date(endIso) : null
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "invalid_range" }, { status: 400 })
    }
    if (req.google_event_id && isGoogleCalendarConfigured()) {
      try {
        await updateEvent({
          eventId: req.google_event_id,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          status: "tentative",
        })
      } catch (err) {
        console.error("[superadmin/demo-requests/reschedule] move draft failed:", err instanceof Error ? err.message : err)
      }
    }
    const { error } = await svc
      .from("demo_requests")
      .update({
        requested_start: start.toISOString(),
        requested_end: end.toISOString(),
        decision_notes: decisionNotes,
      })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: "pending", rescheduled: true })
  }

  if (action === "reject") {
    // Rimuovi la bozza "da confermare" eventualmente creata alla richiesta.
    if (req.google_event_id && isGoogleCalendarConfigured()) {
      try {
        await deleteEvent(req.google_event_id)
      } catch (err) {
        console.error("[superadmin/demo-requests/reject] delete draft failed:", err instanceof Error ? err.message : err)
      }
    }
    const { error } = await svc
      .from("demo_requests")
      .update({
        status: "rejected",
        google_event_id: null,
        google_event_link: null,
        decision_notes: decisionNotes,
        decided_at: new Date().toISOString(),
        decided_by: decidedBy,
      })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // approve -> conferma l'evento Google
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 400 })
  }

  let eventId = req.google_event_id || ""
  let eventLink: string | null = req.google_event_link || null
  let meetLink: string | null = req.meet_link || null
  try {
    if (req.google_event_id) {
      // Esiste gia' una bozza "tentative" creata alla richiesta: promuovila a
      // confermata (senza duplicare l'evento sul calendario).
      const updated = await updateEvent({
        eventId: req.google_event_id,
        summary: req.title,
        description: req.notes
          ? `Demo Santaddeo confermata.\n\nNote: ${req.notes}`
          : "Demo Santaddeo confermata.",
        status: "confirmed",
        // Genera il Google Meet alla conferma (best-effort: richiede DWD).
        withMeet: true,
      })
      eventId = updated.id
      eventLink = updated.htmlLink || eventLink
      meetLink = updated.meetLink || meetLink
    } else {
      // Nessuna bozza (es. Google non era configurato alla richiesta): crea ora.
      const created = await createEvent({
        summary: req.title,
        description: req.notes
          ? `Demo richiesta da un venditore Santaddeo.\n\nNote: ${req.notes}`
          : "Demo richiesta da un venditore Santaddeo.",
        startIso: new Date(req.requested_start).toISOString(),
        endIso: new Date(req.requested_end).toISOString(),
        attendeeEmail: req.attendee_email,
        status: "confirmed",
        // Genera il Google Meet alla conferma (best-effort: richiede DWD).
        withMeet: true,
      })
      eventId = created.id
      eventLink = created.htmlLink
      meetLink = created.meetLink || meetLink
    }
  } catch (err) {
    console.error("[superadmin/demo-requests/approve] google error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "google_create_failed" }, { status: 502 })
  }

  const { error } = await svc
    .from("demo_requests")
    .update({
      status: "approved",
      google_event_id: eventId,
      google_event_link: eventLink,
      meet_link: meetLink,
      decision_notes: decisionNotes,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    })
    .eq("id", id)
  if (error) {
    console.error("[superadmin/demo-requests/approve] db error:", error.message)
    return NextResponse.json({ error: error.message, google_event_link: eventLink }, { status: 500 })
  }

  // ── Email di conferma a LEAD + VENDITORE con il link alla call. Recuperiamo
  //    i dati di contatto (lead da sales_leads via lead_id, venditore da
  //    sales_agents via agent_id). Best-effort: non blocca la risposta.
  try {
    let leadEmail: string | null = req.attendee_email || null
    let leadName: string | null = null
    let hotelName: string | null = null
    if (req.lead_id) {
      const { data: lead } = await svc
        .from("sales_leads")
        .select("first_name, last_name, hotel_name, email")
        .eq("id", req.lead_id)
        .maybeSingle()
      if (lead) {
        leadName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || null
        hotelName = lead.hotel_name ?? null
        leadEmail = leadEmail || lead.email
      }
    } else if (req.prospect_id) {
      // Richiesta nata dal Calendario: il destinatario e' il prospect.
      const { data: prospect } = await svc
        .from("prospects")
        .select("name, email")
        .eq("id", req.prospect_id)
        .maybeSingle()
      if (prospect) {
        hotelName = prospect.name ?? null
        leadName = prospect.name ?? null
        leadEmail = leadEmail || (prospect.email ?? null)
      }
    }
    let agentEmail: string | null = null
    let agentName: string | null = null
    let agentPhone: string | null = null
    let agentAliasEmail: string | null = null
    if (req.agent_id) {
      const { data: agent } = await svc
        .from("sales_agents")
        .select("display_name, email, phone, sender_email")
        .eq("id", req.agent_id)
        .maybeSingle()
      if (agent) {
        agentEmail = agent.email
        agentName = agent.display_name
        agentPhone = agent.phone ?? null
        agentAliasEmail = agent.sender_email ?? null
      }
    }
    await sendDemoConfirmationEmails({
      leadEmail,
      leadName,
      agentEmail,
      agentName,
      agentPhone,
      agentAliasEmail,
      hotelName,
      title: req.title,
      start: new Date(req.requested_start),
      end: new Date(req.requested_end),
      meetLink,
      eventLink,
      leadId: req.lead_id ?? null,
      salesAgentId: req.agent_id ?? null,
    })
  } catch (err) {
    console.error("[superadmin/demo-requests/approve] confirmation emails failed:", err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true, status: "approved", google_event_link: eventLink })
}
