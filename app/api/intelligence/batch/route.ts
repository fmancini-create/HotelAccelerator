// ===========================================
// API: Batch Process Intelligence
// Processa tutti i messaggi inbound di una conversazione
// ===========================================

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { processMessage, type ConversationState } from "@/lib/conversation-intelligence"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { conversation_id, property_id } = body

    // Validazione
    if (!property_id) {
      return NextResponse.json({ error: "property_id obbligatorio" }, { status: 400 })
    }

    if (!conversation_id) {
      return NextResponse.json({ error: "conversation_id obbligatorio" }, { status: 400 })
    }

    // Recupera tutti i messaggi inbound della conversazione
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, content, sender_type, created_at, metadata")
      .eq("conversation_id", conversation_id)
      .eq("property_id", property_id)
      .order("created_at", { ascending: true })

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 })
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "Nessun messaggio da processare",
      })
    }

    // Recupera conversazione per stato iniziale
    const { data: conversation } = await supabase
      .from("conversations")
      .select("status, booking_data")
      .eq("id", conversation_id)
      .eq("property_id", property_id)
      .single()

    let currentState: ConversationState | null = null
    const bookingData: { quote_sent?: boolean; confirmed?: boolean } = {}

    if (conversation?.booking_data) {
      const bd = conversation.booking_data as Record<string, unknown>
      bookingData.quote_sent = !!bd.quote_sent_at
      bookingData.confirmed = bd.outcome === "confirmed"
    }

    // Processa solo messaggi inbound (customer)
    const inboundMessages = messages.filter((m) => m.sender_type === "customer")
    let processed = 0
    let lastIntelligence = null

    for (const message of inboundMessages) {
      // Skip se già processato
      const existingMetadata = message.metadata as Record<string, unknown> | null
      if (existingMetadata?.intelligence) {
        continue
      }

      // Processa messaggio
      const intelligence = processMessage(message.content, currentState, bookingData)

      // Aggiorna stato per prossimo messaggio
      if (intelligence.state.changed) {
        currentState = intelligence.state.current
      }

      // Salva intelligence nel messaggio
      const { error: updateError } = await supabase
        .from("messages")
        .update({
          metadata: {
            ...existingMetadata,
            intelligence,
          },
        })
        .eq("id", message.id)
        .eq("property_id", property_id)

      if (!updateError) {
        processed++
        lastIntelligence = intelligence
      }
    }

    // Aggiorna stato finale conversazione
    if (lastIntelligence && lastIntelligence.state.changed) {
      await supabase
        .from("conversations")
        .update({
          status: lastIntelligence.state.current,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation_id)
        .eq("property_id", property_id)
    }

    return NextResponse.json({
      success: true,
      processed,
      total_messages: messages.length,
      inbound_messages: inboundMessages.length,
      final_state: lastIntelligence?.state.current || currentState,
    })
  } catch (error) {
    console.error("Errore batch processing:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
