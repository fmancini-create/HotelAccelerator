import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"

/**
 * Statistiche del tool "Traffico Web" (addon a pagamento web_traffic).
 *
 * GET ?hotelId=...&days=30
 *  -> { locked: true }                       se l'addon non e' attivo
 *  -> { locked: false, totals, series, ... } se attivo (o super_admin/dev)
 *
 * Auth: validateHotelAccess + hasAddon('web_traffic'). Dati letti via service
 * role dalla tabella aggregata site_visit_daily (cookieless).
 */

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const hotelId = url.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const unlocked = await hasAddon(hotelId, "web_traffic")
  if (!unlocked) {
    return NextResponse.json({ locked: true })
  }

  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 7), 90)
  const svc = await createServiceRoleClient()

  // Finestra [from, today] in date locali Europe/Rome.
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }))
  const from = new Date(today)
  from.setDate(from.getDate() - (days - 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const { data: rows } = await svc
    .from("site_visit_daily")
    .select("day, pageviews, sessions")
    .eq("hotel_id", hotelId)
    .gte("day", iso(from))
    .lte("day", iso(today))
    .order("day", { ascending: true })

  const byDay = new Map<string, { pageviews: number; sessions: number }>()
  for (const r of rows || []) byDay.set(r.day, { pageviews: r.pageviews, sessions: r.sessions })

  // Serie densa (giorni senza dati = 0).
  const series: Array<{ day: string; pageviews: number; sessions: number }> = []
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setDate(from.getDate() + i)
    const key = iso(d)
    const v = byDay.get(key) || { pageviews: 0, sessions: 0 }
    series.push({ day: key, pageviews: v.pageviews, sessions: v.sessions })
  }

  const totalPageviews = series.reduce((a, b) => a + b.pageviews, 0)
  const totalSessions = series.reduce((a, b) => a + b.sessions, 0)
  const lastDataDay = (rows || []).length ? rows![rows!.length - 1].day : null
  const receiving = !!lastDataDay && lastDataDay >= iso(new Date(today.getTime() - 2 * 86400000))

  // Token pubblico del widget: serve a generare lo snippet di installazione
  // (incl. la modalita' "track" da mettere sul booking engine). E' lo stesso
  // token gia' esposto pubblicamente dal widget recensioni.
  const { data: cfg } = await svc
    .from("review_widget_configs")
    .select("public_token")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  return NextResponse.json({
    locked: false,
    days,
    totals: { pageviews: totalPageviews, sessions: totalSessions },
    series,
    installed: (rows || []).length > 0,
    receiving,
    lastDataDay,
    publicToken: cfg?.public_token ?? null,
  })
}
