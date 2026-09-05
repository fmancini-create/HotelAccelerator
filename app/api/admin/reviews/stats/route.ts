import { type NextRequest, NextResponse } from "next/server"

import { forwardReviewsStats } from "@/lib/reviews/federation"
import { resolveNativeReviewsContext } from "@/lib/reviews/route-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error
  const upstream = await forwardReviewsStats({
    hotelId: context.workspace!.santaddeoHotelId,
    origin: "hotelaccelerator",
    query: request.nextUrl.searchParams,
  })
  return NextResponse.json(upstream.payload, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  })
}
