import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { resolveCalendarViewer, resolveTargetAgentId } from "@/lib/sales/calendar-scope"
import { listEvents, isGoogleCalendarConfigured } from "@/lib/google/calendar"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales/calendar/assign-agent
 * Collega un evento del calendario condiviso (clienti@4bid.it) creato a mano su
 * Google a un VENDITORE, creando/aggiornando la riga `demo_requests` che fa da
 * ponte evento->agente. Da quel momento l'evento risulta "di proprietà" del
 * venditore e diventa visibile (con dettagli) al venditore stesso e al suo capo
 * area nel calendario condiviso.
 *
 * Permessi: super_admin, oppure capo area che assegna a un membro del proprio
 * team (riusa `resolveTargetAgentId`, nessuna escalation).
 *
 * Body: { google_event_id: string, agent_id: string, day: string (yyyy-MM-dd) }
 *
 * I dettagli dell'evento (orari, titolo, link) vengono letti REALI dal
 * calendario Google lato server: il client non può iniettare dati inventati.
 */
export async function POST(req: Request) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "google_not_configured" }, { status: 503 })
  }

  let body: { google_event_id?: string; agent_id?: string; day?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const googleEventId = (body.google_event_id || "").trim()
  const targetAgent = (body.agent_id || "").trim()
  const day = (body.day || "").trim()
  if (!googleEventId || !targetAgent || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const viewer = await resolveCalendarViewer(svc, user.id)

  // Autorizzazione: il viewer può assegnare a questo agente?
  const scope = await resolveTargetAgentId(svc, viewer, targetAgent)
  if ("forbidden" in scope || !scope.agentId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  const agentId = scope.agentId

  // Recupera i dettagli REALI dell'evento dal calendario condiviso, cercando
  // nella finestra del giorno indicato (±1 giorno per coprire i fusi/allday).
  const from = new Date(day + "T00:00:00.000Z")
  const dayStart = new Date(from)
  dayStart.setUTCDate(dayStart.getUTCDate() - 1)
  const dayEnd = new Date(from)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 2)

  let event
  try {
    const events = await listEvents(dayStart.toISOString(), dayEnd.toISOString())
    event = events.find((e) => e.id === googleEventId)
  } catch (e) {
    console.error("[assign-agent] errore lettura evento Google:", e)
    return NextResponse.json({ error: "google_read_failed" }, { status: 502 })
  }

  if (!event || !event.start) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 })
  }

  // Esiste già una demo per questo evento? In caso, RIASSEGNA (update agent_id);
  // altrimenti crea una nuova riga ponte.
  const { data: existing } = await svc
    .from("demo_requests")
    .select("id")
    .eq("google_event_id", googleEventId)
    .maybeSingle()

  const endIso =
    event.end ??
    new Date(new Date(event.start).getTime() + 30 * 60 * 1000).toISOString()

  const row = {
    agent_id: agentId,
    requested_by: user.id,
    title: event.title || "Demo",
    requested_start: event.start,
    requested_end: endIso,
    // Il CHECK su demo_requests.status ammette solo
    // pending/approved/rejected/cancelled: "approved" = demo confermata.
    status: "approved" as const,
    google_event_id: googleEventId,
    google_event_link: event.htmlLink ?? null,
    meet_link: event.meetLink ?? null,
  }

  if (existing?.id) {
    const { error } = await svc.from("demo_requests").update(row).eq("id", existing.id)
    if (error) {
      console.error("[assign-agent] update fallito:", error)
      return NextResponse.json({ error: "update_failed" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, mode: "updated", demo_request_id: existing.id, agent_id: agentId })
  }

  const { data: inserted, error } = await svc
    .from("demo_requests")
    .insert(row)
    .select("id")
    .single()
  if (error) {
    console.error("[assign-agent] insert fallito:", error)
    return NextResponse.json({ error: "insert_failed" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, mode: "created", demo_request_id: inserted.id, agent_id: agentId })
}
