import "server-only"

import { createHash } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { findCustomerProductCode, resolveExternalTenantCode } from "@/lib/customer-codes/registry"
import type { SuiteProductKey } from "@/lib/customer-codes/product"
import { CENTRAL_SUPPORT_SLUG } from "@/lib/telephony/voice-support"
import {
  preserveInboxUnreadCount,
  toInboxConversationStatus,
  toInboxSenderType,
  type SupportFederationSender,
} from "@/lib/support-federation/contract"
import {
  copyFederatedSupportAttachments,
  supportMessageHtml,
  type FederatedSupportAttachment,
  type StoredSupportAttachment,
} from "@/lib/support-attachments"

export type SupportFederationProduct = Extract<SuiteProductKey, "santaddeo" | "hotelprofitai">
export type SupportFederationKind = "human_support" | "suggestion" | "bug"

export interface FederatedSupportReporter {
  user_id?: string | null
  name?: string | null
  email?: string | null
}

export interface FederatedSupportMessage {
  id: string
  sender: SupportFederationSender
  content: string
  created_at?: string | null
  sender_name?: string | null
  sender_email?: string | null
  attachments?: FederatedSupportAttachment[]
}

export interface FederatedSupportSnapshot {
  product: SupportFederationProduct
  tenantRef: string
  threadId: string
  title: string
  kind: SupportFederationKind
  status?: "open" | "closed"
  sourcePath?: string | null
  reporter?: FederatedSupportReporter | null
  messages: FederatedSupportMessage[]
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const raw = hex.join("")
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

function databaseWriteError(stage: string, error: { code?: string | null } | null) {
  const code = typeof error?.code === "string" && error.code.trim() ? error.code.trim().slice(0, 32) : "unknown"
  return new Error(`${stage}:${code}`)
}

async function getCentralSupportPropertyId() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("properties").select("id, type, is_active").eq("slug", CENTRAL_SUPPORT_SLUG).maybeSingle()
  if (error) throw databaseWriteError("support_hub_read_failed", error)
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

  const metadata = {
    support_federation: {
      version: 2,
      product_key: snapshot.product,
      external_tenant_id: snapshot.tenantRef,
      external_thread_id: snapshot.threadId,
      customer_property_id: linked?.propertyId ?? null,
      customer_code: code.code,
      kind: snapshot.kind,
      source_path: snapshot.sourcePath ?? null,
      reporter_user_id: snapshot.reporter?.user_id ?? null,
      reporter_name: snapshot.reporter?.name ?? null,
      reporter_email: snapshot.reporter?.email ?? null,
    },
  }

  const { error: conversationError } = await supabase.from("conversations").upsert({
    id: conversationId,
    property_id: hubPropertyId,
    channel: "chat",
    status: toInboxConversationStatus(snapshot.status),
    subject: `[${snapshot.product === "santaddeo" ? "Santaddeo" : "HotelProfitAI"}] ${snapshot.title}`.slice(0, 240),
    external_thread_id: externalThreadId,
    contact_name: snapshot.reporter?.name || snapshot.reporter?.email || code.code,
    last_message_at: lastMessageAt,
    unread_count: preserveInboxUnreadCount(existingConversation?.unread_count),
    updated_at: now,
    metadata,
  }, { onConflict: "id" })
  if (conversationError) throw databaseWriteError("conversation_upsert_failed", conversationError)

