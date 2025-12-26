import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { withPropertyId } from "@/lib/auth-property"

// Endpoint per il widget chat live
export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { property_id: propertyId } = body

  if (!propertyId) {
    return NextResponse.json({ error: "property_id is required (from widget embed)" }, { status: 400 })
  }

  const { action, conversation_id, message, visitor } = body

  if (action === "start") {
    // Avvia nuova conversazione chat
    let contactId = null

    // Crea contatto se fornito
    if (visitor?.email || visitor?.name) {
      const { data: contact } = await supabase
        .from("contacts")
        .insert(
          withPropertyId(
            {
              name: visitor.name || "Visitatore",
              email: visitor.email,
              language: visitor.language || "it",
            },
            propertyId,
          ),
        )
        .select()
        .single()

      contactId = contact?.id
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert(
        withPropertyId(
          {
            channel: "chat",
            contact_id: contactId,
            metadata: {
              page_url: visitor?.page_url,
              user_agent: visitor?.user_agent,
            },
          },
          propertyId,
        ),
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: settings } = await supabase
      .from("channel_settings")
      .select("settings")
      .eq("channel", "chat")
      .eq("property_id", propertyId)
      .single()

    const welcomeMessage = settings?.settings?.welcome_message || "Ciao! Come possiamo aiutarti?"

    await supabase.from("messages").insert(
      withPropertyId(
        {
          conversation_id: conversation.id,
          content: welcomeMessage,
          sender_type: "system",
          content_type: "text",
        },
        propertyId,
      ),
    )

    return NextResponse.json({
      conversation_id: conversation.id,
      welcome_message: welcomeMessage,
    })
  }

  if (action === "send" && conversation_id && message) {
    const { data, error } = await supabase
      .from("messages")
      .insert(
        withPropertyId(
          {
            conversation_id,
            content: message,
            sender_type: "customer",
            content_type: "text",
          },
          propertyId,
        ),
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: data })
  }

  if (action === "messages" && conversation_id) {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation_id)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
