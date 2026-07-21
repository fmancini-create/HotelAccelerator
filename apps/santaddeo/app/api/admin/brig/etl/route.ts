// POST /api/admin/brig/etl
// Lancia BrigBookingsProcessor per un hotel: legge connectors.brig_raw_bookings
// (processed=false), li mappa in `public.bookings` e li marca processed=true.
// Solo super_admin. In dev usa getAuthUserOrDev.

import { NextResponse, type NextRequest } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { BrigBookingsProcessor } from "@/lib/etl/processors/brig-bookings-processor"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: { hotelId?: string; etlJobId?: string } = {}
  try {
    body = await req.json()
  } catch {
    // body opzionale: hotelId si può passare anche da query
  }
  const url = new URL(req.url)
  const hotelId = body.hotelId ?? url.searchParams.get("hotelId") ?? undefined
  const etlJobId = body.etlJobId ?? url.searchParams.get("etlJobId") ?? `manual-${Date.now()}`

  if (!hotelId) {
    return NextResponse.json(
      { error: "missing_hotel_id", hint: "Pass hotelId in JSON body or as ?hotelId= query param" },
      { status: 400 },
    )
  }

  const processor = new BrigBookingsProcessor(hotelId, etlJobId)
  const result = await processor.process()
  return NextResponse.json({ ok: result.success, etlJobId, result })
}
