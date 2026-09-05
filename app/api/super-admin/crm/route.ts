import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { SuperAdminService } from "@/lib/platform-services"
import {
  buildSystemSegments,
  calculateCrossSell,
  PLATFORM_PRODUCT_KEYS,
  type PlatformCustomerAccount,
  type PlatformCustomerProfile,
  type PlatformProductKey,
  type PlatformProductState,
} from "@/lib/platform/customer-intelligence"

type CustomerAccountRow = {
  id: string
  account_number: number | string
  property_id: string | null
  created_at: string
}

type EntitlementRow = {
  customer_account_id: string
  product_key: string
  status: string
  activated_at: string | null
  expires_at: string | null
  source?: string | null
}

type TenantLinkRow = {
  customer_account_id: string
  product_key: string
  external_tenant_id: string
}

type SnapshotRow = Record<string, unknown> & {
  customer_account_id: string
  product_key: string
}

type PropertyRow = {
  id: string
  name: string | null
  slug: string | null
  type: string | null
  plan: string | null
  subscription_status: string | null
  monthly_price_cents: number | null
  billing_company_name: string | null
  billing_city: string | null
  billing_province: string | null
  trial_ends_at: string | null
}

type ProspectRow = {
  id: string
  sales_stage: string
  lead_score: number
  next_action_at: string | null
  status: string
  organization_name: string | null
  full_name: string | null
  job_title: string | null
  country: string | null
  region: string | null
  city: string | null
  created_at: string
}

const EDITABLE_PROFILE_FIELDS = new Set([
  "display_name",
  "legal_name",
  "lifecycle_stage",
  "account_type",
  "source",
  "structures_count",
  "rooms_count",
  "city",
  "province",
  "region",
  "country",
  "website",
  "customer_tier",
  "health_status",
  "health_score",
  "adoption_score",
  "churn_risk_score",
  "satisfaction_score",
  "potential_value_cents",
  "mrr_override_cents",
  "next_renewal_at",
  "last_touch_at",
  "owner_label",
  "tags",
  "tech_stack",
  "notes",
  "metadata",
])

