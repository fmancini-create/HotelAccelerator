/**
 * EVENTS API - CRUD for hotel_events
 * GET  /api/accelerator/events?hotel_id=...&from=...&to=...
 * POST /api/accelerator/events  { hotel_id, events: [...] }
 * DELETE /api/accelerator/events?hotel_id=...&id=...
 */
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const hotelId = searchParams.get("hotel_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  if (!hotelId) return NextResponse.json({ error: "hotel_id required" }, { status: 400 })

  const supabase = await createClient()
  let query = supabase
    .from("hotel_events")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("date", { ascending: true })

  if (from) query = query.gte("date", from)
  if (to) query = query.lte("date", to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { hotel_id, events } = body

  if (!hotel_id || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "hotel_id and events[] required" }, { status: 400 })
  }

  const supabase = await createClient()

  const rows = events.map((e: any) => ({
    hotel_id,
    date: e.date,
    name: e.name,
    type: e.type || "manual",
    country_code: e.country_code || null,
    impact: e.impact || "medium",
    color: e.color || "#f59e0b",
    notes: e.notes || null,
  }))

  // Dedup idempotente in-app (non esiste un vincolo univoco su
  // hotel_id,date,country_code,name -> l'upsert onConflict darebbe 42P10).
  // Leggiamo gli eventi gia' presenti nelle date coinvolte e scartiamo i
  // duplicati (stessa data + nome + country_code), poi insert semplice.
  const dates = Array.from(new Set(rows.map((r) => r.date)))
  const { data: existing } = await supabase
    .from("hotel_events")
    .select("date,name,country_code")
    .eq("hotel_id", hotel_id)
    .in("date", dates)

  const existingKeys = new Set(
    (existing || []).map((e: any) => `${e.date}|${e.name}|${e.country_code ?? ""}`),
  )
  const toInsert = rows.filter(
    (r) => !existingKeys.has(`${r.date}|${r.name}|${r.country_code ?? ""}`),
  )

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  const { data, error } = await supabase
    .from("hotel_events")
    .insert(toInsert)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: data?.length ?? toInsert.length })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const hotelId = searchParams.get("hotel_id")
  const id = searchParams.get("id")

  if (!hotelId || !id) return NextResponse.json({ error: "hotel_id and id required" }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase
    .from("hotel_events")
    .delete()
    .eq("hotel_id", hotelId)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
