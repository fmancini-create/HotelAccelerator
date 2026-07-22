import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import {
  COMMISSION_CATEGORY_SLUGS,
  DEFAULT_COMMISSION_PCT,
  type ChannelCategorySlug,
} from "@/lib/pace/channel-commissions"

export const dynamic = "force-dynamic"

// GET: commissioni per-canale configurate per la struttura.
// Ritorna sempre tutte le 4 categorie: quelle non configurate riportano il
// default e `isConfigured: false` (cosi' la UI puo' mostrare la nota di stima).
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "booking_pace"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("pace_channel_commissions")
    .select("category, commission_pct, updated_at")
    .eq("hotel_id", hotelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bySlug = new Map<string, number>((data ?? []).map((r) => [r.category as string, Number(r.commission_pct)]))
  const commissions = COMMISSION_CATEGORY_SLUGS.map((slug) => ({
    category: slug,
    commissionPct: bySlug.has(slug) ? bySlug.get(slug)! : DEFAULT_COMMISSION_PCT[slug],
    isConfigured: bySlug.has(slug),
    defaultPct: DEFAULT_COMMISSION_PCT[slug],
  }))

  return NextResponse.json({ commissions })
}

// PUT: salva (upsert) le commissioni per-canale. Body:
//   { hotelId, commissions: { diretto?: number, ota?: number, ... } }
// Un valore null/assente per una categoria significa "torna al default":
// la riga viene rimossa cosi' la GET ricade sul default.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const input = body?.commissions as Record<string, number | null> | undefined
  if (!hotelId || !input || typeof input !== "object") {
    return NextResponse.json({ error: "hotelId e commissions richiesti" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "booking_pace"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()
  const toUpsert: Array<{ hotel_id: string; category: string; commission_pct: number }> = []
  const toDelete: string[] = []

  for (const slug of COMMISSION_CATEGORY_SLUGS) {
    if (!(slug in input)) continue
    const raw = input[slug]
    if (raw == null || raw === ("" as unknown as number)) {
      toDelete.push(slug)
      continue
    }
    const pct = Number(raw)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: `Valore non valido per ${slug}: usa una % tra 0 e 100` }, { status: 400 })
    }
    toUpsert.push({ hotel_id: hotelId, category: slug, commission_pct: Math.round(pct * 100) / 100 })
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("pace_channel_commissions")
      .upsert(toUpsert, { onConflict: "hotel_id,category" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("pace_channel_commissions")
      .delete()
      .eq("hotel_id", hotelId)
      .in("category", toDelete as ChannelCategorySlug[])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
