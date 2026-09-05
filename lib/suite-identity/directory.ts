import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { SUITE_PRODUCTS, SUITE_SSO_CONFIG, type SuiteSsoProduct } from "@/lib/suite-sso/config"
import { linkSuiteIdentity, SuiteIdentityError } from "@/lib/suite-identity/registry"

const ACTIVE_ENTITLEMENTS = new Set(["active", "trial"])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REGISTRY_KEY_BY_PRODUCT: Record<SuiteSsoProduct, string | undefined> = {
  santaddeo: process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT,
  hotelprofitai: process.env.CUSTOMER_CODE_REGISTRY_KEY_HPA,
  manubot: process.env.CUSTOMER_CODE_REGISTRY_KEY_MB,
}

export type SuiteDirectorySource = {
  product: SuiteSsoProduct
  externalTenantId: string
  externalUserId: string
  roleLabel: string | null
  isTenantAdmin: boolean
}

export type SuiteDirectoryUser = {
  key: string
  email: string
  name: string
  sources: SuiteDirectorySource[]
  alreadyActive: boolean
  blockedReason: string | null
}

type SatelliteUser = {
  externalUserId: string
  email: string
  name: string
  roleLabel?: string | null
  isTenantAdmin?: boolean
}

type LinkedProduct = {
  product: SuiteSsoProduct
  externalTenantId: string
}

type EntitlementRow = {
  product_key: string
  status: string
  expires_at: string | null
}

type TenantLinkRow = {
  product_key: string
  external_tenant_id: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function productAuthMode(product: SuiteSsoProduct): "oidc" | "static" | "missing" {
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return "oidc"
  if (REGISTRY_KEY_BY_PRODUCT[product]?.trim()) return "static"
  return "missing"
}

function productHeaders(product: SuiteSsoProduct): Record<string, string> {
  // Production-to-production calls use the short-lived Vercel project identity.
  // Static per-product keys remain only as a recovery/local-development fallback.
  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim()
  if (oidcToken) return { Authorization: `Bearer ${oidcToken}` }

  const key = REGISTRY_KEY_BY_PRODUCT[product]?.trim()
  return key ? { "X-4BID-Registry-Key": key } : {}
}

async function customerContextForProperty(propertyId: string) {
  const sb = createServiceClient()
  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.id) throw new SuiteIdentityError("account_missing", 404, "Account suite non trovato")

  const [{ data: links, error: linksError }, { data: entitlements, error: entitlementsError }] = await Promise.all([
    sb
      .from("suite_tenant_links")
      .select("product_key, external_tenant_id")
      .eq("customer_account_id", account.id)
      .in("product_key", [...SUITE_PRODUCTS]),
    sb
      .from("suite_product_entitlements")
      .select("product_key, status, expires_at")
      .eq("customer_account_id", account.id),
  ])
  if (linksError) throw linksError
  if (entitlementsError) throw entitlementsError

  const entitlementRows = (entitlements || []) as EntitlementRow[]
  const linkRows = (links || []) as TenantLinkRow[]
  const now = Date.now()
  const activeProducts = new Set(
    entitlementRows
      .filter((row) =>
        ACTIVE_ENTITLEMENTS.has(row.status) &&
        (!row.expires_at || new Date(row.expires_at).getTime() >= now),
      )
      .map((row) => row.product_key),
  )

  const linkedProducts: LinkedProduct[] = linkRows
    .filter((row) => (SUITE_PRODUCTS as readonly string[]).includes(row.product_key) && activeProducts.has(row.product_key))
    .map((row) => ({
      product: row.product_key as SuiteSsoProduct,
      externalTenantId: row.external_tenant_id,
    }))

  return { customerAccountId: account.id as string, linkedProducts, activeProducts }
}

async function fetchSatelliteUsers(link: LinkedProduct): Promise<SatelliteUser[]> {
  const url = new URL("/api/integrations/hotelaccelerator/v1/users", SUITE_SSO_CONFIG[link.product].baseUrl)
  url.searchParams.set("tenant_id", link.externalTenantId)

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
    headers: productHeaders(link.product),
  })
  if (!response.ok) {
    console.warn("[suite-directory] satellite directory unavailable", {
      product: link.product,
      status: response.status,
      auth_method: productAuthMode(link.product),
    })
    throw new Error(`${link.product}_directory_${response.status}`)
  }
  const payload = (await response.json()) as { users?: SatelliteUser[] }
  return Array.isArray(payload.users) ? payload.users : []
}

