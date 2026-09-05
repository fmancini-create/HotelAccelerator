import { z } from "zod"

export const supportKindSchema = z.enum(["human_support", "feedback_bug", "feedback_improvement"])
export type SupportKind = z.infer<typeof supportKindSchema>

export const supportMessageSchema = z.object({
  id: z.string().trim().min(1).max(180),
  role: z.enum(["customer", "support", "system"]),
  content: z.string().trim().min(1).max(20_000),
  created_at: z.string().datetime().optional(),
  sender_name: z.string().trim().max(180).optional(),
})

export const supportEventSchema = z.object({
  tenant_ref: z.string().trim().min(1).max(160),
  thread: z.object({
    id: z.string().trim().min(1).max(180),
    title: z.string().trim().min(1).max(240).optional(),
    kind: supportKindSchema,
    status: z.enum(["open", "forwarded", "closed"]).default("open"),
  }),
  messages: z.array(supportMessageSchema).min(1).max(200),
})

export type SupportEvent = z.infer<typeof supportEventSchema>

export const supportReplySchema = z.object({
  tenant_ref: z.string().trim().min(1).max(160),
  thread_id: z.string().trim().min(1).max(180),
  message_id: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(20_000),
  sender_name: z.string().trim().min(1).max(180),
})

export type SupportReply = z.infer<typeof supportReplySchema>
