import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { SuperAdminService } from "@/lib/platform-services"
import { buildSystemSegments, calculateCrossSell, PLATFORM_PRODUCT_KEYS, type PlatformCustomerAccount, type PlatformCustomerProfile, type PlatformProductKey, type PlatformProductState } from "@/lib/platform/customer-intelligence"

const EDITABLE_PROFILE_FIELDS = new Set([
  "display_name", "legal_name", "lifecycle_stage", "account_type", "source", "structures_count", "rooms_count",
  "city", "province", "region", "country", "website", "customer_tier", "health_status", "health_score",
  "adoption_score", "churn_risk_score", "satisfaction_score", "potential_value_cents", "mrr_override_cents",
  "next_renewal_at", "last_touch_at", "owner_label", "tags", "tech_stack", "notes", "metadata",
])

async function requirePlatformAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
  return email
}

function emptyProfile(accountId: string): PlatformCustomerProfile {
  return {
    customer_account_id: accountId,
    display_name: null,
    legal_name: null,
    lifecycle_stage: "customer",
    account_type: "unknown",
    source: "suite_registry",
    structures_count: 1,
    rooms_count: null,
    city: null,
    province: null,
    region: null,
    country: null,
    website: null,
    customer_tier: "bronze",
    health_status: "unknown",
    health_score: null,
    adoption_score: null,
    churn_risk_score: null,
    satisfaction_score: null,
    potential_value_cents: null,
    mrr_override_cents: null,
    next_renewal_at: null,
    last_touch_at: null,
    owner_label: null,
    tags: [],
    tech_stack: {},
    notes: null,
    metadata: {},
  }
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const db = createServiceClient()

    const [accountsRes, profilesRes, entitlementsRes, linksRes, snapshotsRes, propertiesRes, fourBidRes, prospectsRes] = await Promise.all([
      db.from("customer_accounts").select("id, account_number, property_id, created_at").order("account_number"),
      db.from("platform_customer_profiles").select("*"),
      db.from("suite_product_entitlements").select("customer_account_id, product_key, status, activated_at, expires_at, source"),
      db.from("suite_tenant_links").select("customer_account_id, product_key, external_tenant_id"),
      db.from("platform_customer_product_snapshots").select("*"),
      db.from("properties").select("id, name, slug, type, plan, subscription_status, monthly_price_cents, billing_company_name, billing_city, billing_province, trial_ends_at"),
      db.from("properties").select("id").eq("slug", "4bid").maybeSingle(),
      db.from("crm_apollo_prospects").select("id, sales_stage, lead_score, next_action_at, status, organization_name, full_name, job_title, country, region, city, created_at").order("created_at", { ascending: false }),
    ])

    for (const result of [accountsRes, profilesRes, entitlementsRes, linksRes, snapshotsRes, propertiesRes, fourBidRes, prospectsRes]) {
      if (result.error) throw result.error
    }

    const fourBidPropertyId = fourBidRes.data?.id ?? null
    const prospects = (prospectsRes.data ?? []).filter((row) => !fourBidPropertyId || (row as Record<string, unknown>).property_id === fourBidPropertyId)
    // La query sopra non include property_id per evitare di esporlo nella risposta; se il tenant 4BID esiste,
    // ripetiamo la lettura tenant-scoped in modo esplicito.
    const scopedProspectsRes = fourBidPropertyId
      ? await db.from("crm_apollo_prospects").select("id, sales_stage, lead_score, next_action_at, status, organization_name, full_name, job_title, country, region, city, created_at").eq("property_id", fourBidPropertyId).order("created_at", { ascending: false })
      : { data: [], error: null }
    if (scopedProspectsRes.error) throw scopedProspectsRes.error
    const scopedProspects = scopedProspectsRes.data ?? []

    const profiles = new Map((profilesRes.data ?? []).map((row) => [row.customer_account_id as string, row as PlatformCustomerProfile]))
    const links = new Map<string, Map<string, string>>()
    for (const row of linksRes.data ?? []) {
      const current = links.get(row.customer_account_id) ?? new Map<string, string>()
      current.set(row.product_key, row.external_tenant_id)
      links.set(row.customer_account_id, current)
    }
    const snapshots = new Map<string, Map<string, Record<string, unknown>>>()
    for (const row of snapshotsRes.data ?? []) {
      const current = snapshots.get(row.customer_account_id) ?? new Map<string, Record<string, unknown>>()
      current.set(row.product_key, row as Record<string, unknown>)
      snapshots.set(row.customer_account_id, current)
    }
    const entitlements = new Map<string, Array<Record<string, unknown>>>()
    for (const row of entitlementsRes.data ?? []) {
      const current = entitlements.get(row.customer_account_id) ?? []
      current.push(row as Record<string, unknown>)
      entitlements.set(row.customer_account_id, current)
    }
    const properties = new Map((propertiesRes.data ?? []).map((row) => [row.id as string, row]))

    const accounts: PlatformCustomerAccount[] = (accountsRes.data ?? []).map((row) => {
      const property = row.property_id ? properties.get(row.property_id) : null
      const profile = profiles.get(row.id) ?? emptyProfile(row.id)
      if (!profile.display_name && property?.name) profile.display_name = property.name
      if (!profile.legal_name && property?.billing_company_name) profile.legal_name = property.billing_company_name
      if (!profile.city && property?.billing_city) profile.city = property.billing_city
      if (!profile.province && property?.billing_province) profile.province = property.billing_province

      const accountEntitlements = entitlements.get(row.id) ?? []
      const accountSnapshots = snapshots.get(row.id) ?? new Map<string, Record<string, unknown>>()
      const accountLinks = links.get(row.id) ?? new Map<string, string>()
      const products: PlatformProductState[] = accountEntitlements
        .filter((item) => (PLATFORM_PRODUCT_KEYS as readonly string[]).includes(String(item.product_key)))
        .map((item) => {
          const key = item.product_key as PlatformProductKey
          const snapshot = accountSnapshots.get(key) ?? {}
          return {
            product_key: key,
            status: String(snapshot.status ?? item.status ?? "unknown"),
            external_tenant_id: String(snapshot.external_tenant_id ?? accountLinks.get(key) ?? "") || null,
            activated_at: typeof item.activated_at === "string" ? item.activated_at : null,
            expires_at: typeof item.expires_at === "string" ? item.expires_at : null,
            plan: typeof snapshot.plan === "string" ? snapshot.plan : key === "hotelaccelerator" ? String(property?.plan ?? "") || null : null,
            mrr_cents: typeof snapshot.mrr_cents === "number" ? snapshot.mrr_cents : key === "hotelaccelerator" ? Number(property?.monthly_price_cents ?? 0) : null,
            usage_score: typeof snapshot.usage_score === "number" ? snapshot.usage_score : null,
            health_score: typeof snapshot.health_score === "number" ? snapshot.health_score : null,
            onboarding_status: typeof snapshot.onboarding_status === "string" ? snapshot.onboarding_status : null,
            last_activity_at: typeof snapshot.last_activity_at === "string" ? snapshot.last_activity_at : null,
            renewal_at: typeof snapshot.renewal_at === "string" ? snapshot.renewal_at : null,
            last_synced_at: typeof snapshot.last_synced_at === "string" ? snapshot.last_synced_at : null,
            metrics: snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics as Record<string, unknown> : {},
          }
        })

      return {
        id: row.id,
        account_number: Number(row.account_number),
        property_id: row.property_id,
        created_at: row.created_at,
        profile,
        products,
      }
    })

    const systemSegments = buildSystemSegments(accounts, scopedProspects.map((p) => ({
      id: p.id,
      sales_stage: p.sales_stage,
      lead_score: p.lead_score,
      next_action_at: p.next_action_at,
      status: p.status,
    })))

    const crossSell = accounts
      .filter((account) => account.profile.lifecycle_stage !== "internal")
      .flatMap((account) => calculateCrossSell(account).filter((opportunity) => opportunity.score >= 50).map((opportunity) => ({ account_id: account.id, account_number: account.account_number, name: account.profile.display_name || account.profile.legal_name || `Cliente #${account.account_number}`, ...opportunity })))
      .sort((a, b) => b.score - a.score)

    const customers = accounts.filter((account) => account.profile.lifecycle_stage !== "internal")
    const activeProducts = customers.reduce((sum, account) => sum + account.products.filter((p) => ["active", "trial", "onboarding"].includes(p.status)).length, 0)
    const suiteComplete = customers.filter((account) => PLATFORM_PRODUCT_KEYS.every((key) => account.products.some((p) => p.product_key === key && ["active", "trial", "onboarding"].includes(p.status)))).length
    const knownMrr = customers.reduce((sum, account) => sum + (account.profile.mrr_override_cents ?? account.products.reduce((productSum, product) => productSum + (product.mrr_cents ?? 0), 0)), 0)

    return NextResponse.json({
      accounts,
      prospects: scopedProspects,
      systemSegments,
      crossSell,
      stats: {
        customers: customers.length,
        prospects: scopedProspects.length,
        activeProducts,
        multiProduct: customers.filter((a) => a.products.filter((p) => ["active", "trial", "onboarding"].includes(p.status)).length >= 2).length,
        suiteComplete,
        atRisk: customers.filter((a) => ["risk", "critical"].includes(a.profile.health_status) || a.profile.lifecycle_stage === "at_risk").length,
        knownMrrCents: knownMrr,
      },
    })
  } catch (error) {
    console.error("[super-admin-crm] GET failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile caricare il CRM 4BID" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = await request.json() as { customer_account_id?: string; updates?: Record<string, unknown> }
    if (!body.customer_account_id || !body.updates || typeof body.updates !== "object") {
      return NextResponse.json({ error: "customer_account_id e updates sono obbligatori" }, { status: 400 })
    }
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body.updates)) if (EDITABLE_PROFILE_FIELDS.has(key)) updates[key] = value
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nessun campo modificabile" }, { status: 400 })
    updates.updated_at = new Date().toISOString()

    const db = createServiceClient()
    const { data, error } = await db.from("platform_customer_profiles").upsert({ customer_account_id: body.customer_account_id, ...updates }, { onConflict: "customer_account_id" }).select("*").single()
    if (error) throw error
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("[super-admin-crm] PATCH failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile aggiornare il cliente" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (body.action !== "refresh_registry") return NextResponse.json({ error: "Azione non supportata" }, { status: 400 })
    const db = createServiceClient()
    const [{ data: entitlements, error: entitlementError }, { data: links, error: linkError }] = await Promise.all([
      db.from("suite_product_entitlements").select("customer_account_id, product_key, status, activated_at, expires_at"),
      db.from("suite_tenant_links").select("customer_account_id, product_key, external_tenant_id"),
    ])
    if (entitlementError) throw entitlementError
    if (linkError) throw linkError
    const linkMap = new Map((links ?? []).map((row) => [`${row.customer_account_id}:${row.product_key}`, row.external_tenant_id]))
    const rows = (entitlements ?? [])
      .filter((row) => (PLATFORM_PRODUCT_KEYS as readonly string[]).includes(row.product_key))
      .map((row) => ({
        customer_account_id: row.customer_account_id,
        product_key: row.product_key,
        external_tenant_id: linkMap.get(`${row.customer_account_id}:${row.product_key}`) ?? null,
        status: ["active", "trial"].includes(row.status) ? row.status : "unknown",
        renewal_at: row.expires_at,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    if (rows.length) {
      const { error } = await db.from("platform_customer_product_snapshots").upsert(rows, { onConflict: "customer_account_id,product_key" })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, refreshed: rows.length })
  } catch (error) {
    console.error("[super-admin-crm] POST failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aggiornamento non riuscito" }, { status: 500 })
  }
}
