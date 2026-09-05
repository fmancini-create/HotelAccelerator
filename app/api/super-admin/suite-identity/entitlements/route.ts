import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"

const PRODUCTS = new Set(["hotelaccelerator", "santaddeo", "hotelprofitai", "manubot"])
const STATUSES = new Set(["active", "trial", "inactive", "suspended", "cancelled"])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const actor = await getCallerIdentity(request)
  if (!actor) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  if (!actor.isSuperAdmin) return NextResponse.json({ error: "Accesso riservato al SuperAdmin" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    customerAccountId?: unknown
    productKey?: unknown
    status?: unknown
    expiresAt?: unknown
  } | null

  const customerAccountId = typeof body?.customerAccountId === "string" ? body.customerAccountId.trim() : ""
  const productKey = typeof body?.productKey === "string" ? body.productKey.trim().toLowerCase() : ""
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : ""
  const expiresAt = typeof body?.expiresAt === "string" && body.expiresAt.trim() ? body.expiresAt.trim() : null

  if (!UUID_RE.test(customerAccountId) || !PRODUCTS.has(productKey) || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 })
  }
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    return NextResponse.json({ error: "Scadenza non valida" }, { status: 400 })
  }

  const sb = createServiceClient()
  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id, property_id")
    .eq("id", customerAccountId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account) return NextResponse.json({ error: "Account suite non trovato" }, { status: 404 })

  const activatedAt = status === "active" || status === "trial" ? new Date().toISOString() : null
  const { data, error } = await sb
    .from("suite_product_entitlements")
    .upsert(
      {
        customer_account_id: customerAccountId,
        product_key: productKey,
        status,
        activated_at: activatedAt,
        expires_at: expiresAt,
        source: "superadmin",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_account_id,product_key" },
    )
    .select("customer_account_id, product_key, status, activated_at, expires_at")
    .single()
  if (error) throw error

  // If HA already exists, keep the local module guard aligned for satellite
  // products. Standalone accounts have no property yet, so activation remains
  // account-level until HA is provisioned.
  if (account.property_id && productKey !== "hotelaccelerator") {
    await sb.from("tenant_modules").upsert(
      {
        property_id: account.property_id,
        module_key: productKey,
        status: status === "trial" ? "trial" : status === "active" ? "active" : "inactive",
        activated_at: activatedAt,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,module_key" },
    )
  }

  return NextResponse.json({ entitlement: data }, { headers: { "Cache-Control": "no-store" } })
}
