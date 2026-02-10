import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteRepository } from "@/lib/platform-repositories"
import { InboxWriteService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { checkModuleEnabledForProperty } from "@/lib/module-guard"

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const guard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (guard) return guard
    const { conversationId } = await params

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
