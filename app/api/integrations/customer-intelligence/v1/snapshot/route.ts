import { NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type SnapshotInput = {
  tenant_ref?: string
  status?: string | null
  plan?: string | null
  mrr_cents?: number | null
  usage_score?: number | null
  health_score?: number | null
  onboarding_status?: string | null
  last_activity_at?: string | null
  renewal_at?: string | null
  metrics?: Record<string, unknown> | null
  profile?: {
    display_name?: string | null
    account_type?: string | null
    structures_count?: number | null
    rooms_count?: number | null
    city?: string | null
    province?: string | null
    region?: string | null
    country?: string | null
    website?: string | null
  }
}

const SNAPSHOT_STATUSES = new Set([
  "unknown",
  "trial",
  "onboarding",
  "active",
  "paused",
  "suspended",
  "past_due",
  "churned",
])

const ACCOUNT_TYPES = new Set([
  "hotel_single",
  "hotel_group",
  "chain",
  "resort",
  "agriturismo",
  "bnb",
  "residence",
  "camping",
  "vacation_rental",
  "consulting",
  "company",
  "other",
  "unknown",
])

function boundedScore(value: unknown) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, Math.round(number)))
}

function nonNegativeInt(value: unknown) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.round(number))
}

function isoOrNull(value: unknown) {
  if (!value || typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normalizeStatus(value: unknown) {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "unknown"
  if (status === "trialing") return "trial"
  if (["pending", "pending_review", "in_progress", "changes_requested"].includes(status)) return "onboarding"
  if (["cancelled", "canceled", "expired"].includes(status)) return "churned"
  return SNAPSHOT_STATUSES.has(status) ? status : "unknown"
}

function healthStatus(score: number) {
  if (score < 35) return "critical"
  if (score < 55) return "risk"
  if (score < 70) return "watch"
  return "healthy"
}

async function refreshDerivedProfile(customerAccountId: string) {
  const db = createServiceClient()
  const { data, error } = await db
    .from("platform_customer_product_snapshots")
    .select("health_score, usage_score, last_activity_at")
    .eq("customer_account_id", customerAccountId)
    .in("status", ["active", "trial", "onboarding"])

  if (error) throw error
  const rows = (data ?? []) as Array<{ health_score: number | null; usage_score: number | null; last_activity_at: string | null }>
  const healthValues = rows.map((row) => row.health_score).filter((value): value is number => typeof value === "number")
  const usageValues = rows.map((row) => row.usage_score).filter((value): value is number => typeof value === "number")
  const lastTouch = rows
    .map((row) => row.last_activity_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (healthValues.length) {
    const average = healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length
    const weakest = Math.min(...healthValues)
    const score = Math.round(average * 0.7 + weakest * 0.3)
    updates.health_score = score
    updates.health_status = healthStatus(score)
  }
  if (usageValues.length) {
    updates.adoption_score = Math.round(usageValues.reduce((sum, value) => sum + value, 0) / usageValues.length)
  }
  if (typeof updates.health_score === "number" || typeof updates.adoption_score === "number") {
    const health = typeof updates.health_score === "number" ? updates.health_score : 60
    const adoption = typeof updates.adoption_score === "number" ? updates.adoption_score : 60
    updates.churn_risk_score = Math.max(0, Math.min(100, Math.round(100 - (health * 0.7 + adoption * 0.3))))
  }
  if (lastTouch) updates.last_touch_at = lastTouch

  const { error: updateError } = await db
    .from("platform_customer_profiles")
    .update(updates)
    .eq("customer_account_id", customerAccountId)
  if (updateError) throw updateError
}

export async function POST(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || product.key === "hotelaccelerator") {
    return NextResponse.json({ error: "Prodotto satellite non valido" }, { status: 400 })
  }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return NextResponse.json({ error: "Integrazione non configurata" }, { status: 503 })
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: SnapshotInput
  try {
    body = (await request.json()) as SnapshotInput
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const tenantRef = body.tenant_ref?.trim()
  if (!tenantRef) return NextResponse.json({ error: "tenant_ref obbligatorio" }, { status: 400 })

  const db = createServiceClient()
  const { data: link, error: linkError } = await db
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", product.key)
    .eq("external_tenant_id", tenantRef)
    .maybeSingle()
  if (linkError) throw linkError
  if (!link?.customer_account_id) return NextResponse.json({ error: "Tenant non registrato nella suite" }, { status: 404 })

  const now = new Date().toISOString()
  const usageScore = boundedScore(body.usage_score)
  const healthScore = boundedScore(body.health_score)
  const mrrCents = nonNegativeInt(body.mrr_cents)
  const snapshot = {
    customer_account_id: link.customer_account_id,
    product_key: product.key,
    external_tenant_id: tenantRef,
    status: normalizeStatus(body.status),
    plan: typeof body.plan === "string" ? body.plan.trim() || null : null,
    mrr_cents: mrrCents,
    usage_score: usageScore,
    health_score: healthScore,
    onboarding_status: typeof body.onboarding_status === "string" ? body.onboarding_status.trim() || null : null,
    last_activity_at: isoOrNull(body.last_activity_at),
    renewal_at: isoOrNull(body.renewal_at),
    metrics: body.metrics && typeof body.metrics === "object" ? body.metrics : {},
    last_synced_at: now,
    updated_at: now,
  }

  const { error: snapshotError } = await db
    .from("platform_customer_product_snapshots")
    .upsert(snapshot, { onConflict: "customer_account_id,product_key" })
  if (snapshotError) throw snapshotError

  const profileHints = body.profile ?? {}
  const { data: existingProfile, error: profileReadError } = await db
    .from("platform_customer_profiles")
    .select("display_name, account_type, structures_count, rooms_count, city, province, region, country, website")
    .eq("customer_account_id", link.customer_account_id)
    .maybeSingle()
  if (profileReadError) throw profileReadError

  const profileUpdates: Record<string, unknown> = { updated_at: now }
  const fillText = (key: string, current: unknown, incoming: unknown) => {
    if ((!current || String(current).trim() === "") && typeof incoming === "string" && incoming.trim()) profileUpdates[key] = incoming.trim()
  }
  fillText("display_name", existingProfile?.display_name, profileHints.display_name)
  fillText("city", existingProfile?.city, profileHints.city)
  fillText("province", existingProfile?.province, profileHints.province)
  fillText("region", existingProfile?.region, profileHints.region)
  fillText("country", existingProfile?.country, profileHints.country)
  fillText("website", existingProfile?.website, profileHints.website)
  if ((!existingProfile?.account_type || existingProfile.account_type === "unknown") && typeof profileHints.account_type === "string" && ACCOUNT_TYPES.has(profileHints.account_type)) {
    profileUpdates.account_type = profileHints.account_type
  }
  const structuresCount = nonNegativeInt(profileHints.structures_count)
  const roomsCount = nonNegativeInt(profileHints.rooms_count)
  if ((existingProfile?.structures_count ?? 1) <= 1 && structuresCount !== null) profileUpdates.structures_count = structuresCount
  if (existingProfile?.rooms_count == null && roomsCount !== null) profileUpdates.rooms_count = roomsCount

  const { error: profileWriteError } = await db
    .from("platform_customer_profiles")
    .upsert({ customer_account_id: link.customer_account_id, ...profileUpdates }, { onConflict: "customer_account_id" })
  if (profileWriteError) throw profileWriteError

  await refreshDerivedProfile(link.customer_account_id)

  return NextResponse.json({ ok: true, customer_account_id: link.customer_account_id, product: product.key, auth: auth.method })
}
