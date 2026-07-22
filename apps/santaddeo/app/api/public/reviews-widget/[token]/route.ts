import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeConfig, platformLabel } from "@/lib/reviews/widget"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Endpoint PUBBLICO (no auth, CORS *): dati del widget recensioni.
 * Validato dal token opaco. Ritorna punteggi per-canale + complessivo.
 * Cache 15 min (s-maxage) per ridurre il carico: i punteggi cambiano lentamente.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400, headers: CORS })
  }

  const svc = await createServiceRoleClient()
  const { data: widget } = await svc
    .from("review_widget_configs")
    .select("hotel_id, config, is_active")
    .eq("public_token", token)
    .maybeSingle()

  if (!widget || !widget.is_active) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS })
  }

  const config = sanitizeConfig(widget.config)

  // Hotel name (per il titolo di default)
  const { data: hotel } = await svc
    .from("hotels")
    .select("name")
    .eq("id", widget.hotel_id)
    .maybeSingle()

  // Punteggi per canale — paginazione per evitare il cap di 1000 righe PostgREST
  const PAGE = 1000
  const rows: Array<{ platform: string | null; rating: number | null }> = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await svc
      .from("hotel_reviews")
      .select("platform, rating")
      .eq("hotel_id", widget.hotel_id)
      .range(from, from + PAGE - 1)
    if (error) break
    const batch = page || []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  const byPlatform = new Map<string, { sum: number; n: number }>()
  let overallSum = 0
  let overallN = 0
  for (const r of rows) {
    const p = (r.platform || "unknown").toLowerCase()
    const rating = Number(r.rating)
    if (isNaN(rating)) continue
    const cur = byPlatform.get(p) ?? { sum: 0, n: 0 }
    cur.sum += rating
    cur.n += 1
    byPlatform.set(p, cur)
    overallSum += rating
    overallN += 1
  }

  let platforms = Array.from(byPlatform.entries())
    .map(([platform, v]) => ({
      platform,
      label: platformLabel(platform),
      avg: v.n > 0 ? Number((v.sum / v.n).toFixed(2)) : null,
      count: v.n,
    }))
    .sort((a, b) => b.count - a.count)

  // Filtro canali selezionati (se impostati)
  if (config.platforms.length > 0) {
    const allow = new Set(config.platforms.map((p) => p.toLowerCase()))
    platforms = platforms.filter((p) => allow.has(p.platform))
  }

  const overall = overallN > 0 ? Number((overallSum / overallN).toFixed(2)) : null

  return NextResponse.json(
    {
      title: config.title || hotel?.name || "",
      overall,
      totalCount: overallN,
      platforms,
      config,
    },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    },
  )
}
