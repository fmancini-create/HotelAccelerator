import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxReadService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()
    const supabase = await createClient()
    const service = new InboxReadService(supabase)

    const { conversationId } = params

    const conversation = await service.getConversation(propertyId, conversationId)

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found", code: "NOT_FOUND" }, { status: 404 })
    }

    return NextResponse.json({
      conversation: {
        ...conversation,
        contact: conversation.contact,
        assigned: conversation.assigned,
      },
      messages: conversation.messages,
    })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PATCH(request: Request, { params }: { params: { conversationId: string } }) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = await createClient()
    const { conversationId } = params

    if (!UUID_REGEX.test(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation ID format", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const body = await request.json()

    const { data, error } = await supabase
      .from("conversations")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversation: data })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
