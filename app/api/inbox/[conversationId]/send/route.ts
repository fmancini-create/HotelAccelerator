import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getPropertyId, withPropertyId } from "@/lib/tenant"

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient()
  const { conversationId } = await params
  const body = await request.json()
  const propertyId = getPropertyId(request, body)

  const { content, sender_type, sender_id, content_type = "text", attachments = [] } = body

  const { data: message, error } = await supabase
    .from("messages")
    .insert(
      withPropertyId(
        {
          conversation_id: conversationId,
          content,
          sender_type,
          sender_id,
          content_type,
          attachments,
        },
        propertyId,
      ),
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("property_id", propertyId)

  return NextResponse.json({ message })
}
