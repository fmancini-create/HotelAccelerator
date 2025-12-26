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

    const supabase = await createClient()
    const repository = new InboxWriteRepository(supabase)
    const service = new InboxWriteService(repository)

    const conversation = await service.markAsRead({
      conversationId,
      propertyId,
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
