import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { SUITE_SSO_CONFIG } from "@/lib/suite-sso/config"
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
  return {
    url: `${SUITE_SSO_CONFIG[product].baseUrl.replace(/\/$/, "")}/api/integrations/support/v1/reply`,
    key: product === "santaddeo"
      ? process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim()
      : process.env.CUSTOMER_CODE_REGISTRY_KEY_HPA?.trim(),
  }
}

function callbackHeaders(product: "santaddeo" | "hotelprofitai", staticKey?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  // HotelProfitAI validates the short-lived Vercel workload identity of this
  // exact HotelAccelerator project. The static registry key remains recovery
  // auth only; production must not depend on manually mirroring a secret.
  if (product === "hotelprofitai") {
    const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim()
    if (oidcToken) headers.Authorization = `Bearer ${oidcToken}`
    if (!oidcToken && staticKey) headers["X-4BID-Registry-Key"] = staticKey
    return headers
  }

  if (staticKey) headers["X-4BID-Registry-Key"] = staticKey
  return headers
}

export async function sendFederatedSupportReply(input: {
  conversationId: string
  propertyId: string
  content: string
  actorName: string
  actorId?: string | null
}) {
  const supabase = createServiceClient()
  const { data: property } = await supabase.from("properties").select("slug, type").eq("id", input.propertyId).maybeSingle()
  if (!property || property.slug !== CENTRAL_SUPPORT_SLUG || property.type !== "company") return null

  const { data: conversation, error } = await supabase.from("conversations").select("id, metadata").eq("id", input.conversationId).eq("property_id", input.propertyId).maybeSingle()
  if (error || !conversation) return null

  const metadata = conversation.metadata?.support_federation as SupportMetadata | undefined
  if (!metadata?.product_key || !metadata.external_thread_id || !metadata.external_tenant_id || !metadata.kind) return null

  const now = new Date().toISOString()
  const replyId = randomUUID()
  let sourceMessageId = replyId

  if (metadata.product_key !== "hotelaccelerator") {
    const config = callbackConfig(metadata.product_key)
    const headers = callbackHeaders(metadata.product_key, config.key)
    if (!headers.Authorization && !headers["X-4BID-Registry-Key"]) {
      throw new Error(`support_callback_not_configured:${metadata.product_key}`)
    }

    const body = metadata.product_key === "hotelprofitai"
      ? {
          reply_id: replyId,
          tenant_ref: metadata.external_tenant_id,
          thread_id: metadata.external_thread_id,
          kind: metadata.kind,
          content: input.content,
          actor_name: input.actorName,
        }
      : {
          tenant_ref: metadata.external_tenant_id,
          thread_id: metadata.external_thread_id,
          kind: metadata.kind,
          content: input.content,
          actor_name: input.actorName,
        }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    const payload = await response.json().catch(() => ({})) as { message?: { id?: string } }
    if (!response.ok) throw new Error(`support_callback_failed:${metadata.product_key}:${response.status}`)
    if (payload.message?.id) sourceMessageId = payload.message.id
  }

  const externalMessageId = `suite-support:${metadata.product_key}:${metadata.external_thread_id}:${sourceMessageId}`
  const messageId = deterministicUuid(`message:${externalMessageId}`)
  const { data: message, error: insertError } = await supabase.from("messages").upsert({
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
    metadata: { support_federation: { product_key: metadata.product_key, external_thread_id: metadata.external_thread_id, external_message_id: sourceMessageId, sender: "agent" } },
  }, { onConflict: "id" }).select("*").single()
  if (insertError) throw insertError

  await supabase.from("conversations").update({ last_message_at: now, updated_at: now, unread_count: 0 }).eq("id", input.conversationId).eq("property_id", input.propertyId)
  return message
}
