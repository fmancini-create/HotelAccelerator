import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteRepository } from "@/lib/platform-repositories"
import { InboxWriteService } from "@/lib/platform-services"

export async function POST(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { conversationId } = params
    const body = await request.json()

    const { booking_data } = body

    if (!booking_data || typeof booking_data !== "object") {
      return NextResponse.json({ error: "booking_data is required and must be an object" }, { status: 400 })
    }

    const supabase = await createClient()
    const repository = new InboxWriteRepository(supabase)
    const service = new InboxWriteService(repository)

    const conversation = await service.updateBookingData({
      conversationId,
      propertyId,
      bookingData: booking_data,
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("[INBOX] Error updating booking data:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
