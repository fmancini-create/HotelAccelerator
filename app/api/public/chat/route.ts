import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * PUBLIC API - Chat Widget Backend
 * POST: Visitor sends a message (creates conversation if needed)
 * GET: Visitor polls for new messages in their conversation
 * 
 * No auth required - uses session_id to track visitors
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_id, session_id, message, visitor_name, visitor_email } = body

    if (!property_id || !session_id || !message) {
      return NextResponse.json(
        { error: "property_id, session_id e message sono obbligatori" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify widget is active for this property
    const { data: widget } = await supabase
      .from("embed_scripts")
      .select("id, is_active, config")
      .eq("property_id", property_id)
      .eq("script_type", "chat")
      .eq("is_active", true)
      .single()

    if (!widget) {
      return NextResponse.json(
        { error: "Chat non attiva per questa struttura" },
        { status: 404 }
      )
    }

    // Find or create conversation for this session
    let conversationId: string

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", property_id)
      .eq("channel", "chat")
      .eq("external_id", session_id)
      .single()

    if (existing) {
      conversationId = existing.id

      // Update conversation to active/unread
      await supabase
        .from("conversations")
        .update({
          status: "open",
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
    } else {
      // Create new conversation
      const contactName = visitor_name || "Visitatore Chat"
      const contactEmail = visitor_email || null

      // Create or find contact
      let contactId: string | null = null
      if (contactEmail) {
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("property_id", property_id)
          .eq("email", contactEmail)
          .single()

        if (existingContact) {
          contactId = existingContact.id
        } else {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({
              property_id,
              email: contactEmail,
              first_name: contactName,
              source: "chat_widget",
            })
            .select("id")
            .single()
          contactId = newContact?.id || null
        }
      }

      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          property_id,
          channel: "chat",
          status: "open",
          subject: `Chat da ${contactName}`,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_id: contactId,
          external_id: session_id,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (!newConv) {
        return NextResponse.json(
          { error: "Errore creazione conversazione" },
          { status: 500 }
        )
      }
      conversationId = newConv.id
    }

    // Save the message
    const { data: savedMessage, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        property_id,
        direction: "inbound",
        channel: "chat",
        content: message,
        content_type: "text",
        sender_name: visitor_name || "Visitatore",
        sender_email: visitor_email || null,
        external_id: `chat-${session_id}-${Date.now()}`,
      })
      .select("id, content, created_at, sender_name")
      .single()

    if (msgError) {
      return NextResponse.json(
        { error: "Errore salvataggio messaggio" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      conversation_id: conversationId,
      message: savedMessage,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}

// GET: Visitor polls for new messages (replies from admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get("conversation_id")
    const afterTimestamp = searchParams.get("after")
    const sessionId = searchParams.get("session_id")
    const propertyId = searchParams.get("property_id")

    if (!conversationId || !sessionId || !propertyId) {
      return NextResponse.json(
        { error: "conversation_id, session_id e property_id obbligatori" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verify conversation belongs to this session
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("external_id", sessionId)
      .eq("property_id", propertyId)
      .single()

    if (!conv) {
      return NextResponse.json(
        { error: "Conversazione non trovata" },
        { status: 404 }
      )
    }

    // Fetch outbound messages (admin replies) after timestamp
    let query = supabase
      .from("messages")
      .select("id, content, created_at, sender_name, direction")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (afterTimestamp) {
      query = query.gt("created_at", afterTimestamp)
    }

    const { data: messages } = await query

    return NextResponse.json({
      messages: messages || [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}
