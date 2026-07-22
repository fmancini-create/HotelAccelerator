import type { Metadata } from "next"
import { CalendarSettingsClient } from "./calendar-settings-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Calendario personale · CRM Venditori",
  description: "Collega il tuo calendario personale per vederlo nel calendario venditori.",
}

export default function CalendarSettingsPage() {
  return <CalendarSettingsClient />
}
