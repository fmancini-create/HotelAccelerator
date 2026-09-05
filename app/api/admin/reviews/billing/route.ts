import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getSuiteAddonEntitlementForTenant } from "@/lib/suite-addons/entitlements"
import { getReviewsBillingProfile, saveReviewsBillingProfile } from "@/lib/suite-addons/reviews-billing"
import { resolveSuiteCustomerAccountId } from "@/lib/suite-addons/entitlements"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function identity(request: NextRequest) {
  const caller = await getCallerIdentity(request)
  if (!caller?.propertyId) return { error: response({ error: "unauthorized" }, 401) } as const
  if (!caller.isTenantAdmin && !caller.isSuperAdmin) return { error: response({ error: "forbidden" }, 403) } as const
  return { propertyId: caller.propertyId } as const
}

export async function GET(request: NextRequest) {
  const auth = await identity(request)
  if ("error" in auth) return auth.error
  try {
    const accountId = await resolveSuiteCustomerAccountId({ productKey: "hotelaccelerator", externalTenantId: auth.propertyId })
    const [profile, entitlement] = await Promise.all([
      accountId ? getReviewsBillingProfile(accountId) : null,
      getSuiteAddonEntitlementForTenant({ productKey: "hotelaccelerator", externalTenantId: auth.propertyId, addonKey: "reviews" }),
    ])
    return response({ profile, entitlement })
  } catch (error) {
    console.error("[reviews-billing] HA read failed", error)
    return response({ error: "billing_read_failed" }, 500)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await identity(request)
  if ("error" in auth) return auth.error
  const body = (await request.json().catch(() => null)) as { accommodationCount?: unknown } | null
  const accommodationCount = Number(body?.accommodationCount)
  try {
    const saved = await saveReviewsBillingProfile({
      productKey: "hotelaccelerator",
      externalTenantId: auth.propertyId,
      accommodationCount,
    })
    return response({ success: true, profile: { accommodationCount: saved.accommodationCount, confirmedAt: saved.confirmedAt } })
  } catch (error) {
    const code = error instanceof Error ? error.message : "billing_write_failed"
    return response({ error: code }, code === "invalid_accommodation_count" ? 400 : 500)
  }
}

async function proxyCore(request: NextRequest, path: string, body: Record<string, unknown>) {
  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_HA?.trim()
  if (!key) return response({ error: "registry_not_configured" }, 503)
  const url = new URL(path, request.url)
  const upstream = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-4BID-Product": "hotelaccelerator",
      "X-4BID-Registry-Key": key,
    },
    body: JSON.stringify(body),
  })
  const payload = await upstream.json().catch(() => ({ error: "invalid_upstream_response" }))
  return response(payload, upstream.status)
}

export async function POST(request: NextRequest) {
  const auth = await identity(request)
  if ("error" in auth) return auth.error
  const body = (await request.json().catch(() => null)) as { action?: unknown; billingCycle?: unknown; sessionId?: unknown } | null
  if (body?.action === "verify") {
    return proxyCore(request, "/api/integrations/addons/v1/checkout/verify", {
      externalTenantId: auth.propertyId,
      sessionId: body.sessionId,
    })
  }
  return proxyCore(request, "/api/integrations/addons/v1/checkout", {
    externalTenantId: auth.propertyId,
    billingCycle: body?.billingCycle === "yearly" ? "yearly" : "monthly",
  })
}
