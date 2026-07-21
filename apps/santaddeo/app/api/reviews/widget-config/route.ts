import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import {
  DEFAULT_WIDGET_CONFIG,
  generateWidgetToken,
  sanitizeConfig,
} from "@/lib/reviews/widget"
import { sanitizeLastMinuteConfig } from "@/lib/embed/widgets-shared"

export const dynamic = "force-dynamic"

/**
 * Forma del JSONB `config`: la config recensioni resta al TOP-LEVEL (cosi'
 * l'endpoint pubblico /api/public/reviews-widget continua a leggerla con
 * sanitizeConfig senza modifiche), mentre i widget aggiuntivi del canale
 * embeddabile vivono sotto `config.widgets.*`.
 */
function readLastMinute(config: unknown) {
  const root = (config && typeof config === "object" ? config : {}) as Record<string, unknown>
  const widgets = (root.widgets && typeof root.widgets === "object" ? root.widgets : {}) as Record<string, unknown>
  return sanitizeLastMinuteConfig(widgets.lastminute)
}

/** Unisce config recensioni (top-level) + widget extra (config.widgets.*). */
function mergeConfig(reviews: Record<string, unknown>, lastMinute: unknown) {
  return { ...reviews, widgets: { lastminute: sanitizeLastMinuteConfig(lastMinute) } }
}

/**
 * Configurazione del Widget Recensioni per un hotel (hotel-scoped).
 * GET  ?hotelId=...  -> ritorna la config (la crea col token al primo accesso)
 * PUT  { hotelId, config, isActive } -> aggiorna la config
 *
 * Auth: validateHotelAccess (super_admin / org / multi-struttura, con dev
 * bypass). La tabella review_widget_configs e' gestita via service role.
 */

export async function GET(request: NextRequest) {
  const hotelId = new URL(request.url).searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const svc = await createServiceRoleClient()
  let { data: row } = await svc
    .from("review_widget_configs")
    .select("public_token, config, is_active")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  // Creazione lazy alla prima apertura del customizer
  if (!row) {
    const token = generateWidgetToken()
    const { data: created, error } = await svc
      .from("review_widget_configs")
      .insert({
        hotel_id: hotelId,
        public_token: token,
        config: mergeConfig(DEFAULT_WIDGET_CONFIG as unknown as Record<string, unknown>, undefined),
      })
      .select("public_token, config, is_active")
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    row = created
  }

  return NextResponse.json({
    token: row.public_token,
    config: sanitizeConfig(row.config),
    lastMinuteConfig: readLastMinute(row.config),
    isActive: row.is_active,
  })
}

export async function PUT(request: NextRequest) {
  let body: { hotelId?: string; config?: unknown; lastMinuteConfig?: unknown; isActive?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const hotelId = body.hotelId
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const cleanReviews = sanitizeConfig(body.config)
  const svc = await createServiceRoleClient()

  // upsert garantendo l'esistenza del token. Preserva config.widgets.lastminute
  // esistente se il PUT non lo include (es. salvataggio dal solo tab recensioni).
  const { data: existing } = await svc
    .from("review_widget_configs")
    .select("public_token, config")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  const lmInput = body.lastMinuteConfig !== undefined ? body.lastMinuteConfig : readLastMinute(existing?.config)
  const merged = mergeConfig(cleanReviews as unknown as Record<string, unknown>, lmInput)

  const token = existing?.public_token || generateWidgetToken()
  const { error } = await svc.from("review_widget_configs").upsert(
    {
      hotel_id: hotelId,
      public_token: token,
      config: merged,
      is_active: body.isActive !== false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hotel_id" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    token,
    config: cleanReviews,
    lastMinuteConfig: sanitizeLastMinuteConfig(lmInput),
    isActive: body.isActive !== false,
  })
}