async function requirePlatformAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
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

    const [accountsRes, profilesRes, entitlementsRes, linksRes, snapshotsRes, propertiesRes, fourBidRes] =
      await Promise.all([
        db.from("customer_accounts").select("id, account_number, property_id, created_at").order("account_number"),
        db.from("platform_customer_profiles").select("*"),
        db
          .from("suite_product_entitlements")
          .select("customer_account_id, product_key, status, activated_at, expires_at, source"),
        db.from("suite_tenant_links").select("customer_account_id, product_key, external_tenant_id"),
        db.from("platform_customer_product_snapshots").select("*"),
        db
          .from("properties")
          .select(
            "id, name, slug, type, plan, subscription_status, monthly_price_cents, billing_company_name, billing_city, billing_province, trial_ends_at",
          ),
        db.from("properties").select("id").eq("slug", "4bid").eq("type", "company").maybeSingle(),
      ])

    for (const result of [
      accountsRes,
      profilesRes,
      entitlementsRes,
      linksRes,
      snapshotsRes,
      propertiesRes,
      fourBidRes,
    ]) {
      if (result.error) throw result.error
    }

    const accountRows = (accountsRes.data ?? []) as CustomerAccountRow[]
    const profileRows = (profilesRes.data ?? []) as PlatformCustomerProfile[]
    const entitlementRows = (entitlementsRes.data ?? []) as EntitlementRow[]
    const linkRows = (linksRes.data ?? []) as TenantLinkRow[]
    const snapshotRows = (snapshotsRes.data ?? []) as SnapshotRow[]
    const propertyRows = (propertiesRes.data ?? []) as PropertyRow[]

    // Il Super Admin CRM usa i prospect commerciali del tenant 4BID e nessun altro.
    // Il service client bypassa RLS: il filtro property_id deve quindi essere esplicito.
    const fourBidPropertyId = (fourBidRes.data as { id?: string } | null)?.id ?? null
    const scopedProspectsRes = fourBidPropertyId
      ? await db
          .from("crm_apollo_prospects")
          .select(
            "id, sales_stage, lead_score, next_action_at, status, organization_name, full_name, job_title, country, region, city, created_at",
          )
          .eq("property_id", fourBidPropertyId)
          .order("created_at", { ascending: false })
      : { data: [], error: null }
    if (scopedProspectsRes.error) throw scopedProspectsRes.error
    const scopedProspects = (scopedProspectsRes.data ?? []) as ProspectRow[]

    const profiles = new Map<string, PlatformCustomerProfile>(
      profileRows.map((row) => [row.customer_account_id, row]),
    )

    const links = new Map<string, Map<string, string>>()
    for (const row of linkRows) {
      const current = links.get(row.customer_account_id) ?? new Map<string, string>()
      current.set(row.product_key, row.external_tenant_id)
      links.set(row.customer_account_id, current)
    }

    const snapshots = new Map<string, Map<string, SnapshotRow>>()
    for (const row of snapshotRows) {
      const current = snapshots.get(row.customer_account_id) ?? new Map<string, SnapshotRow>()
      current.set(row.product_key, row)
      snapshots.set(row.customer_account_id, current)
    }

    const entitlements = new Map<string, EntitlementRow[]>()
    for (const row of entitlementRows) {
      const current = entitlements.get(row.customer_account_id) ?? []
      current.push(row)
      entitlements.set(row.customer_account_id, current)
    }

    const properties = new Map<string, PropertyRow>(propertyRows.map((row) => [row.id, row]))

    const accounts: PlatformCustomerAccount[] = accountRows.map((row) => {
      const property = row.property_id ? properties.get(row.property_id) ?? null : null
      const storedProfile = profiles.get(row.id)
      const profile: PlatformCustomerProfile = storedProfile ? { ...storedProfile } : emptyProfile(row.id)

      if (!profile.display_name && property?.name) profile.display_name = property.name
      if (!profile.legal_name && property?.billing_company_name) profile.legal_name = property.billing_company_name
      if (!profile.city && property?.billing_city) profile.city = property.billing_city
      if (!profile.province && property?.billing_province) profile.province = property.billing_province

      const accountEntitlements = entitlements.get(row.id) ?? []
      const accountSnapshots = snapshots.get(row.id) ?? new Map<string, SnapshotRow>()
      const accountLinks = links.get(row.id) ?? new Map<string, string>()

      const products: PlatformProductState[] = accountEntitlements
        .filter((item) => (PLATFORM_PRODUCT_KEYS as readonly string[]).includes(item.product_key))
        .map((item) => {
          const key = item.product_key as PlatformProductKey
          const snapshot = accountSnapshots.get(key)
          const snapshotValue = (field: string) => snapshot?.[field]
          const rawMetrics = snapshotValue("metrics")
          return {
            product_key: key,
            status: String(snapshotValue("status") ?? item.status ?? "unknown"),
            external_tenant_id: String(snapshotValue("external_tenant_id") ?? accountLinks.get(key) ?? "") || null,
            activated_at: item.activated_at,
            expires_at: item.expires_at,
            plan:
              typeof snapshotValue("plan") === "string"
                ? String(snapshotValue("plan"))
                : key === "hotelaccelerator"
                  ? property?.plan ?? null
                  : null,
            mrr_cents:
              typeof snapshotValue("mrr_cents") === "number"
                ? Number(snapshotValue("mrr_cents"))
                : key === "hotelaccelerator"
                  ? Number(property?.monthly_price_cents ?? 0)
                  : null,
            usage_score:
              typeof snapshotValue("usage_score") === "number" ? Number(snapshotValue("usage_score")) : null,
            health_score:
              typeof snapshotValue("health_score") === "number" ? Number(snapshotValue("health_score")) : null,
            onboarding_status:
              typeof snapshotValue("onboarding_status") === "string"
                ? String(snapshotValue("onboarding_status"))
                : null,
            last_activity_at:
              typeof snapshotValue("last_activity_at") === "string"
                ? String(snapshotValue("last_activity_at"))
                : null,
            renewal_at:
              typeof snapshotValue("renewal_at") === "string" ? String(snapshotValue("renewal_at")) : null,
            last_synced_at:
              typeof snapshotValue("last_synced_at") === "string"
                ? String(snapshotValue("last_synced_at"))
                : null,
            metrics:
              rawMetrics && typeof rawMetrics === "object" && !Array.isArray(rawMetrics)
                ? (rawMetrics as Record<string, unknown>)
                : {},
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

    const systemSegments = buildSystemSegments(
      accounts,
      scopedProspects.map((prospect) => ({
        id: prospect.id,
        sales_stage: prospect.sales_stage,
        lead_score: prospect.lead_score,
        next_action_at: prospect.next_action_at,
        status: prospect.status,
      })),
    )

    const crossSell = accounts
      .filter((account) => account.profile.lifecycle_stage !== "internal")
      .flatMap((account) =>
        calculateCrossSell(account)
          .filter((opportunity) => opportunity.score >= 50)
          .map((opportunity) => ({
            account_id: account.id,
            account_number: account.account_number,
            name:
              account.profile.display_name ||
              account.profile.legal_name ||
              `Cliente #${account.account_number}`,
            ...opportunity,
          })),
      )
      .sort((a, b) => b.score - a.score)

    const customers = accounts.filter((account) => account.profile.lifecycle_stage !== "internal")
    const activeProducts = customers.reduce(
      (sum, account) =>
        sum + account.products.filter((product) => ["active", "trial", "onboarding"].includes(product.status)).length,
      0,
    )
    const suiteComplete = customers.filter((account) =>
      PLATFORM_PRODUCT_KEYS.every((key) =>
        account.products.some(
          (product) =>
            product.product_key === key && ["active", "trial", "onboarding"].includes(product.status),
        ),
      ),
    ).length
    const knownMrr = customers.reduce(
      (sum, account) =>
        sum +
        (account.profile.mrr_override_cents ??
          account.products.reduce((productSum, product) => productSum + (product.mrr_cents ?? 0), 0)),
      0,
    )

    return NextResponse.json({
      accounts,
      prospects: scopedProspects,
      systemSegments,
      crossSell,
      stats: {
        customers: customers.length,
        prospects: scopedProspects.length,
        activeProducts,
        multiProduct: customers.filter(
          (account) =>
            account.products.filter((product) => ["active", "trial", "onboarding"].includes(product.status)).length >= 2,
        ).length,
        suiteComplete,
        atRisk: customers.filter(
          (account) =>
            ["risk", "critical"].includes(account.profile.health_status) ||
            account.profile.lifecycle_stage === "at_risk",
        ).length,
        knownMrrCents: knownMrr,
      },
    })
  } catch (error) {
    console.error("[super-admin-crm] GET failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile caricare il CRM 4BID" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = (await request.json()) as {
      customer_account_id?: string
      updates?: Record<string, unknown>
    }
    if (!body.customer_account_id || !body.updates || typeof body.updates !== "object") {
      return NextResponse.json({ error: "customer_account_id e updates sono obbligatori" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body.updates)) {
      if (EDITABLE_PROFILE_FIELDS.has(key)) updates[key] = value
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nessun campo modificabile" }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const db = createServiceClient()
    const { data, error } = await db
      .from("platform_customer_profiles")
      .upsert({ customer_account_id: body.customer_account_id, ...updates }, { onConflict: "customer_account_id" })
      .select("*")
      .single()
    if (error) throw error
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error("[super-admin-crm] PATCH failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile aggiornare il cliente" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action !== "refresh_registry") {
      return NextResponse.json({ error: "Azione non supportata" }, { status: 400 })
    }

    const db = createServiceClient()
    const [{ data: entitlements, error: entitlementError }, { data: links, error: linkError }] =
      await Promise.all([
        db
          .from("suite_product_entitlements")
          .select("customer_account_id, product_key, status, activated_at, expires_at"),
        db.from("suite_tenant_links").select("customer_account_id, product_key, external_tenant_id"),
      ])
    if (entitlementError) throw entitlementError
    if (linkError) throw linkError

    const entitlementRows = (entitlements ?? []) as EntitlementRow[]
    const linkRows = (links ?? []) as TenantLinkRow[]
    const linkMap = new Map<string, string>(
      linkRows.map((row) => [`${row.customer_account_id}:${row.product_key}`, row.external_tenant_id]),
    )
    const now = new Date().toISOString()
    const rows = entitlementRows
      .filter((row) => (PLATFORM_PRODUCT_KEYS as readonly string[]).includes(row.product_key))
      .map((row) => ({
        customer_account_id: row.customer_account_id,
        product_key: row.product_key,
        external_tenant_id: linkMap.get(`${row.customer_account_id}:${row.product_key}`) ?? null,
        status: ["active", "trial"].includes(row.status) ? row.status : "unknown",
        renewal_at: row.expires_at,
        last_synced_at: now,
        updated_at: now,
      }))

    if (rows.length) {
      const { error } = await db
        .from("platform_customer_product_snapshots")
        .upsert(rows, { onConflict: "customer_account_id,product_key" })
      if (error) throw error
    }

    return NextResponse.json({ ok: true, refreshed: rows.length })
  } catch (error) {
    console.error("[super-admin-crm] POST failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aggiornamento non riuscito" },
      { status: 500 },
    )
  }
}
