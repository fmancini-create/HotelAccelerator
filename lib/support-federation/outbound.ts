import "server-only"

import { createHash } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { CENTRAL_SUPPORT_SLUG } from "@/lib/telephony/voice-support"

interface SupportMetadata {
  product_key: "hotelaccelerator" | "santaddeo" | "hotelprofitai"
  external_tenant_id: string
  external_thread_id: string
  kind: "human_support" | "suggestion" | "bug"
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const raw = hex.join("")
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

function callbackConfig(product: "santaddeo" | "hotelprofitai") {
  if (product === "santaddeo") {
    return {
      url: "https://www.santaddeo.com/api/integrations/support/v1/reply",
      key: process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim(),
    }
  }
  return {
    url: "https://www.hotelprofitai.com/api/integrations/support/v1/reply",
    key: process.env.CUSTOMER_CODE_REGISTRY_KEY_HPA?.trim(),
  }
}

export async function sendFederatedSupportReply(input: {
  conversationId: string
  propertyId: string
  content: string
  actorName: string
  actorId?: string | null
}) {
  const supabase = createServiceClient()
  const { data: property } = await supabase
    .from("properties")
    .select("slug, type")
    .eq("id", input.propertyId)
    .maybeSingle()
  if (!property || property.slug !== CENTRAL_SUPPORT_SLUG || property.type !== "company") return null

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, metadata")
    .eq("id", input.conversationId)
    .eq("property_id", input.propertyId)
    .maybeSingle()
  if (error || !conversation) return null

  const metadata = conversation.metadata?.support_federation as SupportMetadata | undefined
  if (!metadata?.product_key || !metadata.external_thread_id || !metadata.external_tenant_id || !metadata.kind) return null

  const now = new Date().toISOString()
  let sourceMessageId = `hotelaccelerator-reply:${now}`

  if (metadata.product_key !== "hotelaccelerator") {
    const config = callbackConfig(metadata.product_key)
    if (!config.key) throw new Error(`support_callback_not_configured:${metadata.product_key}`)

    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-4BID-Registry-Key": config.key,
      },
      body: JSON.stringify({
        tenant_ref: metadata.external_tenant_id,
        thread_id: metadata.external_thread_id,
        kind: metadata.kind,
        content: input.content,
        actor_name: input.actorName,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const payload = await response.json().catch(() => ({})) as { message?: { id?: string; created_at?: string } }
    if (!response.ok) throw new Error(`support_callback_failed:${metadata.product_key}:${response.status}`)
    if (payload.message?.id) sourceMessageId = payload.message.id
  }

  const externalMessageId = `suite-support:${metadata.product_key}:${metadata.external_thread_id}:${sourceMessageId}`
  const messageId = deterministicUuid(`message:${externalMessageId}`)
  const { data: message, error: insertError } = await supabase
    .from("messages")
    .upsert({
      id: messageId,
      conversation_id: input.conversationId,
      property_id: input.propertyId,
      sender_type: "agent",
      sender_id: input.actorId || null,
      sender_name: input.actorName,
      content: input.content,
      content_type: "text",
      external_message_id: externalMessageId,
      created_at: now,
      delivered_at: now,
      stored_at: now,
      status: "delivered",
      metadata: {
        support_federation: {
          product_key: metadata.product_key,
          external_thread_id: metadata.external_thread_id,
          external_message_id: sourceMessageId,
          sender: "agent",
        },
      },
    }, { onConflict: "id" })
    .select("*")
    .single()
  if (insertError) throw insertError

  await supabase.from("conversations").update({
    last_message_at: now,
    updated_at: now,
    unread_count: 0,
  }).eq("id", input.conversationId).eq("property_id", input.propertyId)

  return message
}
