import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeLastMinuteConfig } from "@/lib/embed/widgets-shared"
import { resolveActiveLastMinute } from "@/lib/last-minute/resolve-active"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS })
}

/**
 * Endpoint pubblico letto dallo script embeddabile per il banner Last Minute.
 *
 * Risponde con { active, config, offer } SOLO quando:
 *  - il token e' valido e il widget recensioni e' attivo
 *  - il tenant ha abilitato il banner Last Minute (config.widgets.lastminute.enabled)
 *  - c'e' un'offerta last minute REALMENTE attiva (resolveActiveLastMinute)
 *
 * In tutti gli altri casi -> { active: false } e lo script non mostra nulla.
 * Cache breve (60s) perche' le camere/offerte cambiano in giornata.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const headers = {
    ...CORS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=60",
  }

  const inactive = (extra?: Record<string, unknown>) =>
    NextResponse.json({ active: false, ...(extra || {}) }, { headers })

  if (!token) return inactive()

  const supabase = await createServiceRoleClient()
  const { data: row } = await supabase
    .from("review_widget_configs")
    .select("hotel_id, config, is_active")
    .eq("public_token", token)
    .maybeSingle()

  if (!row || row.is_active === false) return inactive()

  // Estrai config Last Minute dal JSONB (config.widgets.lastminute)
  const root = (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>
  const widgets = (root.widgets && typeof root.widgets === "object" ? root.widgets : {}) as Record<string, unknown>
  const lmConfig = sanitizeLastMinuteConfig(widgets.lastminute)

  if (!lmConfig.enabled) return inactive()

  // Verifica offerta REALMENTE attiva (dati certi)
  const offer = await resolveActiveLastMinute(row.hotel_id)
  if (!offer.active) return inactive()

  return NextResponse.json(
    {
      active: true,
      config: lmConfig,
      offer: {
        discountPct: offer.maxDiscountPct,
        roomsLeft: offer.roomsLeft,
        dateFrom: offer.dateFrom,
        dateTo: offer.dateTo,
        nights: offer.nights,
      },
    },
    { headers },
  )
}
