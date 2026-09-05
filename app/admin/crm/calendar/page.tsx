import type { Metadata } from "next"
import { requireAreaPage } from "@/lib/auth/area-access"
import { CrmCalendarClient } from "@/components/crm/crm-calendar-client"

export const metadata: Metadata = {
  title: "Calendario | CRM",
}

export const dynamic = "force-dynamic"

export default async function CrmCalendarPage() {
  await requireAreaPage("crm")

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Il tuo calendario personale e i calendari condivisi dalla struttura, in un&apos;unica vista.
        </p>
      </header>
      <CrmCalendarClient />
    </div>
  )
}
