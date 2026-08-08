import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function POST(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { conversationId } = params

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)

    const conversation = await service.markAsRead({
      conversationId,
      propertyId,
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    return handleServiceError(error)
  }
}
