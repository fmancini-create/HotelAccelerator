// ===========================================
// API: Aggrega intelligence per conversazione
// POST /api/intelligence/aggregate
// ===========================================

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { aggregateIntelligence, type IntelligenceSummary } from "@/lib/conversation-intelligence-aggregator"
import { DEFAULT_PROPERTY_ID, getPropertyId } from "@/lib/tenant"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversation_id, property_id, max_messages = 20 } = body

    if (!conversation_id) {
      return NextResponse.json({ error: "conversation_id richiesto" }, { status: 400 })
    }

    const effectivePropertyId = property_id || getPropertyId(request, body)
    const supabase = await createClient()

    // Recupera conversazione
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, created_at, metadata")
      .eq("id", conversation_id)
      .eq("property_id", effectivePropertyId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 })
    }

    // Recupera ultimi N messaggi con intelligence
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, content, sender_type, created_at, metadata")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(max_messages)

    if (msgError) {
      console.error("Error fetching messages:", msgError)
      return NextResponse.json({ error: "Errore recupero messaggi" }, { status: 500 })
    }

    // Aggrega intelligence
    const summary = aggregateIntelligence(messages || [], conversation.created_at)

    // Salva in conversation.metadata.intelligence_summary
    const updatedMetadata = {
      ...(conversation.metadata || {}),
      intelligence_summary: summary,
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ metadata: updatedMetadata })
      .eq("id", conversation_id)
      .eq("property_id", effectivePropertyId)

    if (updateError) {
      console.error("Error updating conversation:", updateError)
      return NextResponse.json({ error: "Errore salvataggio summary" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      conversation_id,
      summary,
    })
  } catch (error) {
    console.error("Error in aggregate:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

/**
 * GET - Recupera summary esistente senza ricalcolare
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversation_id = searchParams.get("conversation_id")
    const property_id = searchParams.get("property_id") || DEFAULT_PROPERTY_ID

    if (!conversation_id) {
      return NextResponse.json({ error: "conversation_id richiesto" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id, metadata")
      .eq("id", conversation_id)
      .eq("property_id", property_id)
      .single()

    if (error || !conversation) {
      return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 })
    }

    const summary = conversation.metadata?.intelligence_summary as IntelligenceSummary | undefined

    return NextResponse.json({
      conversation_id,
      summary: summary || null,
      has_summary: !!summary,
    })
  } catch (error) {
    console.error("Error in get summary:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
