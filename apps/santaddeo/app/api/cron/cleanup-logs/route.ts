import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron-auth"

export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase.rpc("cleanup_old_email_logs")

    if (error) {
      console.error("[CRON cleanup-logs] RPC error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deletedCount = data ?? 0
    const timestamp = new Date().toISOString()

    console.log(`[CRON cleanup-logs] ${deletedCount} record cancellati da email_logs (> 90 giorni) at ${timestamp}`)

    return NextResponse.json({
      deleted: deletedCount,
      timestamp,
    })
  } catch (err: any) {
    console.error("[CRON cleanup-logs] Unexpected error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
