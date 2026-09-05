import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const MAX_WINDOW_MS = 5 * 60_000
const LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("calls", request)
    const identity = await getCallerIdentity(request)
    if (!identity?.propertyId) {
      return NextResponse.json({ error: "property_required", items: [] }, { status: 400 })
    }

    const afterRaw = request.nextUrl.searchParams.get("after")
    const afterMs = afterRaw ? new Date(afterRaw).getTime() : Number.NaN
    if (!Number.isFinite(afterMs)) {
      return NextResponse.json({ error: "invalid_after", items: [] }, { status: 400 })
    }

    const nowMs = Date.now()
    const boundedAfterMs = Math.max(afterMs, nowMs - MAX_WINDOW_MS)
    const boundedAfter = new Date(boundedAfterMs).toISOString()
    const nowCursor = new Date(nowMs).toISOString()

    const sb = createServiceClient()
    const { data, error } = await sb
      .from("phone_calls")
      .select("id,counterpart_number,started_at,status,created_at")
      .eq("property_id", identity.propertyId)
      .eq("direction", "inbound")
      .gte("created_at", boundedAfter)
      .lte("created_at", nowCursor)
      .order("created_at", { ascending: true })
      .limit(LIMIT)

    if (error) throw error

    const items = data ?? []
    const lastCreatedAt = items.at(-1)?.created_at ?? null
    const cursor = items.length >= LIMIT && lastCreatedAt ? lastCreatedAt : nowCursor

    return NextResponse.json({ items, cursor })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[communication-alerts] phone feed failed", error)
    return NextResponse.json({ error: "internal_error", items: [] }, { status: 500 })
  }
}
