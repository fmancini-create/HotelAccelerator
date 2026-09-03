import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSignatureHtml, htmlToPlainText } from "@/lib/html-sanitize"

export const DEFAULT_AI_AGENT_NAME = "Sofia"

export interface AiAgentIdentity {
  displayName: string
  signatureHtml: string
  signatureText: string
  customSignature: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function defaultSignature(displayName: string, propertyName: string | null): string {
  const safeName = escapeHtml(displayName)
  const safeProperty = propertyName ? escapeHtml(propertyName) : null
  return [
    `<strong>${safeName}</strong>`,
    "Assistente virtuale",
    safeProperty,
  ]
    .filter(Boolean)
    .join("<br>")
}

export async function getAiAgentIdentity(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<AiAgentIdentity> {
  const [{ data: settings, error: settingsError }, { data: property, error: propertyError }] = await Promise.all([
    supabase
      .from("ai_agent_settings")
      .select("display_name, signature_html")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle(),
  ])

  if (settingsError) throw settingsError
  if (propertyError) throw propertyError

  const displayName = settings?.display_name?.trim() || DEFAULT_AI_AGENT_NAME
  const customSignature = Boolean(settings?.signature_html?.trim())
  const rawHtml = customSignature
    ? settings!.signature_html!
    : defaultSignature(displayName, property?.name ?? null)
  const signatureHtml = sanitizeSignatureHtml(rawHtml)

  return {
    displayName,
    signatureHtml,
    signatureText: htmlToPlainText(signatureHtml),
    customSignature,
  }
}
