/**
 * GET /api/ai-report/history?hotelId=...&limit=50
 *
 * Lista dei rapporti AI storicizzati per un hotel, ordinati per data
 * decrescente. Restituisce solo metadati e KPI summary (no report_text)
 * per tenere bassa la response. Il testo completo si carica con
 * `/api/ai-report/history/[id]`.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200)

  if (!hotelId) {
    return NextResponse.json({ error: "missing_hotelId" }, { status: 400 })
  }

  // Service role: il pattern del progetto usa il backend come ABAC layer.
  // Qui qualsiasi utente autenticato puo' leggere i report dell'hotel
  // selezionato — coerente con il resto della UI (Guard, pricing log, ecc.).
  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("ai_reports")
    .select(
      "id, created_at, range_from, range_to, date_mode, compare_yoy, compare_period_before, hotel_name, kpi_payload, user_id",
    )
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[ai-report/history] list error:", error.message)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Strip kpi_payload.details (heavy) per la lista; manteniamo solo i 5 KPI
  // box e label compare cosi' la UI puo' mostrare un riepilogo nell'item.
  const items = (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    range_from: r.range_from,
    range_to: r.range_to,
    date_mode: r.date_mode,
    compare_yoy: r.compare_yoy,
    compare_period_before: r.compare_period_before,
    hotel_name: r.hotel_name,
    user_id: r.user_id,
    kpi_summary: r.kpi_payload
      ? {
          compareLabel: r.kpi_payload.compareLabel ?? null,
          compareDataAvailable: r.kpi_payload.compareDataAvailable ?? null,
          revenueTotal: r.kpi_payload.kpis?.revenueTotal ?? null,
          roomNights: r.kpi_payload.kpis?.roomNights ?? null,
          revpor: r.kpi_payload.kpis?.revpor ?? null,
          revenueDeltaPct: r.kpi_payload.kpis?.revenueDeltaPct ?? null,
          cancelRatePct: r.kpi_payload.kpis?.cancelRatePct ?? null,
          days: r.kpi_payload.range?.days ?? null,
        }
      : null,
  }))

  return NextResponse.json({ items })
}
