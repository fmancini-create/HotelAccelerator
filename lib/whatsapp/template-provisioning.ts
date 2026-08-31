import type { SupabaseClient } from "@supabase/supabase-js"
import { getGraphVersion, type MessagingChannelRow } from "./types"

export const WHATSAPP_REOPEN_TEMPLATE_NAME = "hotelaccelerator_nuova_comunicazione"
export const WHATSAPP_REOPEN_TEMPLATE_LANGUAGE = "it"
export const WHATSAPP_REOPEN_TEMPLATE_CATEGORY = "MARKETING"
export const WHATSAPP_REOPEN_TEMPLATE_BODY =
  "L'azienda {{1}} ha una nuova comunicazione per te. Vuoi riceverla qui su WhatsApp?"
export const WHATSAPP_REOPEN_TEMPLATE_ACCEPT_LABEL = "Apri comunicazione"
export const WHATSAPP_REOPEN_TEMPLATE_DECLINE_LABEL = "Non ora"

export type WhatsAppTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "IN_APPEAL"
  | "PENDING_DELETION"
  | "DELETED"
  | "DISABLED"
  | "FLAGGED"
  | "REINSTATED"
  | "ERROR"
  | string

export interface WhatsAppTemplateProvisioningResult {
  ok: boolean
  created: boolean
  status: WhatsAppTemplateStatus
  templateId?: string
  category?: string
  error?: string
}

interface EnsureTemplateInput {
  wabaId: string
  graphVersion: string
  accessToken: string
  sampleCompanyName?: string
}

function graphError(json: any, fallback: string): string {
  return json?.error?.message || json?.message || fallback
}

function normalizeStatus(value: unknown, fallback = "PENDING"): WhatsAppTemplateStatus {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : fallback
}

/**
 * Ensure the HotelAccelerator reopen template exists on one concrete WABA.
 * The WABA is tenant-owned; the template definition is platform-managed.
 * No tenant has to open WhatsApp Manager manually.
 */
