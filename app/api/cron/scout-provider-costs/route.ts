import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getScoutBillingSettings, syncApolloUsageSnapshot, syncScoutFxSnapshot } from "@/lib/crm/scout-billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createServiceClient()
  const errors: Record<string, string> = {}
  let usage: Awaited<ReturnType<typeof syncApolloUsageSnapshot>> | null = null
  let fx: Awaited<ReturnType<typeof syncScoutFxSnapshot>> | null = null

  try {
    usage = await syncApolloUsageSnapshot(db, "cron")
  } catch (error) {
    console.error("[scout provider costs cron] Apollo", error)
    errors.apollo = error instanceof Error ? error.message : "Apollo usage sync failed"
  }

  try {
    const settings = await getScoutBillingSettings(db)
    fx = await syncScoutFxSnapshot(db, settings)
  } catch (error) {
    console.error("[scout provider costs cron] FX", error)
    errors.fx = error instanceof Error ? error.message : "ECB FX sync failed"
  }

  const lead = usage?.credits.lead_credit ?? { limit: 0, consumed: 0, leftOver: 0 }
  const directDial = usage?.credits.direct_dial_credit ?? { limit: 0, consumed: 0, leftOver: 0 }

  return NextResponse.json({
    ok: Object.keys(errors).length === 0,
    fetchedAt: usage?.fetchedAt ?? null,
    cycle: usage?.currentCycle ?? null,
    lead,
    directDial,
    fx,
    errors,
  })
}
