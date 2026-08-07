import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"

export async function POST(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { conversationId } = params
    const body = await request.json()

    const { outcome, booking_data } = body

    if (!outcome || typeof outcome !== "string") {
      return NextResponse.json({ error: "outcome is required and must be a string" }, { status: 400 })
    }

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)

    const conversation = await service.updateOutcome({
      conversationId,
      propertyId,
      outcome,
      bookingData: booking_data,
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("[INBOX] Error updating outcome:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
