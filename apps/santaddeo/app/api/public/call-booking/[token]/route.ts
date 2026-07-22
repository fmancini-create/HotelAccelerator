import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getFreeSlots } from "@/lib/sales/lead-call"
import { isGoogleCalendarConfigured } from "@/lib/google/calendar"

export const dynamic = "force-dynamic"

/**
 * Endpoint PUBBLICO (no auth): info del link di prenotazione + slot liberi.
 * Validato unicamente dal token opaco in URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 })

  const svc = await createServiceRoleClient()
  const { data: link } = await svc
    .from("call_booking_links")
    .select("id, token, lead_id, duration_minutes, expires_at, used_at, demo_request_id, proposed_slots")
    .eq("token", token)
    .maybeSingle()

  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Stato del link
  const expired = link.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false
  const used = Boolean(link.used_at)

  // Dati lead (solo nome struttura per personalizzare la pagina)
  let hotelName: string | null = null
  let leadFirstName: string | null = null
  if (link.lead_id) {
    const { data: lead } = await svc
      .from("sales_leads")
      .select("first_name, hotel_name")
      .eq("id", link.lead_id)
      .maybeSingle()
    hotelName = lead?.hotel_name ?? null
    leadFirstName = lead?.first_name ?? null
  }

  let slots: { startIso: string; endIso: string }[] = []
  // Se il venditore ha proposto orari specifici (max 3), mostriamo SOLO quelli
  // (ancora futuri); altrimenti la lista classica degli slot liberi (14 giorni).
  const proposed = Array.isArray(link.proposed_slots)
    ? (link.proposed_slots as { startIso: string; endIso: string }[])
    : []
  const proposedMode = proposed.length > 0
  if (!expired && !used) {
    if (proposedMode) {
      slots = proposed
        .filter((s) => s?.startIso && s?.endIso && new Date(s.startIso).getTime() > Date.now())
        .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
    } else if (isGoogleCalendarConfigured()) {
      // Prossimi 14 giorni lavorativi.
      slots = await getFreeSlots({
        fromDate: new Date(),
        days: 14,
        durationMinutes: link.duration_minutes || 30,
      })
    }
  }

  return NextResponse.json({
    status: used ? "used" : expired ? "expired" : "active",
    hotelName,
    leadFirstName,
    durationMinutes: link.duration_minutes || 30,
    // In modalità "orari proposti" il calendario può non essere richiesto per
    // mostrare gli slot (sono già fissati): non bloccare la pagina su questo.
    calendarConfigured: proposedMode ? true : isGoogleCalendarConfigured(),
    proposedMode,
    slots,
  })
}
