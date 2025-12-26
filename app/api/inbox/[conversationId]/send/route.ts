import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteRepository } from "@/lib/platform-repositories"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function POST(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const { conversationId } = params
    const body = await request.json()

    const { content, sender_type = "agent", sender_id, content_type = "text", attachments = [] } = body

    const supabase = await createClient()
    const repository = new InboxWriteRepository(supabase)
    const service = new InboxWriteService(repository)

    const message = await service.sendMessage({
      conversationId,
      propertyId,
      content,
      senderType: sender_type,
      senderId: sender_id,
      contentType: content_type,
      attachments,
    })

    return NextResponse.json({ message })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
