import { NextResponse, type NextRequest } from "next/server"
import { accessErrorStatus } from "@/lib/auth/admin-access"
import {
  accessTokenForSource,
  listVisibleCalendarSources,
  requireCalendarIdentity,
  resolveCalendarSource,
} from "@/lib/calendar/access"
import {
  createGoogleCalendarEvent,
  listGoogleCalendarEvents,
  type CalendarAttachment,
  type CalendarAttendee,
} from "@/lib/calendar/google-user-calendar"
import {
  createServiceCalendarEvent,
  listServiceCalendarEvents,
} from "@/lib/calendar/google-service-calendar"

export const dynamic = "force-dynamic"

function normalizeAttendees(value: unknown): CalendarAttendee[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    const email = typeof item === "string" ? item : String((item as any)?.email || "")
    const normalized = email.trim().toLowerCase()
    if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized)) continue
    unique.add(normalized)
  }
  return Array.from(unique).slice(0, 200).map((email) => ({ email }))
}

function normalizeAttachments(value: unknown): CalendarAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, 25).map((item: any) => ({
    fileUrl: String(item?.fileUrl || ""),
    title: String(item?.title || "Allegato"),
    mimeType: item?.mimeType ? String(item.mimeType) : null,
    fileId: item?.fileId ? String(item.fileId) : null,
  })).filter((item) => /^https:\/\//i.test(item.fileUrl))
}

function normalizeRecurrence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rules = value
    .map((item) => String(item || "").trim())
    .filter((item) => /^(RRULE|RDATE|EXDATE):/i.test(item) && item.length <= 500)
    .slice(0, 10)
  return rules.length ? rules : undefined
}

export async function GET(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    const from = request.nextUrl.searchParams.get("from")
    const to = request.nextUrl.searchParams.get("to")
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      return NextResponse.json({ error: "Intervallo calendario non valido" }, { status: 400 })
    }

    const sources = await listVisibleCalendarSources(identity)
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        const events = source.auth_mode === "service_account"
          ? await listServiceCalendarEvents(source.external_calendar_id, from, to)
          : await listGoogleCalendarEvents(
              await accessTokenForSource(source),
              source.external_calendar_id,
              from,
              to,
            )
        return events.map((event) => ({
          ...event,
          sourceId: source.id,
          sourceLabel: source.label,
          sourceColor: source.color,
          sourceKind: source.source_kind,
          permission: source.permission,
        }))
      }),
    )

    const events: any[] = []
    const errors: Array<{ sourceId: string; sourceLabel: string; error: string }> = []
    results.forEach((result, index) => {
      if (result.status === "fulfilled") events.push(...result.value)
      else errors.push({
        sourceId: sources[index].id,
        sourceLabel: sources[index].label,
        error: result.reason instanceof Error ? result.reason.message : "sync_failed",
      })
    })
    events.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))
    return NextResponse.json({ events, errors })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore calendario" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    const body = await request.json()
    if (!body?.sourceId || !body?.summary || !body?.startIso || !body?.endIso) {
      return NextResponse.json({ error: "Calendario, titolo, inizio e fine sono obbligatori" }, { status: 400 })
    }
    const source = await resolveCalendarSource(identity, String(body.sourceId), "edit")
    const attachments = normalizeAttachments(body.attachments)
    if (source.auth_mode !== "oauth" && attachments?.length) {
      return NextResponse.json({ error: "Gli allegati Drive sono disponibili sui calendari Google collegati con il tuo account" }, { status: 400 })
    }
    const recurrence = normalizeRecurrence(body.recurrence)
    const input = {
      summary: String(body.summary),
      description: body.description ? String(body.description) : null,
      location: body.location ? String(body.location) : null,
      startIso: String(body.startIso),
      endIso: String(body.endIso),
      timeZone: body.timeZone ? String(body.timeZone) : "Europe/Rome",
      attendees: normalizeAttendees(body.attendees),
      ...(attachments !== undefined ? { attachments } : {}),
      ...(recurrence ? { recurrence } : {}),
    }
    if (Date.parse(input.endIso) <= Date.parse(input.startIso)) {
      return NextResponse.json({ error: "La fine deve essere successiva all'inizio" }, { status: 400 })
    }

    const created = source.auth_mode === "service_account"
      ? await createServiceCalendarEvent(source.external_calendar_id, input)
      : await createGoogleCalendarEvent(await accessTokenForSource(source), source.external_calendar_id, input)
    return NextResponse.json({ event: created }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile creare l'evento" },
      { status: accessErrorStatus(error) },
    )
  }
}
