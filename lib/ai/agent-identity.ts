import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSignatureHtml, htmlToPlainText } from "@/lib/html-sanitize"

export interface AiAgentIdentity {
  virtualUserId: string | null
  knowledgeBaseId: string
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

export function defaultAiVirtualUserName(knowledgeBaseName: string): string {
  const baseName = knowledgeBaseName.trim() || "virtuale"
  return `Assistente ${baseName}`.slice(0, 80)
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

/**
 * Resolves the virtual operator owned by a single knowledge base.
 *
 * The caller must always provide the active tenant and the base id together:
 * this prevents a base id from another tenant from becoming an identity lookup.
 * The DB trigger provisions the row automatically when the base is created;
 * the derived fallback only keeps a deployment-order problem from inventing a
 * global tenant identity again.
 */
export async function getAiAgentIdentity(
  supabase: SupabaseClient,
  propertyId: string,
  knowledgeBaseId: string,
): Promise<AiAgentIdentity> {
  const [virtualUserResult, propertyResult, baseResult] = await Promise.all([
    supabase
      .from("ai_virtual_users")
      .select("id, knowledge_base_id, display_name, signature_html")
      .eq("property_id", propertyId)
      .eq("knowledge_base_id", knowledgeBaseId)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("knowledge_bases")
      .select("id, name")
      .eq("id", knowledgeBaseId)
      .eq("property_id", propertyId)
      .maybeSingle(),
  ])

  if (virtualUserResult.error) throw virtualUserResult.error
  if (propertyResult.error) throw propertyResult.error
  if (baseResult.error) throw baseResult.error
  if (!baseResult.data) throw new Error("Base di conoscenza non trovata per il tenant attivo")

  const virtualUser = virtualUserResult.data
  const displayName = virtualUser?.display_name?.trim() || defaultAiVirtualUserName(baseResult.data.name ?? "")
  const customSignature = Boolean(virtualUser?.signature_html?.trim())
  const rawHtml = customSignature
    ? virtualUser!.signature_html!
    : defaultSignature(displayName, propertyResult.data?.name ?? null)
  const signatureHtml = sanitizeSignatureHtml(rawHtml)

  return {
    virtualUserId: virtualUser?.id ?? null,
    knowledgeBaseId,
    displayName,
    signatureHtml,
    signatureText: htmlToPlainText(signatureHtml),
    customSignature,
  }
}
