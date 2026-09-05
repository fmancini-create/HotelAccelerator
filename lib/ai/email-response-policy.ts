import type { SupabaseClient } from "@supabase/supabase-js"
import { isMachineSender } from "@/lib/crm/machine-sender"

export type EmailAiPolicyAction = "skip" | "draft" | "autopilot"
export type EmailAiPolicyCategory =
  | "hard_safety"
  | "blocked"
  | "trusted"
  | "internal"
  | "bulk"
  | "automated"
  | "transactional"
  | "unclassified"

export interface EmailAiResponsePolicy {
  property_id: string
  automated_action: EmailAiPolicyAction
  bulk_action: EmailAiPolicyAction
  transactional_action: EmailAiPolicyAction
  internal_action: EmailAiPolicyAction
  unclassified_action: EmailAiPolicyAction
  trusted_senders: string[]
  blocked_senders: string[]
  blocked_domains: string[]
  internal_domains: string[]
  blocked_subject_keywords: string[]
}

export interface EmailPolicyInput {
  from: string
  subject?: string | null
  headers?: Record<string, string | null | undefined>
}

export interface EmailPolicyDecision {
  action: EmailAiPolicyAction
  category: EmailAiPolicyCategory
  reason: string
}

const DEFAULT_POLICY: Omit<EmailAiResponsePolicy, "property_id"> = {
  automated_action: "skip",
  bulk_action: "skip",
  transactional_action: "draft",
  internal_action: "skip",
  unclassified_action: "autopilot",
  trusted_senders: [],
  blocked_senders: [],
  blocked_domains: [],
  internal_domains: [],
  blocked_subject_keywords: [],
}

const TRANSACTIONAL_LOCAL_PART =
  /(^|[._+-])(reservation|reservations|prenotazioni|booking|receipt|ricevuta|invoice|invoices|billing|payment|pagamenti|order|orders|ordini|delivery|spedizione|tracking)([._+-]|$)/i

const AUTOMATED_SUBJECT =
  /(automatic reply|auto[- ]?reply|risposta automatica|fuori sede|out of office|delivery status notification|undeliverable|mail delivery subsystem|failure notice)/i

function extractAddress(raw: string): string {
  const match = (raw || "").match(/<([^>]+)>/)
  return (match ? match[1] : raw || "").trim().toLowerCase()
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@")
  return at > 0 ? email.slice(at + 1).toLowerCase() : ""
}

function localPartOf(email: string): string {
  const at = email.indexOf("@")
  return at > 0 ? email.slice(0, at).toLowerCase() : ""
}

function domainMatches(domain: string, configured: string[]): boolean {
  return configured.some((raw) => {
    const value = raw.trim().toLowerCase().replace(/^@/, "")
    return Boolean(value) && (domain === value || domain.endsWith(`.${value}`))
  })
}

function senderMatches(email: string, configured: string[]): boolean {
  return configured.some((value) => value.trim().toLowerCase() === email)
}

function header(input: EmailPolicyInput, name: string): string {
  const entries = Object.entries(input.headers ?? {})
  const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase())
  return String(found?.[1] ?? "").trim()
}

export async function getEmailAiResponsePolicy(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<EmailAiResponsePolicy> {
  const { data, error } = await supabase
    .from("email_ai_response_policies")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { property_id: propertyId, ...DEFAULT_POLICY }

  return {
    property_id: propertyId,
    automated_action: data.automated_action ?? DEFAULT_POLICY.automated_action,
    bulk_action: data.bulk_action ?? DEFAULT_POLICY.bulk_action,
    transactional_action: data.transactional_action ?? DEFAULT_POLICY.transactional_action,
    internal_action: data.internal_action ?? DEFAULT_POLICY.internal_action,
    unclassified_action: data.unclassified_action ?? DEFAULT_POLICY.unclassified_action,
    trusted_senders: data.trusted_senders ?? [],
    blocked_senders: data.blocked_senders ?? [],
    blocked_domains: data.blocked_domains ?? [],
    internal_domains: data.internal_domains ?? [],
    blocked_subject_keywords: data.blocked_subject_keywords ?? [],
  }
}

export function decideEmailAiResponse(
  policy: EmailAiResponsePolicy,
  input: EmailPolicyInput,
): EmailPolicyDecision {
  const email = extractAddress(input.from)
  const domain = domainOf(email)
  const subject = (input.subject || "").trim()
  const autoSubmitted = header(input, "Auto-Submitted").toLowerCase()
  const precedence = header(input, "Precedence").toLowerCase()
  const xAutoResponseSuppress = header(input, "X-Auto-Response-Suppress").toLowerCase()
  const returnPath = header(input, "Return-Path").toLowerCase()
  const listId = header(input, "List-Id")
  const listUnsubscribe = header(input, "List-Unsubscribe")

  // Non-overridable safety. These messages must never trigger a reply loop,
  // even if a tenant puts the sender on an allow-list.
  if (
    (autoSubmitted && autoSubmitted !== "no") ||
    xAutoResponseSuppress ||
    returnPath === "<>" ||
    /mailer-daemon|postmaster/i.test(email) ||
    AUTOMATED_SUBJECT.test(subject)
  ) {
    return { action: "skip", category: "hard_safety", reason: "automatic_or_bounce_header" }
  }

  if (
    senderMatches(email, policy.blocked_senders) ||
    domainMatches(domain, policy.blocked_domains) ||
    policy.blocked_subject_keywords.some((value) => value && subject.toLowerCase().includes(value.toLowerCase()))
  ) {
    return { action: "skip", category: "blocked", reason: "tenant_block_rule" }
  }

  if (senderMatches(email, policy.trusted_senders)) {
    return { action: policy.unclassified_action, category: "trusted", reason: "tenant_trusted_sender" }
  }

  if (domainMatches(domain, policy.internal_domains)) {
    return { action: policy.internal_action, category: "internal", reason: "internal_domain" }
  }

  if (listId || listUnsubscribe || ["bulk", "list", "junk"].includes(precedence)) {
    return { action: policy.bulk_action, category: "bulk", reason: "mailing_list_or_bulk_header" }
  }

  if (isMachineSender(email)) {
    return { action: policy.automated_action, category: "automated", reason: "machine_sender" }
  }

  if (TRANSACTIONAL_LOCAL_PART.test(localPartOf(email))) {
    return { action: policy.transactional_action, category: "transactional", reason: "transactional_sender" }
  }

  return { action: policy.unclassified_action, category: "unclassified", reason: "ordinary_message" }
}
