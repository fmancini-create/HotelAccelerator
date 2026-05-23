import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Auto-capture CRM settings. Per-tenant policy that decides whether email
 * senders (inbound) and TO recipients (outbound) should be upserted as CRM
 * contacts.
 *
 * Contract:
 *  - Existing contacts are NEVER modified (immutable policy).
 *  - Disabled toggles or blacklist matches downgrade the capture to "minimal":
 *    - inbound: the contact is still created so the conversation has a valid
 *      contact_id (thread-linking requirement), but with a neutral source.
 *    - outbound: capture is fully skipped (no conversation dependency).
 *  - All failures are swallowed: signature wiring and send flows must never
 *    break because of CRM auto-capture side effects.
 */

export interface AutoCaptureSettings {
  property_id: string
  enabled: boolean
  capture_inbound: boolean
  capture_outbound: boolean
  blacklist_domains: string[]
  blacklist_keywords: string[]
  default_tag: string
}

const DEFAULT_SETTINGS: Omit<AutoCaptureSettings, "property_id"> = {
  enabled: true,
  capture_inbound: true,
  capture_outbound: true,
  blacklist_domains: [],
  blacklist_keywords: [],
  default_tag: "email_auto",
}

export async function getAutoCaptureSettings(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<AutoCaptureSettings> {
  const { data } = await supabase
    .from("crm_auto_capture_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (!data) {
    return { property_id: propertyId, ...DEFAULT_SETTINGS }
  }
  return data as AutoCaptureSettings
}

/**
 * Decide whether a given email address should be captured given the settings.
 * Returns false if:
 *  - email is malformed
 *  - the domain is in the blacklist
 *  - any blacklist keyword appears in the local-part or full address
 */
export function shouldCaptureAddress(email: string, settings: AutoCaptureSettings): boolean {
  const normalized = email.trim().toLowerCase()
  const at = normalized.indexOf("@")
  if (at < 1 || at === normalized.length - 1) return false

  const domain = normalized.slice(at + 1)
  const local = normalized.slice(0, at)

  for (const raw of settings.blacklist_domains) {
    const d = raw.trim().toLowerCase().replace(/^@/, "")
    if (!d) continue
    // Exact or suffix match (e.g. "example.com" matches "foo.example.com")
    if (domain === d || domain.endsWith("." + d)) return false
  }

  for (const raw of settings.blacklist_keywords) {
    const kw = raw.trim().toLowerCase()
    if (!kw) continue
    if (local.includes(kw) || normalized.includes(kw)) return false
  }

  return true
}

export type CaptureDirection = "inbound" | "outbound"

export interface AutoCaptureInput {
  supabase: SupabaseClient
  propertyId: string
  email: string
  name?: string | null
  direction: CaptureDirection
  settings?: AutoCaptureSettings // allow callers to pass preloaded settings for bulk ops
}

export interface AutoCaptureResult {
  contactId: string | null
  created: boolean
  skipped: boolean
  reason?: string
}

/**
 * Find-or-create a contact for the given email address, honouring the tenant's
 * auto-capture policy. Idempotent and safe to call in hot paths.
 *
 * Behaviour matrix:
 *  direction = inbound:
 *    - existing contact       -> return it, never mutated
 *    - no contact + capture   -> create with source='email_auto', tagged
 *    - no contact + blocked   -> create minimal (source='system') so the
 *                                conversation has a contact_id to link to
 *  direction = outbound:
 *    - existing contact       -> return it
 *    - no contact + capture   -> create with source='email_auto', tagged
 *    - no contact + blocked   -> skip (no conversation depends on it)
 */
export async function autoCaptureContact(input: AutoCaptureInput): Promise<AutoCaptureResult> {
  const { supabase, propertyId, direction } = input
  const rawEmail = (input.email || "").trim()
  if (!rawEmail) return { contactId: null, created: false, skipped: true, reason: "empty_email" }

  const email = rawEmail.toLowerCase()
  const name = (input.name || "").trim() || email.split("@")[0]

  try {
    // Immutable policy: any existing contact wins, regardless of settings.
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .eq("email", email)
      .maybeSingle()

    if (existing) {
      return { contactId: existing.id, created: false, skipped: false, reason: "existing" }
    }

    const settings = input.settings ?? (await getAutoCaptureSettings(supabase, propertyId))
    const featureOn =
      settings.enabled &&
      (direction === "inbound" ? settings.capture_inbound : settings.capture_outbound)
    const allowed = featureOn && shouldCaptureAddress(email, settings)

    if (direction === "outbound" && !allowed) {
      return { contactId: null, created: false, skipped: true, reason: "outbound_blocked" }
    }

    // Inbound without capture still creates a minimal contact so the
    // conversation can link to it. Outbound requires an active policy.
    const contactPayload: Record<string, unknown> = {
      property_id: propertyId,
      email,
      name,
    }

    if (allowed) {
      contactPayload.source = direction === "inbound" ? "email_inbound" : "email_outbound"
      if (settings.default_tag) {
        contactPayload.tags = [settings.default_tag]
      }
    } else {
      contactPayload.source = "system"
    }

    const { data: created, error } = await supabase
      .from("contacts")
      .insert(contactPayload)
      .select("id")
      .single()

    if (error) {
      // Race: another concurrent inbound may have created it first.
      if (error.code === "23505") {
        const { data: again } = await supabase
          .from("contacts")
          .select("id")
          .eq("property_id", propertyId)
          .eq("email", email)
          .maybeSingle()
        if (again) return { contactId: again.id, created: false, skipped: false, reason: "race_existing" }
      }
      console.error("[auto-capture] insert failed", { email, direction, error: error.message })
      return { contactId: null, created: false, skipped: true, reason: "insert_error" }
    }

    return { contactId: created.id, created: true, skipped: false, reason: allowed ? "captured" : "minimal" }
  } catch (e) {
    console.error("[auto-capture] unexpected error", e)
    return { contactId: null, created: false, skipped: true, reason: "exception" }
  }
}

/**
 * Convenience wrapper for send flows: capture multiple outbound recipients
 * in parallel without blocking. Returns void; all errors are swallowed.
 */
export async function captureOutboundRecipients(
  supabase: SupabaseClient,
  propertyId: string,
  recipients: Array<{ email: string; name?: string | null }>,
  settings?: AutoCaptureSettings,
): Promise<void> {
  if (recipients.length === 0) return
  try {
    const effectiveSettings = settings ?? (await getAutoCaptureSettings(supabase, propertyId))
    // Fast exit if feature is disabled — avoids N extra queries.
    if (!effectiveSettings.enabled || !effectiveSettings.capture_outbound) return
    await Promise.all(
      recipients.map((r) =>
        autoCaptureContact({
          supabase,
          propertyId,
          email: r.email,
          name: r.name,
          direction: "outbound",
          settings: effectiveSettings,
        }),
      ),
    )
  } catch (e) {
    console.error("[auto-capture] bulk outbound failed", e)
  }
}

/**
 * Parse an RFC 5322 address string like `"Jane Doe" <jane@example.com>`
 * or a plain `jane@example.com` into `{ email, name }`.
 */
export function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const trimmed = (raw || "").trim()
  if (!trimmed) return { email: "", name: null }
  const m = trimmed.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (m) {
    return { email: m[2].trim(), name: m[1]?.trim() || null }
  }
  return { email: trimmed, name: null }
}

/**
 * Normalise a recipients field that may arrive as string, array, or mixed
 * separators (comma/semicolon/newline) into a clean list of parsed addresses.
 */
export function parseRecipientList(input: unknown): Array<{ email: string; name: string | null }> {
  if (!input) return []
  const raw = Array.isArray(input) ? input.map(String) : String(input).split(/[,;\n]/)
  const out: Array<{ email: string; name: string | null }> = []
  const seen = new Set<string>()
  for (const chunk of raw) {
    const parsed = parseEmailAddress(chunk)
    const key = parsed.email.toLowerCase()
    if (!parsed.email || seen.has(key)) continue
    seen.add(key)
    out.push(parsed)
  }
  return out
}
