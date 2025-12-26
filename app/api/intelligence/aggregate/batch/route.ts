// ===========================================
// API: Batch aggregate per multiple conversazioni
// POST /api/intelligence/aggregate/batch
// ===========================================

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { aggregateIntelligence } from "@/lib/conversation-intelligence-aggregator"
import { getAuthenticatedPropertyIdWithSuperAdminOverride } from "@/lib/auth-property"

export async function POST(request: NextRequest) {
  try {
    const effectivePropertyId = await getAuthenticatedPropertyIdWithSuperAdminOverride(request)

    const body = await request.json()
    const { max_messages_per_conversation = 20, limit = 50, only_missing = true } = body

    const supabase = await createClient()

    const query = supabase
      .from("conversations")
      .select("id, created_at, metadata")
      .eq("property_id", effectivePropertyId)
      .order("updated_at", { ascending: false })
      .limit(limit)

    const { data: conversations, error: convError } = await query

    if (convError) {
      console.error("Error fetching conversations:", convError)
      return NextResponse.json({ error: "Errore recupero conversazioni" }, { status: 500 })
    }

    const toProcess = only_missing
      ? conversations?.filter((c) => !c.metadata?.intelligence_summary) || []
      : conversations || []

    const results: Array<{
      conversation_id: string
      success: boolean
      error?: string
    }> = []

    for (const conv of toProcess) {
      try {
        const { data: messages, error: msgError } = await supabase
          .from("messages")
          .select("id, content, sender_type, created_at, metadata")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(max_messages_per_conversation)

        if (msgError) {
          results.push({
            conversation_id: conv.id,
            success: false,
            error: msgError.message,
          })
          continue
        }

        const summary = aggregateIntelligence(messages || [], conv.created_at)

        const updatedMetadata = {
          ...(conv.metadata || {}),
          intelligence_summary: summary,
        }

        const { error: updateError } = await supabase
          .from("conversations")
          .update({ metadata: updatedMetadata })
          .eq("id", conv.id)
          .eq("property_id", effectivePropertyId)

        if (updateError) {
          results.push({
            conversation_id: conv.id,
            success: false,
            error: updateError.message,
          })
        } else {
          results.push({
            conversation_id: conv.id,
            success: true,
          })
        }
      } catch (err) {
        results.push({
          conversation_id: conv.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return NextResponse.json({
      processed: results.length,
      successful,
      failed,
      skipped: (conversations?.length || 0) - toProcess.length,
      results,
    })
  } catch (error) {
    console.error("Error in batch aggregate:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
