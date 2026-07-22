import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { fetchIcsEvents } from "@/lib/calendar/ics"
import {
  resolveCalendarViewer,
  resolveTargetAgentId,
  resolveTargetAgentIds,
} from "@/lib/sales/calendar-scope"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/calendar/my-events?from=ISO&to=ISO[&agent_id=]
 * Fetch + merge dei calendari personali (feed ICS) attivi di un venditore nella
 * finestra. Di default il venditore loggato; con `agent_id` il super_admin vede
 * chiunque e il CAPO AREA i membri del proprio team (vedi calendar-scope).
 * Best-effort: un feed rotto non blocca gli altri (aggiorna last_error /
 * last_synced_at sul calendario interessato).
 * Ritorna { events: [{ id, title, start, end, allDay, color, calendar_id }] }.
 */
export async function GET(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized", events: [] }, { status: 401 })

  const svc = await createServiceRoleClient()

  const url = new URL(request.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const overrideAgentId = url.searchParams.get("agent_id")
  const overrideAgentIds = (url.searchParams.get("agent_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!from || !to) return NextResponse.json({ error: "from_to_required" }, { status: 400 })
  const fromD = new Date(from)
  const toD = new Date(to)
  if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  const viewer = await resolveCalendarViewer(svc, user.id)

  // Insieme di agenti autorizzati da mostrare in overlay (default: sé stesso).
  let agentIds: string[]
  if (overrideAgentIds.length > 0) {
    agentIds = await resolveTargetAgentIds(svc, viewer, overrideAgentIds)
  } else {
    const scope = await resolveTargetAgentId(svc, viewer, overrideAgentId)
    if ("forbidden" in scope) {
      return NextResponse.json({ error: "forbidden", events: [] }, { status: 403 })
    }
    agentIds = scope.agentId ? [scope.agentId] : []
  }
  if (agentIds.length === 0) return NextResponse.json({ events: [] })

  const { data: calendars, error } = await svc
    .from("sales_agent_calendars")
    .select("id, ics_url, color, sales_agent_id")
    .in("sales_agent_id", agentIds)
    .eq("is_active", true)

  if (error) {
    console.error("[my-events/GET]", error.message)
    return NextResponse.json({ error: error.message, events: [] }, { status: 500 })
  }
  if (!calendars || calendars.length === 0) return NextResponse.json({ events: [] })

  const results = await Promise.allSettled(
    calendars.map(async (cal) => {
      const events = await fetchIcsEvents(cal.ics_url, fromD, toD)
      return { cal, events }
    }),
  )

  const merged: Array<{
    id: string
    title: string
    start: string | null
    end: string | null
    allDay: boolean
    color: string
    calendar_id: string
    agent_id: string
  }> = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const cal = calendars[i]
    if (r.status === "fulfilled") {
      for (const ev of r.value.events) {
        merged.push({
          id: `${cal.id}:${ev.id}`,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
          color: cal.color,
          calendar_id: cal.id,
          agent_id: cal.sales_agent_id,
        })
      }
      // Aggiorna stato sync (best-effort, non blocca la risposta).
      void svc
        .from("sales_agent_calendars")
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq("id", cal.id)
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.error(`[my-events/GET] feed ${cal.id} failed:`, msg)
      void svc.from("sales_agent_calendars").update({ last_error: msg }).eq("id", cal.id)
    }
  }

  return NextResponse.json({ events: merged })
}
