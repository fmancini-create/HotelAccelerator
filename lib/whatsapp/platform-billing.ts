import type { SupabaseClient } from "@supabase/supabase-js"
import { getPlatformWhatsAppConfig } from "./platform"

export type PlatformBillingStatus = "pending" | "ready" | "blocked" | "error"

export interface PlatformBillingConfig {
  id: "default"
  mode: "solution_partner_credit_line"
  business_id: string
  currency: string
  credit_line_id: string | null
  system_user_id: string | null
  status: PlatformBillingStatus
  last_error: string | null
  last_checked_at: string | null
}

export interface WhatsAppBillingProvisionResult {
  ok: boolean
  status: PlatformBillingStatus
  creditLineId?: string
  allocationConfigId?: string
  currency: string
  error?: string
}

async function graphJson(url: string, init: RequestInit, token: string): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  return { ok: response.ok && !data?.error, status: response.status, data }
}

export async function getPlatformBillingConfig(
  supabase: SupabaseClient,
): Promise<PlatformBillingConfig | null> {
  const { data, error } = await supabase
    .from("platform_whatsapp_billing")
    .select("id,mode,business_id,currency,credit_line_id,system_user_id,status,last_error,last_checked_at")
    .eq("id", "default")
    .maybeSingle()

  if (error) {
    // During a rolling deploy the code may briefly run before the additive
    // migration. Treat that as platform-not-ready rather than leaking a DB error
    // to a tenant.
    console.error("[WhatsApp billing] configuration read failed:", error)
    return null
  }
  return (data as PlatformBillingConfig | null) ?? null
}

async function persistBillingHealth(
  supabase: SupabaseClient,
  patch: Partial<PlatformBillingConfig>,
): Promise<void> {
  const { error } = await supabase
    .from("platform_whatsapp_billing")
    .update({ ...patch, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", "default")
  if (error) console.error("[WhatsApp billing] health persistence failed:", error)
}

/**
 * Resolve the 4BID extended credit line from Meta.
 *
 * Meta only exposes this edge to eligible Solution Partners. An empty list or a
 * permission error therefore means the platform cannot yet centrally fund
 * tenant WABAs. That is a 4BID operational condition, never something a tenant
 * should be asked to fix in Meta.
 */
export async function discoverPlatformCreditLine(
  supabase: SupabaseClient,
): Promise<WhatsAppBillingProvisionResult> {
  const billing = await getPlatformBillingConfig(supabase)
  const platform = getPlatformWhatsAppConfig()
  const currency = billing?.currency || "EUR"

  if (!billing?.business_id) {
    return { ok: false, status: "blocked", currency, error: "Business Portfolio 4BID non configurato." }
  }
  if (!platform.systemUserToken) {
    return { ok: false, status: "blocked", currency, error: "System user Meta 4BID non configurato." }
  }
  if (billing.credit_line_id) {
    return { ok: true, status: "ready", currency, creditLineId: billing.credit_line_id }
  }

  const url = `https://graph.facebook.com/${platform.graphVersion}/${billing.business_id}/extendedcredits?fields=id,legal_entity_name`
  const result = await graphJson(url, { method: "GET" }, platform.systemUserToken)
  const lines = Array.isArray(result.data?.data) ? result.data.data : []
  const line = lines.find((item: any) => typeof item?.id === "string" && item.id.trim())

  if (!result.ok || !line?.id) {
    const metaMessage = result.data?.error?.message
    const error = metaMessage
      ? `Meta non rende disponibile la linea di credito 4BID: ${metaMessage}`
      : "Meta non rende disponibile una linea di credito estesa per il Business Portfolio 4BID. Verificare l'abilitazione Solution Partner."
    await persistBillingHealth(supabase, { status: "blocked", last_error: error })
    return { ok: false, status: "blocked", currency, error }
  }

  const creditLineId = String(line.id)
  await persistBillingHealth(supabase, {
    credit_line_id: creditLineId,
    status: "ready",
    last_error: null,
  })
  return { ok: true, status: "ready", currency, creditLineId }
}

/**
 * Share the 4BID Solution Partner credit line with a tenant WABA and attach it.
 * Official Meta edge: /<EXTENDED_CREDIT_ID>/whatsapp_credit_sharing_and_attach.
 *
 * Idempotency: if the channel already persisted an allocation_config_id, callers
 * skip this operation. Meta is authoritative for a new allocation.
 */
export async function attachPlatformBillingToWaba(
  supabase: SupabaseClient,
  wabaId: string,
): Promise<WhatsAppBillingProvisionResult> {
  const platform = getPlatformWhatsAppConfig()
  const discovered = await discoverPlatformCreditLine(supabase)
  if (!discovered.ok || !discovered.creditLineId) return discovered

  const params = new URLSearchParams({
    waba_id: wabaId,
    waba_currency: discovered.currency,
  })
  const url = `https://graph.facebook.com/${platform.graphVersion}/${discovered.creditLineId}/whatsapp_credit_sharing_and_attach?${params.toString()}`
  const result = await graphJson(url, { method: "POST" }, platform.systemUserToken)

  const allocationConfigId = result.data?.allocation_config_id
  const responseWabaId = result.data?.waba_id
  if (!result.ok || !allocationConfigId || String(responseWabaId) !== String(wabaId)) {
    const metaMessage = result.data?.error?.message
    const error = metaMessage
      ? `Meta non ha collegato la fatturazione 4BID al WABA: ${metaMessage}`
      : "Meta non ha confermato il collegamento della linea di credito 4BID al WABA."
    await persistBillingHealth(supabase, { status: "error", last_error: error })
    return {
      ok: false,
      status: "error",
      currency: discovered.currency,
      creditLineId: discovered.creditLineId,
      error,
    }
  }

  await persistBillingHealth(supabase, { status: "ready", last_error: null })
  return {
    ok: true,
    status: "ready",
    currency: discovered.currency,
    creditLineId: discovered.creditLineId,
    allocationConfigId: String(allocationConfigId),
  }
}
