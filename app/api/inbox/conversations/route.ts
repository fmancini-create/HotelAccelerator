import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getPropertyId, withPropertyId } from "@/lib/tenant"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const propertyId = getPropertyId(request)

    const status = searchParams.get("status") || "open"
    const channel = searchParams.get("channel")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const { error: tableCheckError } = await supabase.from("conversations").select("id").limit(1)

    if (tableCheckError) {
      console.error("[v0] Conversations table error:", tableCheckError.message)
      return NextResponse.json({
        conversations: [],
        error: "Sistema messaggistica non configurato. Esegui lo script SQL.",
      })
    }

    let query = supabase
      .from("conversations")
      .select(`
        *,
        contact:contacts(*),
        assigned:admin_users(id, name, email)
      `)
      .eq("property_id", propertyId)
      .order("last_message_at", { ascending: false })
      .limit(limit)

    if (status !== "all") {
      query = query.eq("status", status)
    }

    if (channel && channel !== "all") {
      query = query.eq("channel", channel)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error loading conversations:", error)
      return NextResponse.json({ error: error.message, conversations: [] })
    }

    // Get last message for each conversation separately
    const conversationsWithLastMessage = await Promise.all(
      (data || []).map(async (conv) => {
        const { data: messages } = await supabase
          .from("messages")
          .select("id, content, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(1)

        return {
          ...conv,
          lastMessage: messages?.[0] || null,
        }
      }),
    )

    return NextResponse.json({ conversations: conversationsWithLastMessage })
  } catch (error) {
    console.error("[v0] Unexpected error:", error)
    return NextResponse.json({
      conversations: [],
      error: "Errore nel caricamento delle conversazioni",
    })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const propertyId = getPropertyId(request, body)

  const { channel, contact_id, subject, metadata } = body

  let contactId = contact_id

  if (!contactId && body.contact) {
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .or(`email.eq.${body.contact.email},phone.eq.${body.contact.phone}`)
      .single()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert(withPropertyId(body.contact, propertyId))
        .select()
        .single()

      if (contactError) {
        return NextResponse.json({ error: contactError.message }, { status: 500 })
      }
      contactId = newContact.id
    }
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert(
      withPropertyId(
        {
          channel,
          contact_id: contactId,
          subject,
          metadata: metadata || {},
        },
        propertyId,
      ),
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversation })
}
