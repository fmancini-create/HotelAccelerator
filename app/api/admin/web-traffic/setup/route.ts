import { type NextRequest, NextResponse } from "next/server"
import { getWebTrafficRouteContext } from "@/lib/web-traffic/route-context"
import { forwardWebTrafficSetup, WebTrafficFederationError } from "@/lib/web-traffic/federation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getWebTrafficRouteContext(request)
    const upstream = await forwardWebTrafficSetup(ctx.santaddeoHotelId)
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof WebTrafficFederationError) return response({ error: error.code }, error.status)
    console.error("[web-traffic] setup failed", error)
    return response({ error: "web_traffic_setup_failed" }, 500)
  }
}
