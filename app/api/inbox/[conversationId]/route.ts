import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getPropertyId } from "@/lib/tenant"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient()
  const { conversationId } = await params
  const propertyId = getPropertyId(request)

  if (!UUID_REGEX.test(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 })
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`
        *,
        contact:contacts(*),
        assigned:admin_users(id, name, email)
      `)
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()

    if (convError) {
      return NextResponse.json({ error: convError.message, conversation: null, messages: [] }, { status: 500 })
    }

    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (msgError) {
      return NextResponse.json({ error: msgError.message, conversation: null, messages: [] }, { status: 500 })
    }

    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .eq("property_id", propertyId)

    return NextResponse.json({ conversation, messages })
  } catch (error) {
    console.error("[v0] Error in conversation GET:", error)
    return NextResponse.json({ error: "Internal server error", conversation: null, messages: [] }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient()
  const { conversationId } = await params
  const propertyId = getPropertyId(request)

  if (!UUID_REGEX.test(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 })
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
}
