import type { Metadata } from "next"
import { requireAreaPage } from "@/lib/auth/area-access"
import { CrmCalendarClient } from "@/components/crm/crm-calendar-client"

export const metadata: Metadata = {
  title: "Calendario | CRM",
}

export const dynamic = "force-dynamic"

type CalendarPageSearchParams = Promise<{
  calendar_error?: string | string[]
  google_project?: string | string[]
}>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function CrmCalendarPage({ searchParams }: { searchParams: CalendarPageSearchParams }) {
  await requireAreaPage("crm")
  const params = await searchParams
  const calendarError = first(params.calendar_error)
  const googleProject = first(params.google_project)
  const calendarApiDisabled = calendarError === "google_calendar_api_disabled"
  const enableCalendarApiUrl = googleProject
    ? `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=${encodeURIComponent(googleProject)}`
    : "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Il tuo calendario personale e i calendari condivisi dalla struttura, in un&apos;unica vista.
        </p>
      </header>

      {calendarApiDisabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="font-semibold">Google Calendar non è ancora attivo per questa integrazione.</div>
          <p className="mt-1">
            Per questo il menu “Calendario” nei permessi resta vuoto: Google autorizza l&apos;account, ma blocca la lettura dei calendari finché la Google Calendar API non viene abilitata
            {googleProject ? ` nel progetto ${googleProject}` : " nel progetto Google collegato"}.
          </p>
          <a
            href={enableCalendarApiUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex rounded-md bg-amber-950 px-3 py-2 font-medium text-white hover:opacity-90"
          >
            Attiva Google Calendar API
          </a>
          <p className="mt-2 text-xs opacity-80">Dopo l&apos;attivazione, torna qui e premi di nuovo “Il mio Google Calendar” o “Calendario condiviso”.</p>
        </div>
      )}

      {calendarError && !calendarApiDisabled && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Collegamento Google Calendar non completato. Riprova il collegamento; se il problema continua, l&apos;errore viene registrato nei log tecnici.
        </div>
      )}

      <CrmCalendarClient />
    </div>
  )
}
