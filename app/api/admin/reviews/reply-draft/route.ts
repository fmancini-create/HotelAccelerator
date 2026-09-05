import { type NextRequest, NextResponse } from "next/server"

import { forwardReviewReplyDraft } from "@/lib/reviews/federation"
import { resolveNativeReviewsContext } from "@/lib/reviews/route-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

async function run(request: NextRequest, method: "POST" | "PATCH") {
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error
  const upstream = await forwardReviewReplyDraft({
    hotelId: context.workspace!.santaddeoHotelId,
    origin: "hotelaccelerator",
    method,
    body: await request.text(),
  })
  return NextResponse.json(upstream.payload, {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  return run(request, "POST")
}

export async function PATCH(request: NextRequest) {
  return run(request, "PATCH")
}
