import "server-only"

import { createHash } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { findCustomerProductCode, resolveExternalTenantCode } from "@/lib/customer-codes/registry"
import type { SuiteProductKey } from "@/lib/customer-codes/product"
import { CENTRAL_SUPPORT_SLUG } from "@/lib/telephony/voice-support"

export type SupportFederationProduct = Extract<SuiteProductKey, "santaddeo" | "hotelprofitai">
export type SupportFederationKind = "human_support" | "suggestion" | "bug"
export type SupportFederationSender = "customer" | "agent" | "system"

export interface FederatedSupportMessage {
  id: string
  sender: SupportFederationSender
  content: string
  created_at?: string | null
  sender_name?: string | null
}

export interface FederatedSupportSnapshot {
  product: SupportFederationProduct
  tenantRef: string
  threadId: string
  title: string
  kind: SupportFederationKind
  status?: "open" | "closed"
  sourcePath?: string | null
  messages: FederatedSupportMessage[]
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const raw = hex.join("")
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

async function getCentralSupportPropertyId() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("properties").select("id, type, is_active").eq("slug", CENTRAL_SUPPORT_SLUG).maybeSingle()
  if (error) throw error
  if (!data || data.type !== "company" || data.is_active === false) throw new Error("central_support_hub_unavailable")
  return data.id as string
}

export async function projectFederatedSupport(snapshot: FederatedSupportSnapshot) {
  const code = await resolveExternalTenantCode({ productKey: snapshot.product, externalTenantId: snapshot.tenantRef })
  if (!code) return { ok: false as const, error: "tenant_not_linked" as const }
  const linked = await findCustomerProductCode(code.code, snapshot.product)

  const hubPropertyId = await getCentralSupportPropertyId()
  const supabase = createServiceClient()
  const externalThreadId = `suite-support:${snapshot.product}:${snapshot.threadId}`
  const conversationId = deterministicUuid(`conversation:${externalThreadId}`)
  const now = new Date().toISOString()
  const lastMessageAt = snapshot.messages.map((message) => message.created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? now

  const { data: existingConversation } = await supabase.from("conversations").select("unread_count").eq("id", conversationId).eq("property_id", hubPropertyId).maybeSingle()
  const incomingMessageIds = snapshot.messages.map((message) => deterministicUuid(`message:suite-support:${snapshot.product}:${snapshot.threadId}:${message.id}`))
  const { data: existingMessages } = incomingMessageIds.length > 0
    ? await supabase.from("messages").select("id").in("id", incomingMessageIds)
    : { data: [] as Array<{ id: string }> }
  const existingIds = new Set((existingMessages ?? []).map((row) => row.id))
  const newlyArrivedCustomerMessages = snapshot.messages.filter((message, index) => message.sender === "customer" && !existingIds.has(incomingMessageIds[index])).length

  const metadata = {
    support_federation: {
      version: 1,
      product_key: snapshot.product,
      external_tenant_id: snapshot.tenantRef,
      external_thread_id: snapshot.threadId,
      customer_property_id: linked?.propertyId ?? null,
      customer_code: code.code,
      kind: snapshot.kind,
      source_path: snapshot.sourcePath ?? null,
    },
  }

  const nextUnread = Math.max(0, Number(existingConversation?.unread_count || 0) + newlyArrivedCustomerMessages)
  const { error: conversationError } = await supabase.from("conversations").upsert({
    id: conversationId,
    property_id: hubPropertyId,
    channel: "chat",
    status: snapshot.status === "closed" ? "closed" : "open",
    subject: `[${snapshot.product === "santaddeo" ? "Santaddeo" : "HotelProfitAI"}] ${snapshot.title}`.slice(0, 240),
    external_thread_id: externalThreadId,
    contact_name: code.code,
    last_message_at: lastMessageAt,
    unread_count: nextUnread,
    updated_at: now,
    metadata,
  }, { onConflict: "id" })
  if (conversationError) throw conversationError

  for (const message of snapshot.messages) {
    const externalMessageId = `suite-support:${snapshot.product}:${snapshot.threadId}:${message.id}`
    const messageId = deterministicUuid(`message:${externalMessageId}`)
    const createdAt = message.created_at || now
    const { error: messageError } = await supabase.from("messages").upsert({
      id: messageId,
      conversation_id: conversationId,
      property_id: hubPropertyId,
      sender_type: message.sender === "customer" ? "contact" : message.sender,
      sender_id: null,
      sender_name: message.sender_name ?? null,
      content: message.content,
      content_type: "text",
      external_message_id: externalMessageId,
      created_at: createdAt,
      received_at: createdAt,
      stored_at: now,
      status: "delivered",
      metadata: { support_federation: { product_key: snapshot.product, external_thread_id: snapshot.threadId, external_message_id: message.id, sender: message.sender } },
    }, { onConflict: "id" })
    if (messageError) throw messageError
  }

  return { ok: true as const, conversationId, customerCode: code.code }
}

export async function createHotelAcceleratorSupportReport(input: {
  customerPropertyId: string
  customerCode?: string | null
  kind: "suggestion" | "bug"
  title: string
  description: string
  currentPath?: string | null
  actorName?: string | null
  actorEmail?: string | null
}) {
  const hubPropertyId = await getCentralSupportPropertyId()
  const supabase = createServiceClient()
  const seed = `${input.customerPropertyId}:${input.kind}:${Date.now()}:${input.description}`
  const threadId = deterministicUuid(`ha-report:${seed}`)
  const conversationId = deterministicUuid(`conversation:hotelaccelerator:${threadId}`)
  const messageId = deterministicUuid(`message:hotelaccelerator:${threadId}:initial`)
  const now = new Date().toISOString()
  const customerCode = input.customerCode || input.customerPropertyId
  const metadata = { support_federation: { version: 1, product_key: "hotelaccelerator", external_tenant_id: input.customerPropertyId, external_thread_id: threadId, customer_property_id: input.customerPropertyId, customer_code: customerCode, kind: input.kind, source_path: input.currentPath ?? null } }

  const { error: conversationError } = await supabase.from("conversations").insert({
    id: conversationId,
    property_id: hubPropertyId,
    channel: "chat",
    status: "open",
    subject: `[HotelAccelerator] ${input.kind === "bug" ? "Errore" : "Miglioria"}: ${input.title}`.slice(0, 240),
    external_thread_id: `suite-support:hotelaccelerator:${threadId}`,
    contact_name: customerCode,
    last_message_at: now,
    unread_count: 1,
    metadata,
  })
  if (conversationError) throw conversationError

  const context = [input.currentPath ? `Pagina: ${input.currentPath}` : null, input.actorName || input.actorEmail ? `Segnalato da: ${input.actorName || input.actorEmail}` : null, input.description].filter(Boolean).join("\n\n")
  const { error: messageError } = await supabase.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    property_id: hubPropertyId,
    sender_type: "contact",
    sender_name: input.actorName || input.actorEmail || customerCode,
    content: context,
    content_type: "text",
    external_message_id: `suite-support:hotelaccelerator:${threadId}:initial`,
    created_at: now,
    received_at: now,
    stored_at: now,
    status: "delivered",
    metadata: { support_federation: { product_key: "hotelaccelerator", kind: input.kind } },
  })
  if (messageError) throw messageError
  return { conversationId }
}
