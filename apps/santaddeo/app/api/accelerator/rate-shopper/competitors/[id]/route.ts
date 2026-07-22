import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"

// Verifica che il competitor appartenga a una struttura accessibile.
async function guardCompetitor(id: string) {
  const supabase = await createServiceRoleClient()
  const { data: comp } = await supabase.from("competitors").select("hotel_id").eq("id", id).single()
  if (!comp) return { error: NextResponse.json({ error: "Competitor non trovato" }, { status: 404 }) }
  const denied = await validateHotelAccess(comp.hotel_id)
  if (denied) return { error: denied }
  if (!(await hasAddon(comp.hotel_id, "rate_shopper"))) {
    return { error: NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 }) }
  }
  return { supabase, hotelId: comp.hotel_id as string }
}

// PATCH: rinomina / aggiorna external_ref / channel.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardCompetitor(id)
  if (g.error) return g.error

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === "string") patch.name = body.name.trim()
  if ("externalRef" in body) patch.external_ref = body.externalRef
  if ("channel" in body) patch.channel = body.channel
  if ("provider" in body) patch.provider = body.provider

  const { data, error } = await g.supabase!
    .from("competitors")
    .update(patch)
    .eq("id", id)
    .select("id, name, external_ref, provider, channel, active, created_at")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ competitor: data })
}

// DELETE: soft-delete (active=false) per preservare lo storico prezzi.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardCompetitor(id)
  if (g.error) return g.error

  const { error } = await g.supabase!
    .from("competitors")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
