import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import {
  getPricingStatus,
  setPricingMode,
  turnOffPricing,
} from "@/lib/web-traffic/pricing-activation"

export const dynamic = "force-dynamic"

/**
 * Attivazione del segnale "domanda diretta" (visite sito) nel motore prezzi.
 * Tutto gated sull'addon web_traffic + accesso struttura.
 *
 * GET    ?hotelId=...        -> stato { locked? | mode, status, dataDays, ... }
 * POST   { hotelId, mode }   -> imposta modalita' ('now' | 'after_10_days')
 * DELETE ?hotelId=...        -> spegne l'effetto sul pricing
 */

async function guard(hotelId: string | null) {
  if (!hotelId) return { error: NextResponse.json({ error: "hotelId required" }, { status: 400 }) }
  const denied = await validateHotelAccess(hotelId)
  if (denied) return { error: denied }
  const unlocked = await hasAddon(hotelId, "web_traffic")
  if (!unlocked) return { locked: true as const }
  return { ok: true as const }
}

export async function GET(request: NextRequest) {
  const hotelId = new URL(request.url).searchParams.get("hotelId")
  const g = await guard(hotelId)
  if ("error" in g) return g.error
  if ("locked" in g) return NextResponse.json({ locked: true })

  const svc = await createServiceRoleClient()
  const status = await getPricingStatus(svc, hotelId!)
  return NextResponse.json({ locked: false, ...status })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const hotelId: string | null = body?.hotelId ?? null
  const mode = body?.mode
  if (mode !== "now" && mode !== "after_10_days") {
    return NextResponse.json({ error: "mode must be 'now' or 'after_10_days'" }, { status: 400 })
  }
  const g = await guard(hotelId)
  if ("error" in g) return g.error
  if ("locked" in g) return NextResponse.json({ error: "addon non attivo" }, { status: 403 })

  const svc = await createServiceRoleClient()
  const status = await setPricingMode(svc, hotelId!, mode)
  return NextResponse.json({ locked: false, ...status })
}

export async function DELETE(request: NextRequest) {
  const hotelId = new URL(request.url).searchParams.get("hotelId")
  const g = await guard(hotelId)
  if ("error" in g) return g.error
  if ("locked" in g) return NextResponse.json({ error: "addon non attivo" }, { status: 403 })

  const svc = await createServiceRoleClient()
  await turnOffPricing(svc, hotelId!)
  const status = await getPricingStatus(svc, hotelId!)
  return NextResponse.json({ locked: false, ...status })
}