export async function listSuiteUsersForProperty(propertyId: string): Promise<{
  users: SuiteDirectoryUser[]
  unavailableProducts: SuiteSsoProduct[]
}> {
  if (!UUID_RE.test(propertyId)) throw new SuiteIdentityError("invalid_property", 400, "Tenant non valido")
  const sb = createServiceClient()
  const { linkedProducts } = await customerContextForProperty(propertyId)
  if (!linkedProducts.length) return { users: [], unavailableProducts: [] }

  const settled = await Promise.allSettled(linkedProducts.map(async (link) => ({ link, users: await fetchSatelliteUsers(link) })))
  const unavailableProducts: SuiteSsoProduct[] = []
  const byEmail = new Map<string, { email: string; name: string; sources: SuiteDirectorySource[] }>()

  for (const result of settled) {
    if (result.status === "rejected") {
      const index = settled.indexOf(result)
      const link = linkedProducts[index]
      if (link) unavailableProducts.push(link.product)
      continue
    }
    const { link, users } = result.value
    for (const user of users) {
      if (!UUID_RE.test(user.externalUserId)) continue
      const email = normalizeEmail(user.email || "")
      if (!email.includes("@")) continue
      const current = byEmail.get(email) ?? { email, name: user.name?.trim() || email, sources: [] }
      if ((!current.name || current.name === email) && user.name?.trim()) current.name = user.name.trim()
      if (!current.sources.some((source) => source.product === link.product && source.externalUserId === user.externalUserId)) {
        current.sources.push({
          product: link.product,
          externalTenantId: link.externalTenantId,
          externalUserId: user.externalUserId,
          roleLabel: user.roleLabel?.trim() || null,
          isTenantAdmin: user.isTenantAdmin === true,
        })
      }
      byEmail.set(email, current)
    }
  }

  const emails = [...byEmail.keys()]
  if (!emails.length) return { users: [], unavailableProducts }

  const { data: matches, error: matchesError } = await sb
    .from("admin_users")
    .select("id, email, property_id")
    .in("email", emails)
  if (matchesError) throw matchesError

  const matchesByEmail = new Map<string, Array<{ id: string; property_id: string; email: string }>>()
  for (const match of matches || []) {
    const email = normalizeEmail(match.email)
    const list = matchesByEmail.get(email) ?? []
    list.push(match)
    matchesByEmail.set(email, list)
  }

  const users = [...byEmail.values()]
    .map((candidate) => {
      const existing = matchesByEmail.get(candidate.email) ?? []
      const inCurrentProperty = existing.some((item) => item.property_id === propertyId)
      const inOtherProperty = existing.some((item) => item.property_id !== propertyId)
      return {
        key: candidate.email,
        email: candidate.email,
        name: candidate.name,
        sources: candidate.sources.sort((a, b) => a.product.localeCompare(b.product)),
        alreadyActive: inCurrentProperty,
        blockedReason: !inCurrentProperty && inOtherProperty ? "Email gia associata a un altro tenant HotelAccelerator" : null,
      } satisfies SuiteDirectoryUser
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"))

  return { users, unavailableProducts }
}

async function requireActiveEntitlement(customerAccountId: string, product: string) {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("suite_product_entitlements")
    .select("status, expires_at")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", product)
    .maybeSingle()
  if (error) throw error
  if (!data || !ACTIVE_ENTITLEMENTS.has(data.status)) {
    throw new SuiteIdentityError("product_not_active", 403, `Prodotto ${product} non attivo`)
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new SuiteIdentityError("product_expired", 403, `Prodotto ${product} scaduto`)
  }
}

async function getOrCreateIdentity(customerAccountId: string, email: string, name: string) {
  const sb = createServiceClient()
  const existing = await sb
    .from("suite_identities")
    .select("id, status")
    .eq("customer_account_id", customerAccountId)
    .eq("primary_email", email)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) {
    if (existing.data.status !== "active") throw new SuiteIdentityError("identity_suspended", 403, "Identita suite sospesa")
    return existing.data.id as string
  }

  const created = await sb
    .from("suite_identities")
    .insert({ customer_account_id: customerAccountId, primary_email: email, display_name: name || null })
    .select("id")
    .single()
  if (!created.error && created.data?.id) return created.data.id as string
  if (created.error?.code === "23505") {
    const raced = await sb
      .from("suite_identities")
      .select("id, status")
      .eq("customer_account_id", customerAccountId)
      .eq("primary_email", email)
      .maybeSingle()
    if (raced.error) throw raced.error
    if (raced.data?.id && raced.data.status === "active") return raced.data.id as string
  }
  throw created.error ?? new Error("suite identity creation failed")
}

export async function activateSuiteUserForProperty(input: {
  propertyId: string
  product: SuiteSsoProduct
  externalUserId: string
}) {
  if (!UUID_RE.test(input.propertyId) || !UUID_RE.test(input.externalUserId)) {
    throw new SuiteIdentityError("invalid_activation", 400, "Richiesta di attivazione non valida")
  }

  const sb = createServiceClient()
  const { customerAccountId, linkedProducts, activeProducts } = await customerContextForProperty(input.propertyId)
  if (!activeProducts.has("hotelaccelerator")) {
    throw new SuiteIdentityError("hotelaccelerator_not_active", 403, "HotelAccelerator non attivo")
  }

  const link = linkedProducts.find((item) => item.product === input.product)
  if (!link) throw new SuiteIdentityError("source_not_linked", 404, "Prodotto sorgente non collegato al tenant")
  await requireActiveEntitlement(customerAccountId, input.product)

  const sourceUsers = await fetchSatelliteUsers(link)
  const sourceUser = sourceUsers.find((user) => user.externalUserId === input.externalUserId)
  if (!sourceUser) throw new SuiteIdentityError("source_user_missing", 404, "Utente non trovato nel tenant sorgente")

  const email = normalizeEmail(sourceUser.email || "")
  if (!email.includes("@")) throw new SuiteIdentityError("invalid_email", 400, "Email sorgente non valida")
  const name = sourceUser.name?.trim() || email

  const { data: matches, error: matchError } = await sb
    .from("admin_users")
    .select("id, property_id, email, name, role, is_tenant_admin")
    .ilike("email", email)
    .limit(2)
  if (matchError) throw matchError
  if ((matches?.length ?? 0) > 1) throw new SuiteIdentityError("duplicate_email", 409, "Email duplicata nel Core")
  const existing = matches?.[0] ?? null
  if (existing && existing.property_id !== input.propertyId) {
    throw new SuiteIdentityError("email_owned_by_other_tenant", 409, "Email gia associata a un altro tenant")
  }

  const suiteIdentityId = await getOrCreateIdentity(customerAccountId, email, name)
  await linkSuiteIdentity({
    suiteIdentityId,
    product: input.product,
    externalTenantId: link.externalTenantId,
    externalUserId: sourceUser.externalUserId,
    email,
    roleLabel: sourceUser.roleLabel ?? null,
    isTenantAdmin: sourceUser.isTenantAdmin === true,
  })

  if (existing) {
    const auth = await sb.auth.admin.getUserById(existing.id)
    if (auth.error || !auth.data.user) throw new SuiteIdentityError("auth_user_missing", 409, "Profilo HotelAccelerator senza account di autenticazione")
    const metadata = auth.data.user.app_metadata ?? {}
    if (metadata.suite_identity_id && metadata.suite_identity_id !== suiteIdentityId) {
      throw new SuiteIdentityError("auth_identity_conflict", 409, "Account HotelAccelerator collegato a un'altra identita suite")
    }
    const updated = await sb.auth.admin.updateUserById(existing.id, { app_metadata: { ...metadata, suite_identity_id: suiteIdentityId } })
    if (updated.error) throw updated.error
    await linkSuiteIdentity({
      suiteIdentityId,
      product: "hotelaccelerator",
      externalTenantId: input.propertyId,
      externalUserId: existing.id,
      email,
      roleLabel: existing.role,
      isTenantAdmin: existing.is_tenant_admin === true,
    })
    return { user: existing, created: false }
  }

  const authCreated = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, source: "4bid-suite-directory" },
    app_metadata: { suite_identity_id: suiteIdentityId },
  })
  if (authCreated.error || !authCreated.data.user) {
    throw new SuiteIdentityError("auth_user_conflict", 409, "Account di autenticazione gia presente o non creabile")
  }

  const authUserId = authCreated.data.user.id
  const inserted = await sb
    .from("admin_users")
    .insert({
      id: authUserId,
      property_id: input.propertyId,
      email,
      name,
      role: "editor",
      is_tenant_admin: false,
      can_upload: true,
      can_delete: false,
      can_move: true,
      can_manage_users: false,
    })
    .select("id, property_id, email, name, role, is_tenant_admin")
    .single()

  if (inserted.error || !inserted.data) {
    await sb.auth.admin.deleteUser(authUserId).catch(() => {})
    throw inserted.error ?? new Error("admin user creation failed")
  }

  try {
    await linkSuiteIdentity({
      suiteIdentityId,
      product: "hotelaccelerator",
      externalTenantId: input.propertyId,
      externalUserId: authUserId,
      email,
      roleLabel: "editor",
      isTenantAdmin: false,
    })
  } catch (error) {
    await sb.from("admin_users").delete().eq("id", authUserId).eq("property_id", input.propertyId)
    await sb.auth.admin.deleteUser(authUserId).catch(() => {})
    throw error
  }

  console.info("[suite-directory] user activated", {
    property_id: input.propertyId,
    product: input.product,
    external_user_id: input.externalUserId,
    hotelaccelerator_user_id: authUserId,
  })
  return { user: inserted.data, created: true }
}
