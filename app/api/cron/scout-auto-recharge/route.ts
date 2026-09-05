import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { maybeAutoRechargeScout } from "@/lib/scout/auto-recharge"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createServiceClient()
  const { data, error } = await db.rpc("scout_claim_auto_recharge_queue_batch", {
    p_limit: 50,
    p_stale_after_minutes: 15,
  })

  if (error) return NextResponse.json({ error: "queue_claim_failed" }, { status: 500 })

  let processed = 0
  let recharged = 0
  let failed = 0

  for (const row of data ?? []) {
    processed += 1

    try {
      const result = await maybeAutoRechargeScout(db, row.property_id)
      if (result.triggered && "succeeded" in result && result.succeeded) recharged += 1
      const { error: deleteError } = await db
        .from("scout_auto_recharge_queue")
        .delete()
        .eq("property_id", row.property_id)
      if (deleteError) throw deleteError
    } catch (queueError) {
      failed += 1
      const message = queueError instanceof Error ? queueError.message.slice(0, 500) : "unknown_error"
      await db
        .from("scout_auto_recharge_queue")
        .update({ locked_at: null, last_error: message })
        .eq("property_id", row.property_id)
      console.error("[Scout auto recharge cron] tenant failed:", row.property_id, queueError)
    }
  }

  return NextResponse.json({ success: failed === 0, claimed: data?.length ?? 0, processed, recharged, failed })
}
