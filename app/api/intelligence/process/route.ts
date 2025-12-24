// ===========================================
// API: Process Message Intelligence
// Processa un messaggio e salva intelligence in metadata
// ===========================================

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { processMessage, type ConversationState, CONVERSATION_STATES } from "@/lib/conversation-intelligence"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { message_id, conversation_id, content, property_id } = body

    // Validazione
    if (!property_id) {
      return NextResponse.json({ error: "property_id obbligatorio" }, { status: 400 })
    }

    if (!content) {
      return NextResponse.json({ error: "content obbligatorio" }, { status: 400 })
    }

    // Recupera stato attuale conversazione se disponibile
    let currentState: ConversationState | null = null
    const bookingData: { quote_sent?: boolean; confirmed?: boolean } = {}

    if (conversation_id) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("status, booking_data, metadata")
        .eq("id", conversation_id)
        .eq("property_id", property_id)
        .single()

      if (conversation) {
        // Mappa status esistente a ConversationState
        currentState = mapStatusToState(conversation.status)

        // Estrai info booking se presenti
        if (conversation.booking_data) {
          const bd = conversation.booking_data as Record<string, unknown>
          bookingData.quote_sent = !!bd.quote_sent_at
          bookingData.confirmed = bd.outcome === "confirmed"
        }
      }
    }

    // Processa messaggio con Intelligence Engine
    const intelligence = processMessage(content, currentState, bookingData)

    // Salva intelligence nel messaggio se message_id presente
    if (message_id) {
      const { error: msgError } = await supabase
        .from("messages")
        .update({
          metadata: {
            intelligence,
          },
        })
        .eq("id", message_id)
        .eq("property_id", property_id)

      if (msgError) {
        console.error("Errore salvataggio intelligence messaggio:", msgError)
      }
    }

    // Aggiorna stato conversazione se cambiato
    if (conversation_id && intelligence.state.changed) {
      const { error: convError } = await supabase
        .from("conversations")
        .update({
          status: intelligence.state.current,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation_id)
        .eq("property_id", property_id)

      if (convError) {
        console.error("Errore aggiornamento stato conversazione:", convError)
      }

      // Se ci sono dati estratti, aggiorna booking_data
      if (intelligence.extraction.performed && intelligence.extraction.data) {
        const extractedData = intelligence.extraction.data

        const { data: currentConv } = await supabase
          .from("conversations")
          .select("booking_data")
          .eq("id", conversation_id)
          .eq("property_id", property_id)
          .single()

        const existingBookingData = (currentConv?.booking_data || {}) as Record<string, unknown>

        // Merge dati estratti con esistenti (non sovrascrivere se già presenti)
        const updatedBookingData = {
          ...existingBookingData,
          check_in: extractedData.check_in || existingBookingData.check_in,
          check_out: extractedData.check_out || existingBookingData.check_out,
          guests_adults: extractedData.adults || existingBookingData.guests_adults,
          guests_children: extractedData.children || existingBookingData.guests_children,
          room_type: extractedData.room_type || existingBookingData.room_type,
          extracted_at: new Date().toISOString(),
          extraction_source: "intelligence_engine_v1",
        }

        await supabase
          .from("conversations")
          .update({ booking_data: updatedBookingData })
          .eq("id", conversation_id)
          .eq("property_id", property_id)
      }
    }

    return NextResponse.json({
      success: true,
      intelligence,
      state_changed: intelligence.state.changed,
      data_extracted: intelligence.extraction.performed && !!intelligence.extraction.data,
    })
  } catch (error) {
    console.error("Errore processing intelligence:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

/**
 * Mappa lo status esistente del DB al ConversationState
 */
function mapStatusToState(status: string | null): ConversationState | null {
  if (!status) return null

  const mapping: Record<string, ConversationState> = {
    new: CONVERSATION_STATES.NEW,
    open: CONVERSATION_STATES.INQUIRY,
    pending: CONVERSATION_STATES.QUOTE_PENDING,
    in_progress: CONVERSATION_STATES.NEGOTIATING,
    waiting: CONVERSATION_STATES.AWAITING_CONFIRMATION,
    confirmed: CONVERSATION_STATES.CONFIRMED,
    cancelled: CONVERSATION_STATES.CANCELLED,
    closed: CONVERSATION_STATES.RESOLVED,
    spam: CONVERSATION_STATES.SPAM,
  }

  return mapping[status] || null
}
