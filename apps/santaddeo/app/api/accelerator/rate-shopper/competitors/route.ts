import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"

// Numero massimo di competitor monitorabili per struttura.
export const MAX_COMPETITORS = 6

// GET: elenco competitor del comp set di una struttura.
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("competitors")
    .select("id, name, external_ref, provider, channel, active, created_at")
    .eq("hotel_id", hotelId)
    .eq("active", true)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ competitors: data ?? [] })
}

// POST: aggiunge un competitor.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const name = (body?.name as string | undefined)?.trim()
  if (!hotelId || !name) {
    return NextResponse.json({ error: "hotelId e name richiesti" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  // Guardrail: massimo MAX_COMPETITORS competitor attivi per struttura.
  const { count } = await supabase
    .from("competitors")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("active", true)
  if ((count ?? 0) >= MAX_COMPETITORS) {
    return NextResponse.json(
      {
        error: `Puoi monitorare al massimo ${MAX_COMPETITORS} competitor. Rimuovine uno per aggiungerne un altro.`,
        code: "MAX_REACHED",
      },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from("competitors")
    .insert({
      hotel_id: hotelId,
      name,
      external_ref: body?.externalRef ?? null,
      provider: body?.provider ?? "manual",
      channel: body?.channel ?? null,
    })
    .select("id, name, external_ref, provider, channel, active, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ competitor: data })
}
