/**
 * CRON: Clean up old performance logs (retention = 7 days)
 * Runs daily at 04:00 UTC
 * Protected: Vercel cron sends CRON_SECRET automatically
 */
import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const supabase = await createServiceRoleClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [apiResult, vitalsResult] = await Promise.all([
      supabase.from("perf_api_logs").delete().lt("created_at", sevenDaysAgo).select("id", { count: "exact", head: true }),
      supabase.from("perf_web_vitals").delete().lt("created_at", sevenDaysAgo).select("id", { count: "exact", head: true }),
    ])

    return NextResponse.json({
      success: true,
      cleaned: {
        api_logs: apiResult.count ?? 0,
        web_vitals: vitalsResult.count ?? 0,
      },
      before: sevenDaysAgo,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
