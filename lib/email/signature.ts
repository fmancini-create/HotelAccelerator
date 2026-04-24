// Shared helper: fetch the authenticated admin user's email signature
// and append it to outgoing messages. One source of truth for all
// outbound channels (Gmail reply/compose, SMTP send, OAuth send).
//
// Storage model (see scripts/071_add_signature_html.sql):
//   admin_users.signature_html  -> rich-text HTML (preferred when sending HTML)
//   admin_users.signature       -> plain-text fallback (derived server-side)

import type { SupabaseClient } from "@supabase/supabase-js"

export interface UserSignature {
  html: string | null
  text: string | null
}

/**
 * Look up the signature for an admin user by auth uid.
 * Returns { html: null, text: null } if the user has no row or no signature.
 */
export async function getUserSignature(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSignature> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("signature_html, signature")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("[v0] getUserSignature error:", error)
    return { html: null, text: null }
  }

  return {
    html: data?.signature_html ?? null,
    text: data?.signature ?? null,
  }
}

/**
 * Appends the signature to an HTML body with a standard email separator.
 * If the body already contains the signature (exact match), skip to avoid
 * duplicates when the client has already inlined it (e.g. quoted replies).
 */
export function appendSignatureHtml(bodyHtml: string, signatureHtml: string | null): string {
  if (!signatureHtml) return bodyHtml
  const trimmed = signatureHtml.trim()
  if (!trimmed) return bodyHtml
  if (bodyHtml.includes(trimmed)) return bodyHtml
  // Standard email signature separator "-- " is a convention but doesn't
  // render well in HTML clients; we use a visual <hr> + spacing instead.
  return `${bodyHtml}<br><br><div class="ha-signature">${trimmed}</div>`
}

/**
 * Appends the signature to a plain-text body with a standard separator.
 */
export function appendSignatureText(bodyText: string, signatureText: string | null): string {
  if (!signatureText) return bodyText
  const trimmed = signatureText.trim()
  if (!trimmed) return bodyText
  if (bodyText.includes(trimmed)) return bodyText
  return `${bodyText}\n\n-- \n${trimmed}`
}
