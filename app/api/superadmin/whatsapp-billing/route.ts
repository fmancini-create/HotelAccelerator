import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { attachPlatformBillingToWaba, discoverPlatformCreditLine, getPlatformBillingConfig } from "@/lib/whatsapp/platform-billing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function requireSuperAdmin(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity) return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  if (!identity.isSuperAdmin) return { error: NextResponse.json({ error: "Accesso riservato al superadmin" }, { status: 403 }) }
  return { identity }
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request)
  if ("error" in auth) return auth.error

  const supabase = createServiceClient()
  const [billing, channelsResult] = await Promise.all([
    getPlatformBillingConfig(supabase),
    supabase
      .from("messaging_channels")
      .select("id,property_id,display_name,config,is_active")
      .eq("channel_type", "whatsapp")
      .eq("is_active", true)
      .eq("config->>provisioned_via", "business_app_coexistence")
      .order("created_at", { ascending: true }),
  ])

  if (channelsResult.error) {
    return NextResponse.json({ error: "Impossibile leggere i canali WhatsApp" }, { status: 500 })
  }

  const channels = (channelsResult.data ?? []).map((row: any) => ({
    id: row.id,
    property_id: row.property_id,
    display_name: row.display_name,
    display_phone_number: row.config?.display_phone_number ?? null,
    waba_id: row.config?.waba_id ?? null,
    billing_status: row.config?.platform_billing_status ?? "pending",
    billing_currency: row.config?.platform_billing_currency ?? billing?.currency ?? "EUR",
    billing_checked_at: row.config?.platform_billing_checked_at ?? null,
    billing_error: row.config?.platform_billing_error ?? null,
    allocation_config_id: row.config?.platform_billing_allocation_config_id ?? null,
  }))

  return NextResponse.json({ billing, channels })
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request)
  if ("error" in auth) return auth.error

  const supabase = createServiceClient()
  const discovery = await discoverPlatformCreditLine(supabase)
  if (!discovery.ok) {
    return NextResponse.json({ success: false, platform: discovery, reconciled: 0 }, { status: 409 })
  }

  const { data, error } = await supabase
    .from("messaging_channels")
    .select("id,property_id,config")
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)
    .eq("config->>provisioned_via", "business_app_coexistence")
    .limit(200)
  if (error) return NextResponse.json({ error: "Impossibile leggere i canali WhatsApp" }, { status: 500 })

  let reconciled = 0
  const failures: Array<{ channel_id: string; property_id: string; error: string }> = []
  for (const row of data ?? []) {
    const config = (row.config ?? {}) as Record<string, unknown>
    if (String(config.platform_billing_allocation_config_id ?? "").trim()) continue
    const wabaId = String(config.waba_id ?? "").trim()
    if (!wabaId) continue

    const result = await attachPlatformBillingToWaba(supabase, wabaId)
    const now = new Date().toISOString()
    const nextConfig = {
      ...config,
      platform_billing_managed_by: "4bid",
      platform_billing_status: result.status,
      platform_billing_currency: result.currency,
      platform_billing_credit_line_id: result.creditLineId ?? null,
      platform_billing_allocation_config_id: result.allocationConfigId ?? null,
      platform_billing_checked_at: now,
      platform_billing_error: result.ok ? null : result.error ?? "Platform billing not ready",
    }
    const { error: updateError } = await supabase
      .from("messaging_channels")
      .update({ config: nextConfig, updated_at: now })
      .eq("id", row.id)
      .eq("property_id", row.property_id)
      .eq("channel_type", "whatsapp")

    if (result.ok && !updateError) reconciled += 1
    else failures.push({
      channel_id: row.id,
      property_id: row.property_id,
      error: updateError?.message || result.error || "Errore sconosciuto",
    })
  }

  return NextResponse.json({ success: failures.length === 0, platform: discovery, reconciled, failures })
}
