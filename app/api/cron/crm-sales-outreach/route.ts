import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { deliverProspectingEmail } from "@/lib/crm/prospecting-email"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()

  // Recover claims abandoned by a crashed function. A successfully delivered
  // activity has sent_at and is never reset.
  const staleProcessingBefore = new Date(Date.now() - 20 * 60_000).toISOString()
  await db
    .from("crm_sales_activities")
    .update({ status: "ready", updated_at: now.toISOString() })
    .eq("channel", "email")
    .eq("status", "processing")
    .is("sent_at", null)
    .lt("updated_at", staleProcessingBefore)

  const { data: activities, error } = await db
    .from("crm_sales_activities")
    .select("id, property_id, attempts")
    .eq("channel", "email")
    .eq("status", "ready")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(25)

  if (error) {
    console.error("[crm-sales-outreach] queue read failed:", error)
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 })
  }

  let sent = 0
  let alreadySent = 0
  let inProgress = 0
  let failed = 0

  for (const activity of activities ?? []) {
    try {
      const result = await deliverProspectingEmail(db, activity.id)
      if (result.alreadySent) alreadySent += 1
      else if (result.alreadyProcessing) inProgress += 1
      else sent += 1
    } catch (error) {
      failed += 1
      const attempts = Number(activity.attempts || 0) + 1
      const retryAt = new Date(Date.now() + Math.min(attempts * 15, 120) * 60_000).toISOString()
      const message = (error instanceof Error ? error.message : "delivery_error").slice(0, 500)

      const { data: current } = await db
        .from("crm_sales_activities")
        .select("sent_at, status")
        .eq("id", activity.id)
        .eq("property_id", activity.property_id)
        .maybeSingle()

      if (current?.sent_at || current?.status === "completed") {
        alreadySent += 1
        continue
      }

      await db
        .from("crm_sales_activities")
        .update({
          status: attempts >= 5 ? "failed" : "ready",
          attempts,
          last_error: message,
          due_at: retryAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activity.id)
        .eq("property_id", activity.property_id)
    }
  }

  return NextResponse.json({ processed: activities?.length ?? 0, sent, alreadySent, inProgress, failed })
}
