import { type NextRequest, NextResponse } from "next/server"

import { forwardReviewTicketIntelligence } from "@/lib/reviews/federation"
import { resolveNativeReviewsContext } from "@/lib/reviews/route-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error
  const upstream = await forwardReviewTicketIntelligence({
    hotelId: context.workspace!.santaddeoHotelId,
    origin: "hotelaccelerator",
    body: await request.text(),
  })
  return NextResponse.json(upstream.payload, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  })
}
