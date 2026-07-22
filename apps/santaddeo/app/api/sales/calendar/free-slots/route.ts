import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { getFreeSlots } from "@/lib/sales/lead-call"
import { isGoogleCalendarConfigured } from "@/lib/google/calendar"

export const dynamic = "force-dynamic"

/**
 * Slot liberi (lun-ven 9-18, calendario clienti@4bid.it) che il venditore può
 * proporre al lead nell'email "Fissa una demo". Riusa getFreeSlots; protetto da
 * auth (venditore o super admin).
 */
export async function GET(request: Request) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 30)
  const duration = Math.min(Math.max(Number(url.searchParams.get("duration")) || 30, 15), 120)

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ calendarConfigured: false, slots: [] })
  }

  const slots = await getFreeSlots({ fromDate: new Date(), days, durationMinutes: duration })
  return NextResponse.json({ calendarConfigured: true, slots })
}
