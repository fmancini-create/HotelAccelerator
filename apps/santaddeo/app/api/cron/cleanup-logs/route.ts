import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
