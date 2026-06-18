import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { pushConversationStateToGmail } from "@/lib/email/gmail-state-sync"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    // messageIds is optional: when omitted we mark the whole conversation read.
    const body = await request.json().catch(() => ({}))
    const { messageIds } = body

    const supabase = await createClient()

    // Update messages status to 'read' only if currently 'received'.
    let query = supabase
      .from("messages")
      .update({ status: "read" })
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .eq("status", "received")

    if (Array.isArray(messageIds) && messageIds.length > 0) {
      query = query.in("id", messageIds)
    }

    const { data, error } = await query.select("id")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Keep the conversation's unread counter in sync.
    await supabase
      .from("conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("property_id", propertyId)

    // Mirror to Gmail (app -> Gmail). Best-effort, never blocks the response.
    await pushConversationStateToGmail(supabase, conversationId, propertyId, { read: true })

    return NextResponse.json({ updated: data?.length || 0 })
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
