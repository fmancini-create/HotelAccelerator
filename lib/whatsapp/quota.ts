import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * WhatsApp number quota per property.
 *
 * The base package includes `included_numbers` (default 1). Additional numbers
 * are `extra_numbers`, unlocked either automatically by a Stripe purchase
 * (webhook bumps `extra_numbers`) or manually by a super admin.
 *
 *   limit = included_numbers + extra_numbers
 *
 * A property can connect a new WhatsApp number only while the count of its
 * active WhatsApp channels is strictly below this limit.
 */

export const DEFAULT_INCLUDED_NUMBERS = 1

export interface WhatsAppQuota {
  propertyId: string
  includedNumbers: number
  extraNumbers: number
  /** included + extra */
  limit: number
  /** active whatsapp channels currently connected */
  used: number
  /** limit - used, never below 0 */
  remaining: number
  /** whether another number can be connected right now */
  canAddNumber: boolean
}

/**
 * Count the active WhatsApp channels for a property.
 */
export async function countActiveWhatsAppNumbers(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<number> {
  const { count } = await supabase
    .from("messaging_channels")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)
  return count ?? 0
}

/**
 * Read (and lazily create) the quota row for a property, then compute usage.
 * If no row exists yet, the property gets the default included quota.
 */
export async function getWhatsAppQuota(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<WhatsAppQuota> {
  const { data: row } = await supabase
    .from("whatsapp_number_quota")
    .select("included_numbers, extra_numbers")
    .eq("property_id", propertyId)
    .maybeSingle()

  const includedNumbers = row?.included_numbers ?? DEFAULT_INCLUDED_NUMBERS
  const extraNumbers = row?.extra_numbers ?? 0
  const limit = includedNumbers + extraNumbers

  const used = await countActiveWhatsAppNumbers(supabase, propertyId)
  const remaining = Math.max(0, limit - used)

  return {
    propertyId,
    includedNumbers,
    extraNumbers,
    limit,
    used,
    remaining,
    canAddNumber: used < limit,
  }
}

/**
 * Set the number of EXTRA (paid) numbers for a property. Used by the Stripe
 * webhook and by super-admin tooling. Upserts the row, preserving included.
 */
export async function setExtraNumbers(
  supabase: SupabaseClient,
  propertyId: string,
  extraNumbers: number,
): Promise<void> {
  const safe = Math.max(0, Math.floor(extraNumbers))
  await supabase
    .from("whatsapp_number_quota")
    .upsert(
      {
        property_id: propertyId,
        extra_numbers: safe,
        included_numbers: DEFAULT_INCLUDED_NUMBERS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id", ignoreDuplicates: false },
    )
}

/**
 * Increment extra numbers by a delta (e.g. +1 when a customer buys one more).
 * Reads current value first so concurrent Stripe events stay additive.
 */
export async function incrementExtraNumbers(
  supabase: SupabaseClient,
  propertyId: string,
  delta: number,
): Promise<number> {
  const { data: row } = await supabase
    .from("whatsapp_number_quota")
    .select("extra_numbers")
    .eq("property_id", propertyId)
    .maybeSingle()

  const current = row?.extra_numbers ?? 0
  const next = Math.max(0, current + Math.floor(delta))
  await setExtraNumbers(supabase, propertyId, next)
  return next
}
