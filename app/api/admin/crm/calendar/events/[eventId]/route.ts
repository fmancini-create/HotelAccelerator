import { NextResponse, type NextRequest } from "next/server"
import { accessErrorStatus } from "@/lib/auth/admin-access"
import { accessTokenForSource, requireCalendarIdentity, resolveCalendarSource } from "@/lib/calendar/access"
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from "@/lib/calendar/google-user-calendar"
import { deleteServiceCalendarEvent, updateServiceCalendarEvent } from "@/lib/calendar/google-service-calendar"

type Context = { params: Promise<{ eventId: string }> }

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const identity = await requireCalendarIdentity(request)
    const { eventId } = await context.params
    const body = await request.json()
    if (!body?.sourceId) return NextResponse.json({ error: "sourceId obbligatorio" }, { status: 400 })
    const source = await resolveCalendarSource(identity, String(body.sourceId), "edit")
    const input = {
      ...(body.summary !== undefined ? { summary: String(body.summary) } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
      ...(body.location !== undefined ? { location: body.location ? String(body.location) : null } : {}),
      ...(body.startIso !== undefined ? { startIso: String(body.startIso) } : {}),
      ...(body.endIso !== undefined ? { endIso: String(body.endIso) } : {}),
      timeZone: body.timeZone ? String(body.timeZone) : "Europe/Rome",
    }
    if (input.startIso && input.endIso && Date.parse(input.endIso) <= Date.parse(input.startIso)) {
      return NextResponse.json({ error: "La fine deve essere successiva all'inizio" }, { status: 400 })
    }

    const updated = source.auth_mode === "service_account"
      ? await updateServiceCalendarEvent(source.external_calendar_id, eventId, input)
      : await updateGoogleCalendarEvent(
          await accessTokenForSource(source),
          source.external_calendar_id,
          eventId,
          input,
        )
    return NextResponse.json({ event: updated })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile aggiornare l'evento" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const identity = await requireCalendarIdentity(request)
    const { eventId } = await context.params
    const sourceId = request.nextUrl.searchParams.get("sourceId")
    if (!sourceId) return NextResponse.json({ error: "sourceId obbligatorio" }, { status: 400 })
    const source = await resolveCalendarSource(identity, sourceId, "edit")

    if (source.auth_mode === "service_account") {
      await deleteServiceCalendarEvent(source.external_calendar_id, eventId)
    } else {
      await deleteGoogleCalendarEvent(await accessTokenForSource(source), source.external_calendar_id, eventId)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile eliminare l'evento" },
      { status: accessErrorStatus(error) },
    )
  }
}
