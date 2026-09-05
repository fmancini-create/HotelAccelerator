import { type NextRequest, NextResponse } from "next/server"

import { forwardReviewsInsights } from "@/lib/reviews/federation"
import { resolveNativeReviewsContext } from "@/lib/reviews/route-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

async function run(request: NextRequest, method: "GET" | "POST") {
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error
  const upstream = await forwardReviewsInsights({
    hotelId: context.workspace!.santaddeoHotelId,
    origin: "hotelaccelerator",
    method,
    body: method === "POST" ? await request.text() : undefined,
  })
  return NextResponse.json(upstream.payload, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  return run(request, "GET")
}

export async function POST(request: NextRequest) {
  return run(request, "POST")
}
