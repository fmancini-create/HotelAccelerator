import { type NextRequest, NextResponse } from "next/server"
import { getWebTrafficRouteContext } from "@/lib/web-traffic/route-context"
import { forwardWebTrafficAnalytics, WebTrafficFederationError } from "@/lib/web-traffic/federation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getWebTrafficRouteContext(request)
    const upstream = await forwardWebTrafficAnalytics(ctx.santaddeoHotelId, request.nextUrl.searchParams)
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof WebTrafficFederationError) return response({ error: error.code }, error.status)
    console.error("[web-traffic] analytics failed", error)
    return response({ error: "web_traffic_analytics_failed" }, 500)
  }
}
