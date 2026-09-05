import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { syncApolloUsageSnapshot } from "@/lib/crm/scout-billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`)
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const usage = await syncApolloUsageSnapshot(createServiceClient(), "cron")
    const lead = usage.credits.lead_credit ?? { limit: 0, consumed: 0, leftOver: 0 }
    const directDial = usage.credits.direct_dial_credit ?? { limit: 0, consumed: 0, leftOver: 0 }

    return NextResponse.json({
      ok: true,
      fetchedAt: usage.fetchedAt,
      cycle: usage.currentCycle,
      lead,
      directDial,
    })
  } catch (error) {
    console.error("[scout provider costs cron]", error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Apollo usage sync failed",
    }, { status: 502 })
  }
}
