import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { attachPlatformBillingToWaba } from "@/lib/whatsapp/platform-billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

/**
 * Single owner for platform-managed WhatsApp billing reconciliation.
 *
 * Only WABAs provisioned through HotelAccelerator Embedded Signup are eligible.
 * Tenant/manual Meta configurations are never modified. Each successful WABA
 * persists its Meta allocation_config_id in messaging_channels.config so the
 * operation is idempotent and future runs skip it.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("messaging_channels")
    .select("id,property_id,config,is_active")
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)
    .eq("config->>provisioned_via", "business_app_coexistence")
    .limit(200)

  if (error) {
    console.error("[WhatsApp billing cron] channel read failed:", error)
    return NextResponse.json({ error: "channel_read_failed" }, { status: 500 })
  }

  const candidates = (data ?? []).filter((row: any) => {
    const config = (row.config ?? {}) as Record<string, unknown>
    const allocation = String(config.platform_billing_allocation_config_id ?? "").trim()
    const wabaId = String(config.waba_id ?? "").trim()
    return Boolean(wabaId && !allocation)
  })

  let ready = 0
  let blocked = 0
  let failed = 0
  const failures: Array<{ channel_id: string; property_id: string; error: string }> = []

  // Sequential on purpose: credit-line operations are financial configuration,
  // and there is no value in a burst of concurrent writes against Meta.
  for (const row of candidates as any[]) {
    const config = (row.config ?? {}) as Record<string, unknown>
    const wabaId = String(config.waba_id ?? "").trim()
    const result = await attachPlatformBillingToWaba(supabase, wabaId)
    const now = new Date().toISOString()

    if (result.ok && result.allocationConfigId) {
      const nextConfig = {
        ...config,
        platform_billing_managed_by: "4bid",
        platform_billing_status: "ready",
        platform_billing_currency: result.currency,
        platform_billing_credit_line_id: result.creditLineId,
        platform_billing_allocation_config_id: result.allocationConfigId,
        platform_billing_checked_at: now,
        platform_billing_error: null,
      }
      const { error: updateError } = await supabase
        .from("messaging_channels")
        .update({ config: nextConfig, updated_at: now })
        .eq("id", row.id)
        .eq("property_id", row.property_id)
        .eq("channel_type", "whatsapp")
      if (updateError) {
        failed += 1
        failures.push({ channel_id: row.id, property_id: row.property_id, error: updateError.message })
      } else {
        ready += 1
      }
      continue
    }

    const nextConfig = {
      ...config,
      platform_billing_managed_by: "4bid",
      platform_billing_status: result.status,
      platform_billing_currency: result.currency,
      platform_billing_checked_at: now,
      platform_billing_error: result.error ?? "Platform billing not ready",
    }
    await supabase
      .from("messaging_channels")
      .update({ config: nextConfig, updated_at: now })
      .eq("id", row.id)
      .eq("property_id", row.property_id)
      .eq("channel_type", "whatsapp")

    if (result.status === "blocked") blocked += 1
    else failed += 1
    failures.push({
      channel_id: row.id,
      property_id: row.property_id,
      error: result.error ?? "Platform billing not ready",
    })

    // If 4BID itself is blocked (for example Solution Partner credit line not
    // available), all remaining WABAs would fail for the same platform reason.
    // Stop here rather than hammering Meta and duplicating logs.
    if (result.status === "blocked") break
  }

  return NextResponse.json({
    success: failed === 0 && blocked === 0,
    scanned: data?.length ?? 0,
    candidates: candidates.length,
    ready,
    blocked,
    failed,
    failures: failures.slice(0, 20),
  })
}
