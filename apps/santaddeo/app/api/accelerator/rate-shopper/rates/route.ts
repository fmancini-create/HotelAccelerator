import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"

interface IngestRow {
  competitorId: string
  stayDate: string
  price: number | null
  occupancy?: number
  los?: number
  availability?: boolean | null
  currency?: string
}

// POST: inserimento manuale / import CSV di prezzi competitor.
// Body: { hotelId, rows: IngestRow[] }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const rows = body?.rows as IngestRow[] | undefined
  if (!hotelId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "hotelId e rows richiesti" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  // I competitor devono appartenere a questa struttura (no cross-tenant).
  const { data: comps } = await supabase.from("competitors").select("id").eq("hotel_id", hotelId).eq("active", true)
  const validIds = new Set((comps ?? []).map((c) => c.id))

  const capturedAt = new Date().toISOString()
  const toInsert: Record<string, unknown>[] = []
  const skipped: string[] = []

  for (const r of rows) {
    if (!r.competitorId || !validIds.has(r.competitorId)) {
      skipped.push(`competitor ${r.competitorId} non valido`)
      continue
    }
    if (!r.stayDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.stayDate)) {
      skipped.push(`data ${r.stayDate} non valida`)
      continue
    }
    const price = r.price == null || r.price === ("" as unknown) ? null : Number(r.price)
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      skipped.push(`prezzo non valido per ${r.stayDate}`)
      continue
    }
    toInsert.push({
      hotel_id: hotelId,
      competitor_id: r.competitorId,
      stay_date: r.stayDate,
      captured_at: capturedAt,
      los: r.los ?? 1,
      occupancy: r.occupancy ?? 2,
      price,
      currency: r.currency ?? "EUR",
      availability: r.availability ?? (price != null ? true : null),
      channel: null,
      provider: "manual",
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped }, { status: 400 })
  }

  // upsert sull'unique (competitor_id, stay_date, los, occupancy, captured_at)
  const { error } = await supabase
    .from("competitor_rates")
    .upsert(toInsert, { onConflict: "competitor_id,stay_date,los,occupancy,captured_at" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: toInsert.length, skipped })
}
