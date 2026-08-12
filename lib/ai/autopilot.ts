import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateReply, type ConversationTurn } from "./generate"
import { getBasesForChannel } from "./knowledge-bases"

export type AiChannel = "telegram" | "whatsapp" | "email"

export interface RunAutopilotArgs {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  /** Channel type, used only for message metadata/logging. */
  channel: AiChannel
  /** The specific messaging_channels row id — drives which knowledge bases are used. */
  channelId: string
  incomingText: string
  /**
   * Delivers the reply on the channel. Only invoked in `autopilot` mode.
   * Should return the provider message id when available (for idempotency).
   */
  send?: (text: string) => Promise<{ externalId?: string } | void>
}

export type AutopilotAction = "sent" | "draft" | "skipped"

export interface RunAutopilotResult {
  action: AutopilotAction
  reason?: string
  messageId?: string
  confidence?: number
}

/**
 * Single source of truth for AI replies across every channel.
 *
 * Behavior is driven by the knowledge bases linked to the channel. The primary
 * base (position 0) sets the mode:
 *   - mode 'disabled'  -> never acts
 *   - mode 'on_request'-> saves a DRAFT reply for an operator to approve
 *   - mode 'autopilot' -> sends the reply automatically (via `send`) and logs it
 *
 * When the knowledge base has no confident answer, it deliberately does
 * nothing (skipped) rather than inventing a reply.
 */
export async function runAutopilot(args: RunAutopilotArgs): Promise<RunAutopilotResult> {
  const { supabase, propertyId, conversationId, channel, channelId, incomingText, send } = args

  if (!incomingText?.trim()) {
    return { action: "skipped", reason: "empty_message" }
  }

  // Resolve the knowledge bases linked to this specific channel. The primary
  // base (position 0) drives behavior; retrieval spans all linked bases.
  const { primary, baseIds } = await getBasesForChannel(channelId)
  if (!primary || baseIds.length === 0) {
    return { action: "skipped", reason: "no_base_linked" }
  }
  const mode = primary.mode
  if (mode === "disabled") {
    return { action: "skipped", reason: "base_disabled" }
  }

  const history = await loadHistory(supabase, conversationId, propertyId)

  const result = await generateReply(
    {
      baseIds,
      persona: primary.persona,
      language: primary.language,
      confidenceThreshold: primary.confidence_threshold,
    },
    incomingText,
    history,
  )

  if (!result.answer) {
    return { action: "skipped", reason: result.reason ?? "no_answer", confidence: result.confidence }
  }

  const baseMetadata = {
    channel,
    ai_generated: true,
    ai_confidence: result.confidence,
    ai_source_ids: result.usedChunks.map((c) => c.source_id),
    ai_knowledge_base_id: primary.id,
  }

  // ON REQUEST: store a draft for operator approval; do not deliver.
  if (mode === "on_request") {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        content: result.answer,
        content_type: "text",
        status: "draft",
        stored_at: new Date().toISOString(),
        metadata: { ...baseMetadata, ai_draft: true },
      })
      .select("id")
      .single()

    if (error) {
      console.log(`[v0] autopilot draft insert error: ${error.message}`)
      return { action: "skipped", reason: "draft_insert_failed" }
    }
    return { action: "draft", messageId: data.id, confidence: result.confidence }
  }

  // AUTOPILOT: deliver, then persist as a sent agent message.
  if (mode === "autopilot") {
    if (!send) return { action: "skipped", reason: "no_sender" }
    let externalId: string | undefined
    try {
      const sendResult = await send(result.answer)
      externalId = sendResult?.externalId
    } catch (err) {
      console.log(`[v0] autopilot send failed: ${err instanceof Error ? err.message : String(err)}`)
      return { action: "skipped", reason: "send_failed" }
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        content: result.answer,
        content_type: "text",
        status: "sent",
        external_message_id: externalId ?? null,
        stored_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        metadata: { ...baseMetadata, ai_autopilot: true },
      })
      .select("id")
      .single()

    if (!error) {
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("property_id", propertyId)
    } else {
      console.log(`[v0] autopilot sent-log insert error: ${error.message}`)
    }

    return { action: "sent", messageId: data?.id, confidence: result.confidence }
  }

  return { action: "skipped", reason: "unknown_mode" }
}

/**
 * Load recent conversation turns (customer + delivered agent replies) as
 * chat history for grounding. Drafts and system messages are excluded.
 */
async function loadHistory(
  supabase: SupabaseClient,
  conversationId: string,
  propertyId: string,
): Promise<ConversationTurn[]> {
  const { data } = await supabase
    .from("messages")
    .select("sender_type, content, status, stored_at")
    .eq("conversation_id", conversationId)
    .eq("property_id", propertyId)
    .in("sender_type", ["customer", "agent"])
    .neq("status", "draft")
    .order("stored_at", { ascending: true })
    .limit(20)

  if (!data) return []
  return data
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.sender_type === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.content as string,
    }))
}
