/**
 * GET /api/v1/hotels/:hotelId/departments
 *
 * Revenue aggregato per reparto/segmento (Room, F&B, Spa, Wellness, Bar, Parking, etc.)
 * Scope richiesto: departments:read
 *
 * Query params:
 *   from=YYYY-MM-DD  (filtro check_in >= from, default: inizio anno)
 *   to=YYYY-MM-DD    (filtro check_in <= to, default: oggi)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiOk, apiInternalError, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "departments:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    const now = new Date()
    const defaultFrom = `${now.getFullYear()}-01-01`
    const defaultTo = now.toISOString().slice(0, 10)
    const { from, to } = parseDateRange(searchParams)
    const dateFrom = from || defaultFrom
    const dateTo = to || defaultTo

    // Fetch revenue data from daily_production with department breakdown
    // Se disponibili, usare la tabella revenue_by_department
    // Altrimenti calcolare da bookings (solo Room revenue) + revenue_objectives (per altri reparti)
    
    const { data: revenueData, error: revError } = await supabase
      .from("revenue_by_department")
      .select("date, department, revenue, quantity")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date, department", { ascending: true })

    if (revError && revError.code !== "PGRST116") {
      // 15/07/2026: declassato da warn a log. La tabella revenue_by_department
      // NON e' mai esistita: il fallback Room-only da daily_production e' il
      // comportamento PREVISTO e documentato (docs/API-DOCUMENTATION-v1.md).
      // Il warn ad ogni chiamata inquinava i log level:warning senza segnalare
      // nulla di anomalo.
      console.log("[v1/departments] revenue_by_department non presente (previsto): fallback Room da daily_production")
    }

    // Fallback: calcolo Room revenue da daily_production
    let fallbackRoomRevenue: { date: string; department: string; revenue: number }[] = []
    if (!revenueData || revenueData.length === 0) {
      const { data: dpData } = await supabase
        .from("daily_production")
        .select("date, total_revenue")
        .eq("hotel_id", hotelId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true })

      fallbackRoomRevenue = (dpData || []).map(d => ({
        date: d.date,
        department: "Room",
        revenue: Number(d.total_revenue) || 0,
      }))
    }

    // Aggregazione per reparto
    const departmentMap = new Map<string, {
      department: string
      revenue: number
      quantity: number
      avg_per_day: number
    }>()

    const dataToProcess = revenueData || fallbackRoomRevenue

    for (const row of dataToProcess) {
      const dept = row.department || "Room"
      const existing = departmentMap.get(dept)
      const revenue = Number(row.revenue) || 0
      const qty = Number(row.quantity) || 1

      if (existing) {
        existing.revenue += revenue
        existing.quantity += qty
      } else {
        departmentMap.set(dept, {
          department: dept,
          revenue,
          quantity: qty,
          avg_per_day: 0,
        })
      }
    }

    // Calcolo avg_per_day
    const dayCount = Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1

    const departments = Array.from(departmentMap.values())
      .map((d) => ({
        ...d,
        revenue: Math.round(d.revenue * 100) / 100,
        avg_per_day: Math.round((d.revenue / dayCount) * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    const totalRevenue = departments.reduce((s, d) => s + d.revenue, 0)

    return apiOk({
      period: { from: dateFrom, to: dateTo, days: dayCount },
      summary: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        departments_count: departments.length,
      },
      departments: departments.map(d => ({
        ...d,
        revenue_share: totalRevenue > 0 ? Math.round((d.revenue / totalRevenue) * 10000) / 100 : 0,
      })),
    })
  } catch (err: any) {
    console.error("[v1/departments] Unexpected:", err.message)
    return apiInternalError()
  }
}
