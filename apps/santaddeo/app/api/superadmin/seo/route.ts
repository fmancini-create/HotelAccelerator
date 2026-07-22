import { type NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import {
  getQueryTrend,
  getTopQueries,
  GSC_SITE_URL,
  SearchConsoleSetupError,
} from "@/lib/google/search-console"

export const dynamic = "force-dynamic"
export const maxDuration = 30

async function requireSuperadmin() {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const }
}

function setupPayload(err: SearchConsoleSetupError) {
  return NextResponse.json(
    {
      setupRequired: true,
      reason: err.reason,
      siteUrl: GSC_SITE_URL,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
    },
    { status: 200 },
  )
}

export async function GET(req: NextRequest) {
  const guard = await requireSuperadmin()
  if (guard.error) return guard.error

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode") || "top"
  const days = Math.min(Math.max(Number.parseInt(searchParams.get("days") || "90", 10) || 90, 7), 480)

  try {
    if (mode === "trend") {
      const query = searchParams.get("query")?.trim()
      if (!query) return NextResponse.json({ error: "query mancante" }, { status: 400 })
      const rows = await getQueryTrend(query, days)
      const trend = rows.map((r) => ({
        date: r.keys[0],
        position: Math.round(r.position * 10) / 10,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10,
      }))
      return NextResponse.json({ query, days, trend })
    }

    // mode === "top"
    const rows = await getTopQueries(days, 100)
    const queries = rows.map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }))
    return NextResponse.json({ days, queries })
  } catch (err) {
    if (err instanceof SearchConsoleSetupError) return setupPayload(err)
    console.error("[superadmin/seo] error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Errore Search Console" }, { status: 500 })
  }
}
