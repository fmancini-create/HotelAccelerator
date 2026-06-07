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
 * Derive a reasonable plain-text version from an HTML signature.
 */
function htmlToText(html: string | null): string | null {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/**
 * Resolve the signature HTML for a user from the signature library.
 *
 * Priority (highest first), each level optionally refined by channel:
 *   1. Direct assignment to the user
 *   2. Assignment inherited from one of the user's groups
 *   3. Tenant-default signature (is_default = true)
 *
 * For each level a channel-scoped assignment (channel_id = channelId) wins
 * over a channel-agnostic one (channel_id is null).
 *
 * Returns null if the library has nothing applicable (caller falls back to
 * the legacy admin_users.signature_html column).
 */
async function resolveLibrarySignatureHtml(
  supabase: SupabaseClient,
  userId: string,
  channelId?: string | null,
): Promise<string | null> {
  // We need the user's property + group memberships to scope the lookup.
  const { data: userRow } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("id", userId)
    .maybeSingle()

  const propertyId = userRow?.property_id
  if (!propertyId) return null

  const { data: groupRows } = await supabase
    .from("user_group_members")
    .select("group_id")
    .eq("user_id", userId)
  const groupIds = (groupRows ?? []).map((g: { group_id: string }) => g.group_id)

  // Pull all assignments for this user / their groups in one query.
  const orParts = [`and(target_type.eq.user,target_id.eq.${userId})`]
  if (groupIds.length > 0) {
    orParts.push(`and(target_type.eq.group,target_id.in.(${groupIds.join(",")}))`)
  }

  const { data: assignments, error: aErr } = await supabase
    .from("email_signature_assignments")
    .select("signature_id, target_type, channel_id")
    .eq("property_id", propertyId)
    .or(orParts.join(","))

  if (aErr) {
    console.error("[v0] resolveLibrarySignatureHtml assignments error:", aErr)
  }

  // Helper to pick the best assignment for a given target type, preferring a
  // channel-scoped match over a channel-agnostic one.
  const pickSignatureId = (targetType: "user" | "group"): string | null => {
    const rows = (assignments ?? []).filter((a) => a.target_type === targetType)
    if (rows.length === 0) return null
    if (channelId) {
      const scoped = rows.find((a) => a.channel_id === channelId)
      if (scoped) return scoped.signature_id
    }
    const agnostic = rows.find((a) => !a.channel_id)
    return (agnostic ?? rows[0]).signature_id
  }

  const signatureId = pickSignatureId("user") ?? pickSignatureId("group")

  if (signatureId) {
    const { data: sig } = await supabase
      .from("email_signatures")
      .select("html")
      .eq("id", signatureId)
      .maybeSingle()
    if (sig?.html && sig.html.trim()) return sig.html
  }

  // Tenant-default fallback (channel-scoped default wins if present).
  let defaultQuery = supabase
    .from("email_signatures")
    .select("html, channel_id")
    .eq("property_id", propertyId)
    .eq("is_default", true)
  const { data: defaults } = await defaultQuery
  if (defaults && defaults.length > 0) {
    const scoped = channelId ? defaults.find((d) => d.channel_id === channelId) : undefined
    const chosen = scoped ?? defaults.find((d) => !d.channel_id) ?? defaults[0]
    if (chosen?.html && chosen.html.trim()) return chosen.html
  }

  return null
}

/**
 * Look up the signature for an admin user by auth uid.
 *
 * Resolution order:
 *   1. Signature library (user -> group -> tenant default), channel-aware
 *   2. Legacy admin_users.signature_html / signature columns (fallback)
 *
 * Returns { html: null, text: null } if nothing is found.
 */
export async function getUserSignature(
  supabase: SupabaseClient,
  userId: string,
  channelId?: string | null,
): Promise<UserSignature> {
  // 1. Try the new signature library first.
  try {
    const libHtml = await resolveLibrarySignatureHtml(supabase, userId, channelId)
    if (libHtml) {
      return { html: libHtml, text: htmlToText(libHtml) }
    }
  } catch (err) {
    console.error("[v0] getUserSignature library lookup failed, falling back:", err)
  }

  // 2. Legacy per-user column fallback.
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