  for (const message of snapshot.messages) {
    const externalMessageId = `suite-support:${snapshot.product}:${snapshot.threadId}:${message.id}`
    const messageId = deterministicUuid(`message:${externalMessageId}`)
    const createdAt = message.created_at || now
    const storedAttachments = await copyFederatedSupportAttachments({
      attachments: message.attachments ?? [],
      hubPropertyId,
      product: snapshot.product,
      tenantRef: snapshot.tenantRef,
      threadId: snapshot.threadId,
      messageId: message.id,
    })
    const useRichSupportBody = snapshot.kind === "bug" || snapshot.kind === "suggestion" || storedAttachments.length > 0
    const reporterName = message.sender === "customer" ? snapshot.reporter?.name || message.sender_name : null
    const reporterEmail = message.sender === "customer" ? snapshot.reporter?.email || message.sender_email : null
    const content = useRichSupportBody
      ? supportMessageHtml({
          content: message.content,
          reporterName,
          reporterEmail,
          sourcePath: message.sender === "customer" ? snapshot.sourcePath : null,
          conversationId,
          messageId,
          attachments: storedAttachments,
        })
      : message.content

    const { error: messageError } = await supabase.from("messages").upsert({
      id: messageId,
      conversation_id: conversationId,
      property_id: hubPropertyId,
      sender_type: toInboxSenderType(message.sender),
      sender_id: null,
      sender_name: message.sender_name ?? snapshot.reporter?.name ?? null,
      content,
      content_type: useRichSupportBody ? "html" : "text",
      attachments: storedAttachments,
      external_message_id: externalMessageId,
      created_at: createdAt,
      received_at: createdAt,
      stored_at: now,
      status: "delivered",
      metadata: {
        support_federation: {
          product_key: snapshot.product,
          external_thread_id: snapshot.threadId,
          external_message_id: message.id,
          sender: message.sender,
          source_path: snapshot.sourcePath ?? null,
          reporter_user_id: snapshot.reporter?.user_id ?? null,
          reporter_name: snapshot.reporter?.name ?? null,
          reporter_email: snapshot.reporter?.email ?? null,
        },
      },
    }, { onConflict: "id" })
    if (messageError) throw databaseWriteError("message_upsert_failed", messageError)
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
  actorUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
  attachments?: StoredSupportAttachment[]
}) {
  const hubPropertyId = await getCentralSupportPropertyId()
  const supabase = createServiceClient()
  const seed = `${input.customerPropertyId}:${input.kind}:${Date.now()}:${input.description}`
  const threadId = deterministicUuid(`ha-report:${seed}`)
  const conversationId = deterministicUuid(`conversation:hotelaccelerator:${threadId}`)
  const messageId = deterministicUuid(`message:hotelaccelerator:${threadId}:initial`)
  const now = new Date().toISOString()
  const customerCode = input.customerCode || input.customerPropertyId
  const attachments = input.attachments ?? []
  const metadata = {
    support_federation: {
      version: 2,
      product_key: "hotelaccelerator",
      external_tenant_id: input.customerPropertyId,
      external_thread_id: threadId,
      customer_property_id: input.customerPropertyId,
      customer_code: customerCode,
      kind: input.kind,
      source_path: input.currentPath ?? null,
      reporter_user_id: input.actorUserId ?? null,
      reporter_name: input.actorName ?? null,
      reporter_email: input.actorEmail ?? null,
    },
  }

  const { error: conversationError } = await supabase.from("conversations").insert({
    id: conversationId,
    property_id: hubPropertyId,
    channel: "chat",
    status: "open",
    subject: `[HotelAccelerator] ${input.kind === "bug" ? "Errore" : "Miglioria"}: ${input.title}`.slice(0, 240),
    external_thread_id: `suite-support:hotelaccelerator:${threadId}`,
    contact_name: input.actorName || input.actorEmail || customerCode,
    last_message_at: now,
    unread_count: 0,
    metadata,
  })
  if (conversationError) throw databaseWriteError("conversation_insert_failed", conversationError)

  const content = supportMessageHtml({
    content: input.description,
    reporterName: input.actorName,
    reporterEmail: input.actorEmail,
    sourcePath: input.currentPath,
    conversationId,
    messageId,
    attachments,
  })
  const { error: messageError } = await supabase.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    property_id: hubPropertyId,
    sender_type: toInboxSenderType("customer"),
    sender_name: input.actorName || input.actorEmail || customerCode,
    content,
    content_type: "html",
    attachments,
    external_message_id: `suite-support:hotelaccelerator:${threadId}:initial`,
    created_at: now,
    received_at: now,
    stored_at: now,
    status: "delivered",
    metadata: { support_federation: metadata.support_federation },
  })
  if (messageError) throw databaseWriteError("message_insert_failed", messageError)
  return { conversationId, messageId }
}