export async function ensureWhatsAppReopenTemplate(
  input: EnsureTemplateInput,
): Promise<WhatsAppTemplateProvisioningResult> {
  const wabaId = input.wabaId.trim()
  const accessToken = input.accessToken.trim()
  const graphVersion = input.graphVersion.trim()

  if (!wabaId || !accessToken || !graphVersion) {
    return {
      ok: false,
      created: false,
      status: "ERROR",
      error: "Configurazione Meta incompleta per il provisioning del template WhatsApp.",
    }
  }

  const baseUrl = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/message_templates`
  const lookupUrl = `${baseUrl}?${new URLSearchParams({
    name: WHATSAPP_REOPEN_TEMPLATE_NAME,
    fields: "id,name,language,status,category",
  }).toString()}`

  const lookupResponse = await fetch(lookupUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const lookupJson = await lookupResponse.json().catch(() => null)

  if (!lookupResponse.ok) {
    return {
      ok: false,
      created: false,
      status: "ERROR",
      error: graphError(lookupJson, "Meta non ha consentito la verifica del template WhatsApp."),
    }
  }

  const existing = (Array.isArray(lookupJson?.data) ? lookupJson.data : []).find(
    (template: any) =>
      template?.name === WHATSAPP_REOPEN_TEMPLATE_NAME &&
      template?.language === WHATSAPP_REOPEN_TEMPLATE_LANGUAGE,
  )

  if (existing) {
    return {
      ok: true,
      created: false,
      status: normalizeStatus(existing.status),
      templateId: existing.id ? String(existing.id) : undefined,
      category: typeof existing.category === "string" ? existing.category : undefined,
    }
  }

  const createResponse = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: WHATSAPP_REOPEN_TEMPLATE_NAME,
      language: WHATSAPP_REOPEN_TEMPLATE_LANGUAGE,
      category: WHATSAPP_REOPEN_TEMPLATE_CATEGORY,
      components: [
        {
          type: "BODY",
          text: WHATSAPP_REOPEN_TEMPLATE_BODY,
          example: {
            body_text: [[input.sampleCompanyName?.trim() || "Hotel Demo"]],
          },
        },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: WHATSAPP_REOPEN_TEMPLATE_ACCEPT_LABEL },
            { type: "QUICK_REPLY", text: WHATSAPP_REOPEN_TEMPLATE_DECLINE_LABEL },
          ],
        },
      ],
    }),
  })
  const createJson = await createResponse.json().catch(() => null)

  if (!createResponse.ok) {
    return {
      ok: false,
      created: false,
      status: "ERROR",
      error: graphError(createJson, "Meta non ha consentito la creazione automatica del template WhatsApp."),
    }
  }

  return {
    ok: true,
    created: true,
    status: normalizeStatus(createJson?.status),
    templateId: createJson?.id ? String(createJson.id) : undefined,
    category:
      typeof createJson?.category === "string"
        ? createJson.category
        : WHATSAPP_REOPEN_TEMPLATE_CATEGORY,
  }
}

export function templateStatePatch(result: WhatsAppTemplateProvisioningResult) {
  return {
    reopen_template_name: WHATSAPP_REOPEN_TEMPLATE_NAME,
    reopen_template_language: WHATSAPP_REOPEN_TEMPLATE_LANGUAGE,
    reopen_template_status: result.status,
    reopen_template_id: result.templateId ?? null,
    reopen_template_category: result.category ?? null,
    reopen_template_checked_at: new Date().toISOString(),
    reopen_template_managed_by: "hotelaccelerator",
    reopen_template_provisioning_error: result.ok ? null : result.error ?? "Errore provisioning template",
  }
}

/**
 * Lazy self-healing check used before a business-initiated message. It retries
 * provisioning/status lookup with the tenant channel credentials and persists
 * only non-secret status metadata inside messaging_channels.config.
 */
export async function ensureWhatsAppReopenTemplateForChannel(
  supabase: SupabaseClient,
  channel: MessagingChannelRow,
  sampleCompanyName?: string,
): Promise<WhatsAppTemplateProvisioningResult> {
  const wabaId = typeof channel.config?.waba_id === "string" ? channel.config.waba_id : ""
  const accessToken =
    typeof channel.credentials?.access_token === "string" ? channel.credentials.access_token : ""

  const result = await ensureWhatsAppReopenTemplate({
    wabaId,
    graphVersion: getGraphVersion(channel.config),
    accessToken,
    sampleCompanyName,
  })

  const nextConfig = {
    ...(channel.config ?? {}),
    ...templateStatePatch(result),
  }

  await supabase
    .from("messaging_channels")
    .update({ config: nextConfig, updated_at: new Date().toISOString() })
    .eq("id", channel.id)
    .eq("property_id", channel.property_id)
    .eq("channel_type", "whatsapp")

  return result
}

interface TemplateStatusWebhookEvent {
  wabaId: string
  templateId?: string
  templateName?: string
  language?: string
  status: WhatsAppTemplateStatus
  reason?: string
}

function extractTemplateStatusEvents(body: any): TemplateStatusWebhookEvent[] {
  const events: TemplateStatusWebhookEvent[] = []
  if (!body || body.object !== "whatsapp_business_account") return events

  for (const entry of body.entry ?? []) {
    const wabaId = entry?.id ? String(entry.id) : ""
    if (!wabaId) continue

    for (const change of entry?.changes ?? []) {
      if (change?.field !== "message_template_status_update") continue
      const value = change?.value ?? {}
      events.push({
        wabaId,
        templateId: value.message_template_id ? String(value.message_template_id) : undefined,
        templateName:
          typeof value.message_template_name === "string"
            ? value.message_template_name
            : typeof value.name === "string"
              ? value.name
              : undefined,
        language:
          typeof value.message_template_language === "string"
            ? value.message_template_language
            : typeof value.language === "string"
              ? value.language
              : undefined,
        status: normalizeStatus(value.event ?? value.status, "PENDING"),
        reason:
          typeof value.reason === "string"
            ? value.reason
            : typeof value.rejection_reason === "string"
              ? value.rejection_reason
              : undefined,
      })
    }
  }

  return events
}

/**
 * Consume Meta template-status webhooks for our managed template. The caller
 * must verify the Meta app signature before invoking this function.
 */
export async function syncWhatsAppReopenTemplateStatusFromWebhook(
  supabase: SupabaseClient,
  body: any,
): Promise<number> {
  const events = extractTemplateStatusEvents(body)
  let updated = 0

  for (const event of events) {
    const { data: rows } = await supabase
      .from("messaging_channels")
      .select("id, property_id, config")
      .eq("channel_type", "whatsapp")
      .eq("config->>waba_id", event.wabaId)

    for (const row of (rows ?? []) as Array<{
      id: string
      property_id: string
      config: Record<string, unknown> | null
    }>) {
      const config = row.config ?? {}
      const configuredId =
        typeof config.reopen_template_id === "string" ? config.reopen_template_id : undefined
      const nameMatches = event.templateName === WHATSAPP_REOPEN_TEMPLATE_NAME
      const idMatches = Boolean(event.templateId && configuredId && event.templateId === configuredId)
      const languageMatches =
        !event.language || event.language === WHATSAPP_REOPEN_TEMPLATE_LANGUAGE

      if ((!nameMatches && !idMatches) || !languageMatches) continue

      const nextConfig = {
        ...config,
        reopen_template_name: WHATSAPP_REOPEN_TEMPLATE_NAME,
        reopen_template_language: WHATSAPP_REOPEN_TEMPLATE_LANGUAGE,
        reopen_template_status: event.status,
        reopen_template_id: event.templateId ?? configuredId ?? null,
        reopen_template_checked_at: new Date().toISOString(),
        reopen_template_managed_by: "hotelaccelerator",
        reopen_template_provisioning_error:
          event.status === "REJECTED" || event.status === "DISABLED" || event.status === "FLAGGED"
            ? event.reason ?? `Template Meta ${event.status.toLowerCase()}`
            : null,
      }

      const { error } = await supabase
        .from("messaging_channels")
        .update({ config: nextConfig, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("property_id", row.property_id)
        .eq("channel_type", "whatsapp")

      if (!error) updated += 1
    }
  }

  return updated
}
