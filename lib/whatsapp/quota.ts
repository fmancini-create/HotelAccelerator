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

/**
 * Meta assegna a ogni app un numero di PROVA gratuito nell'intervallo
 * statunitense fittizio +1 555, usato per i collaudi: puo' ricevere solo dai
 * pochi destinatari messi in lista dallo sviluppatore, quindi un cliente vero
 * non riesce mai a scrivergli.
 *
 * Serve distinguerlo perche' occupa un posto in quota esattamente come un
 * numero vero: senza questo controllo l'hotel si vede proporre l'ACQUISTO di
 * un numero aggiuntivo quando gli basterebbe disconnettere quello di prova.
 */
export function isMetaTestNumber(displayPhoneNumber?: string | null): boolean {
  if (!displayPhoneNumber) return false
  const digits = displayPhoneNumber.replace(/\D/g, "")
  return digits.startsWith("1555")
}

export interface WhatsAppQuotaTestNumber {
  id: string
  displayPhoneNumber: string
}

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
  /** numeri di prova Meta che stanno occupando un posto in quota */
  testNumbers: WhatsAppQuotaTestNumber[]
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

  // Leggiamo le righe attive invece del solo conteggio: servono i numeri per
  // riconoscere quelli di prova, e il conteggio e' comunque la loro lunghezza.
  const { data: attivi } = await supabase
    .from("messaging_channels")
    .select("id, config")
    .eq("property_id", propertyId)
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)

  const righe = (attivi ?? []) as { id: string; config: Record<string, unknown> | null }[]
  const used = righe.length
  const remaining = Math.max(0, limit - used)

  const testNumbers: WhatsAppQuotaTestNumber[] = righe
    .map((r) => ({
      id: r.id,
      displayPhoneNumber: String(r.config?.display_phone_number ?? ""),
    }))
    .filter((n) => isMetaTestNumber(n.displayPhoneNumber))

  return {
    propertyId,
    includedNumbers,
    extraNumbers,
    limit,
    used,
    remaining,
    canAddNumber: used < limit,
    testNumbers,
  }
}

/**
 * Messaggio unico per il rifiuto da quota piena.
 *
 * Se il posto e' occupato da un numero di PROVA Meta la via d'uscita non e'
 * pagare, e' disconnettere quel numero: dirlo qui evita che l'hotel acquisti
 * un posto in piu' senza motivo. Sta in un punto solo perche' il controllo di
 * quota vive in due rotte diverse (collegamento guidato e salvataggio manuale)
 * e i due messaggi non devono poter divergere.
 */
export function quotaExceededMessage(quota: Pick<WhatsAppQuota, "limit" | "testNumbers">): string {
  if (quota.testNumbers.length > 0) {
    const elenco = quota.testNumbers.map((n) => n.displayPhoneNumber).filter(Boolean).join(", ")
    return (
      `Il tuo piano include ${quota.limit} ${quota.limit === 1 ? "numero" : "numeri"} WhatsApp e ` +
      `${quota.limit === 1 ? "il posto è occupato" : "i posti sono occupati"} da un numero di prova Meta` +
      (elenco ? ` (${elenco})` : "") +
      `. Non serve acquistare nulla: disconnetti il numero di prova da questa pagina, poi collega il numero vero.`
    )
  }
  return `Hai raggiunto il limite di numeri WhatsApp del tuo piano (${quota.limit}). Acquista un numero aggiuntivo per collegarne un altro.`
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
