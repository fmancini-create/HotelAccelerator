import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import {
  DEFAULT_REPLY_SETTINGS,
  sanitizeReplySettings,
  settingsFromRow,
  settingsToRow,
} from "@/lib/reviews/reply-settings"

export const dynamic = "force-dynamic"

/**
 * Impostazioni di personalizzazione delle risposte AI alle recensioni (hotel-scoped).
 * GET ?hotelId=...                 -> ritorna le impostazioni (default se mai salvate)
 * PUT { hotelId, settings }        -> upsert delle impostazioni
 *
 * Auth: validateHotelAccess (super_admin / org / multi-struttura, con dev
 * bypass). La tabella hotel_review_reply_settings e' gestita via service role.
 */

export async function GET(request: NextRequest) {
  const hotelId = new URL(request.url).searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const svc = await createServiceRoleClient()
  const { data: row, error } = await svc
    .from("hotel_review_reply_settings")
    .select("*")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: row ? settingsFromRow(row) : DEFAULT_REPLY_SETTINGS })
}

export async function PUT(request: NextRequest) {
  let body: { hotelId?: string; settings?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const hotelId = body.hotelId
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const clean = sanitizeReplySettings(body.settings)
  const svc = await createServiceRoleClient()
  const { error } = await svc.from("hotel_review_reply_settings").upsert(
    {
      hotel_id: hotelId,
      ...settingsToRow(clean),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hotel_id" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: clean })
}
