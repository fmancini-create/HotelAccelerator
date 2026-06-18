import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const body = await request.json()

    const {
      content,
      sender_type = "agent",
      sender_id,
      content_type = "text",
      attachments = [],
      forward_to,
      forward_subject,
    } = body

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)

    const message = await service.sendMessage({
      conversationId,
      propertyId,
      content,
      senderType: sender_type,
      senderId: sender_id,
      contentType: content_type,
      attachments,
      forwardTo: forward_to,
      forwardSubject: forward_subject,
    })

    return NextResponse.json({ message })
  } catch (error) {
    return handleServiceError(error)
  }
}
