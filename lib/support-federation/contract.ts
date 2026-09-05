import { z } from "zod"

// v1 wire-contract limits. Keep these values stable for the lifetime of v1;
// storage/UI limits may only diverge through an explicit contract version change.
const SUPPORT_V1_ATTACHMENT_MAX_FILES = 5
const SUPPORT_V1_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const attachmentSchema = z.object({
  id: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(160),
  size_bytes: z.number().int().positive().max(SUPPORT_V1_ATTACHMENT_MAX_BYTES),
  source_url: z.string().url().max(3000),
})

export const supportFederationSenderSchema = z.enum(["customer", "agent", "system"])
export type SupportFederationSender = z.infer<typeof supportFederationSenderSchema>

export function toInboxSenderType(sender: SupportFederationSender): SupportFederationSender {
  return sender
}

export function toInboxConversationStatus(status?: "open" | "closed"): "open" | "resolved" {
  return status === "closed" ? "resolved" : "open"
}

// public.update_conversation_on_message() is the single owner of unread +1 for
// newly inserted customer messages. The federation must only preserve the
// current value while upserting the parent conversation.
export function preserveInboxUnreadCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

export const federatedSupportProjectionSchema = z.object({
  tenant_ref: z.string().trim().min(1).max(160),
  thread_id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(240),
  kind: z.enum(["human_support", "suggestion", "bug"]),
  status: z.enum(["open", "closed"]).optional(),
  source_path: z.string().trim().max(500).nullable().optional(),
  reporter: z.object({
    user_id: z.string().trim().max(200).nullable().optional(),
    name: z.string().trim().max(200).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
  }).nullable().optional(),
  messages: z.array(z.object({
    id: z.string().trim().min(1).max(240),
    sender: supportFederationSenderSchema,
    content: z.string().min(1).max(50000),
    // Supabase/PostgREST serializes timestamptz values with an explicit offset
    // (for example +00:00). RFC3339 permits both offsets and Z, so the suite
    // contract must accept both representations.
    created_at: z.string().datetime({ offset: true }).nullable().optional(),
    sender_name: z.string().trim().max(160).nullable().optional(),
    sender_email: z.string().trim().email().max(320).nullable().optional(),
    attachments: z.array(attachmentSchema).max(SUPPORT_V1_ATTACHMENT_MAX_FILES).optional(),
  })).max(200),
})

export type FederatedSupportProjectionRequest = z.infer<typeof federatedSupportProjectionSchema>
