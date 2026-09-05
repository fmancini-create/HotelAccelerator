import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { getActiveModuleKeys, setModuleStatus } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteSsoProduct } from "@/lib/suite-sso/config"

const ACTIVE_ENTITLEMENTS = new Set(["active", "trial"])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RETURN_TTL_MS = 90_000

export class SuiteIdentityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

async function requireProductEntitlement(customerAccountId: string, productKey: string) {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("suite_product_entitlements")
    .select("status, expires_at")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", productKey)
    .maybeSingle()
  if (error) throw error
  if (!data || !ACTIVE_ENTITLEMENTS.has(data.status)) {
    throw new SuiteIdentityError("product_not_active", 403, `Prodotto ${productKey} non attivo`)
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new SuiteIdentityError("product_expired", 403, `Prodotto ${productKey} scaduto`)
  }
  return data
}

async function getOrCreateIdentity(input: {
  customerAccountId: string
  email: string
  displayName?: string | null
}) {
  const email = normalizeEmail(input.email)
  if (!email || !email.includes("@")) throw new SuiteIdentityError("invalid_email", 400, "Email non valida")
  const sb = createServiceClient()

  const existing = await sb
    .from("suite_identities")
    .select("id, status, primary_email")
    .eq("customer_account_id", input.customerAccountId)
    .eq("primary_email", email)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) {
    if (existing.data.status !== "active") {
      throw new SuiteIdentityError("identity_suspended", 403, "Identita suite sospesa")
    }
    if (input.displayName) {
      await sb
        .from("suite_identities")
        .update({ display_name: input.displayName.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id)
    }
    return existing.data.id as string
  }

  const created = await sb
    .from("suite_identities")
    .insert({
      customer_account_id: input.customerAccountId,
      primary_email: email,
      display_name: input.displayName?.trim() || null,
    })
    .select("id")
    .single()

  if (!created.error && created.data?.id) return created.data.id as string

  // Concurrent first access: reuse only the identity from the same account/email.
  if (created.error?.code === "23505") {
    const raced = await sb
      .from("suite_identities")
      .select("id, status")
      .eq("customer_account_id", input.customerAccountId)
      .eq("primary_email", email)
      .maybeSingle()
    if (raced.error) throw raced.error
    if (raced.data?.id && raced.data.status === "active") return raced.data.id as string
  }
  throw created.error ?? new Error("suite identity creation failed")
}

export async function linkSuiteIdentity(input: {
  suiteIdentityId: string
  product: "hotelaccelerator" | SuiteSsoProduct
  externalTenantId: string
  externalUserId: string
  email: string
  roleLabel?: string | null
  isTenantAdmin?: boolean
}) {
  if (!UUID_RE.test(input.suiteIdentityId) || !UUID_RE.test(input.externalUserId)) {
    throw new SuiteIdentityError("invalid_identity", 400, "Identificatori identita non validi")
  }
  const email = normalizeEmail(input.email)
  const sb = createServiceClient()

  const { data: identity, error: identityError } = await sb
    .from("suite_identities")
    .select("customer_account_id, primary_email, status")
    .eq("id", input.suiteIdentityId)
    .maybeSingle()
  if (identityError) throw identityError
  if (!identity || identity.status !== "active") {
    throw new SuiteIdentityError("identity_not_active", 403, "Identita suite non attiva")
  }
  if (identity.primary_email !== email) {
    throw new SuiteIdentityError("identity_email_mismatch", 409, "Email non coerente con l'identita suite")
  }

  if (input.product === "hotelaccelerator") {
    const { data: account, error } = await sb
      .from("customer_accounts")
      .select("property_id")
      .eq("id", identity.customer_account_id)
      .maybeSingle()
    if (error) throw error
    if (!account?.property_id || account.property_id !== input.externalTenantId) {
      throw new SuiteIdentityError("tenant_mismatch", 409, "Tenant HotelAccelerator non coerente")
    }
  } else {
    const { data: tenantLink, error } = await sb
      .from("suite_tenant_links")
      .select("customer_account_id")
      .eq("product_key", input.product)
      .eq("external_tenant_id", input.externalTenantId)
      .maybeSingle()
    if (error) throw error
    if (!tenantLink || tenantLink.customer_account_id !== identity.customer_account_id) {
      throw new SuiteIdentityError("tenant_mismatch", 409, "Tenant satellite non coerente")
    }
  }

  const { data: occupied, error: occupiedError } = await sb
    .from("suite_identity_links")
    .select("suite_identity_id")
    .eq("product_key", input.product)
    .eq("external_tenant_id", input.externalTenantId)
    .eq("external_user_id", input.externalUserId)
    .maybeSingle()
  if (occupiedError) throw occupiedError
  if (occupied && occupied.suite_identity_id !== input.suiteIdentityId) {
    throw new SuiteIdentityError("local_identity_conflict", 409, "Utente locale gia collegato a un'altra identita")
  }

  const payload = {
    suite_identity_id: input.suiteIdentityId,
    product_key: input.product,
    external_tenant_id: input.externalTenantId,
    external_user_id: input.externalUserId,
    verified_email: email,
    role_label: input.roleLabel?.trim() || null,
    is_tenant_admin: input.isTenantAdmin === true,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb
    .from("suite_identity_links")
    .upsert(payload, { onConflict: "product_key,external_tenant_id,external_user_id" })
  if (error) throw error
}

export async function ensureSuiteIdentityForHotelAcceleratorUser(input: {
  propertyId: string
  userId: string
  email: string
  name?: string | null
  roleLabel?: string | null
  isTenantAdmin?: boolean
}): Promise<string | null> {
  try {
    const sb = createServiceClient()
    const { data: account, error } = await sb
      .from("customer_accounts")
      .select("id")
      .eq("property_id", input.propertyId)
      .maybeSingle()
    if (error) throw error
    if (!account?.id) return null

    const suiteIdentityId = await getOrCreateIdentity({
      customerAccountId: account.id,
      email: input.email,
      displayName: input.name,
    })
    await linkSuiteIdentity({
      suiteIdentityId,
      product: "hotelaccelerator",
      externalTenantId: input.propertyId,
      externalUserId: input.userId,
      email: input.email,
      roleLabel: input.roleLabel,
      isTenantAdmin: input.isTenantAdmin,
    })
    return suiteIdentityId
  } catch (error) {
    // Compatibility guard: a registry issue must not break the pre-existing
    // HotelAccelerator -> satellite SSO path. The next launch retries linking.
    console.warn("[suite-identity] lazy HA identity link unavailable", {
      property_id: input.propertyId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return null
  }
}

async function ensureHotelAcceleratorUser(input: {
  propertyId: string
  suiteIdentityId: string
  email: string
  name?: string | null
  isTenantAdmin: boolean
}) {
  const email = normalizeEmail(input.email)
  const sb = createServiceClient()
  const { data: matches, error: lookupError } = await sb
    .from("admin_users")
    .select("id, property_id, email, name, role, is_tenant_admin")
    .ilike("email", email)
    .limit(2)
  if (lookupError) throw lookupError
  if ((matches?.length ?? 0) > 1) {
    throw new SuiteIdentityError("duplicate_email", 409, "Email duplicata nel Core")
  }

  let adminUser = matches?.[0] ?? null
  if (adminUser && adminUser.property_id !== input.propertyId) {
    // Current Core auth model has one admin_users row per email. Do not silently
    // move a person between customer accounts.
    throw new SuiteIdentityError("email_owned_by_other_tenant", 409, "Email gia associata a un altro tenant")
  }

  let createdAuthUserId: string | null = null
  if (!adminUser) {
    const created = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: input.name?.trim() || email, source: "4bid-suite" },
      app_metadata: { suite_identity_id: input.suiteIdentityId },
    })
    if (created.error || !created.data.user) {
      throw new SuiteIdentityError("auth_user_conflict", 409, "Account di autenticazione gia presente o non creabile")
    }
    createdAuthUserId = created.data.user.id

    const inserted = await sb
      .from("admin_users")
      .insert({
        id: createdAuthUserId,
        property_id: input.propertyId,
        email,
        name: input.name?.trim() || email,
        role: input.isTenantAdmin ? "admin" : "editor",
        is_tenant_admin: input.isTenantAdmin,
        can_upload: true,
        can_delete: input.isTenantAdmin,
        can_move: true,
        can_manage_users: input.isTenantAdmin,
      })
      .select("id, property_id, email, name, role, is_tenant_admin")
      .single()
    if (inserted.error || !inserted.data) {
      await sb.auth.admin.deleteUser(createdAuthUserId).catch(() => {})
      throw inserted.error ?? new Error("admin user creation failed")
    }
    adminUser = inserted.data
  } else {
    const currentAuth = await sb.auth.admin.getUserById(adminUser.id)
    if (currentAuth.error || !currentAuth.data.user) {
      throw new SuiteIdentityError("auth_user_missing", 409, "Profilo Core senza account di autenticazione")
    }
    const appMetadata = currentAuth.data.user.app_metadata ?? {}
    if (appMetadata.suite_identity_id && appMetadata.suite_identity_id !== input.suiteIdentityId) {
      throw new SuiteIdentityError("auth_identity_conflict", 409, "Account Core collegato a un'altra identita suite")
    }
    await sb.auth.admin.updateUserById(adminUser.id, {
      app_metadata: { ...appMetadata, suite_identity_id: input.suiteIdentityId },
    })
  }

  await linkSuiteIdentity({
    suiteIdentityId: input.suiteIdentityId,
    product: "hotelaccelerator",
    externalTenantId: input.propertyId,
    externalUserId: adminUser.id,
    email,
    roleLabel: adminUser.role,
    isTenantAdmin: adminUser.is_tenant_admin === true,
  })

  return adminUser
}

export async function provisionHotelAcceleratorFromSatellite(input: {
  product: SuiteSsoProduct
  externalTenantId: string
  externalUserId: string
  email: string
  name?: string | null
  isTenantAdmin: boolean
  tenantName: string
}) {
  if (!UUID_RE.test(input.externalTenantId) || !UUID_RE.test(input.externalUserId)) {
    throw new SuiteIdentityError("invalid_external_identity", 400, "Identificatori satellite non validi")
  }
  const email = normalizeEmail(input.email)
  if (!email || !email.includes("@")) throw new SuiteIdentityError("invalid_email", 400, "Email non valida")

  const sb = createServiceClient()
  const { data: tenantLink, error: linkError } = await sb
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", input.product)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()
  if (linkError) throw linkError
  if (!tenantLink?.customer_account_id) {
    throw new SuiteIdentityError("tenant_not_registered", 404, "Tenant satellite non registrato nel Core")
  }

  await requireProductEntitlement(tenantLink.customer_account_id, input.product)
  await requireProductEntitlement(tenantLink.customer_account_id, "hotelaccelerator")

  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id, property_id")
    .eq("id", tenantLink.customer_account_id)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account) throw new SuiteIdentityError("account_missing", 404, "Account suite non trovato")

  let propertyId = account.property_id as string | null
  if (!propertyId) {
    const provisioned = await sb.rpc("provision_hotelaccelerator_property_for_account", {
      p_customer_account_id: account.id,
      p_property_name: input.tenantName.trim() || "Cliente 4BID",
    })
    if (provisioned.error) throw provisioned.error
    propertyId = provisioned.data?.[0]?.property_id ?? null
  }
  if (!propertyId || !UUID_RE.test(propertyId)) {
    throw new SuiteIdentityError("property_provision_failed", 500, "Provisioning tenant HotelAccelerator non riuscito")
  }

  // If the property already existed, keep its existing module guard aligned
  // only with an entitlement that was explicitly recorded for this account.
  const activeModules = await getActiveModuleKeys(sb, propertyId)
  if (!activeModules.has(input.product)) {
    await setModuleStatus({ propertyId, moduleKey: input.product, status: "active" })
  }

  const suiteIdentityId = await getOrCreateIdentity({
    customerAccountId: account.id,
    email,
    displayName: input.name,
  })

  await linkSuiteIdentity({
    suiteIdentityId,
    product: input.product,
    externalTenantId: input.externalTenantId,
    externalUserId: input.externalUserId,
    email,
    roleLabel: input.isTenantAdmin ? "admin" : "user",
    isTenantAdmin: input.isTenantAdmin,
  })

  const haUser = await ensureHotelAcceleratorUser({
    propertyId,
    suiteIdentityId,
    email,
    name: input.name,
    isTenantAdmin: input.isTenantAdmin,
  })

  const rawCode = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + RETURN_TTL_MS).toISOString()
  const { error: grantError } = await sb.from("suite_sso_exchange_codes").insert({
    token_hash: tokenHash(rawCode),
    product_key: input.product,
    property_id: propertyId,
    external_tenant_id: input.externalTenantId,
    source_user_id: haUser.id,
    source_email: email,
    source_name: haUser.name ?? input.name ?? email,
    source_is_tenant_admin: haUser.is_tenant_admin === true,
    suite_identity_id: suiteIdentityId,
    expires_at: expiresAt,
  })
  if (grantError) throw grantError

  const returnUrl = new URL("/auth/suite-return", process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.hotelaccelerator.com")
  returnUrl.searchParams.set("product", input.product)
  returnUrl.searchParams.set("code", rawCode)

  return { returnUrl: returnUrl.toString(), expiresAt, propertyId, suiteIdentityId }
}

export async function linkSatelliteUserToSuiteIdentity(input: {
  product: SuiteSsoProduct
  suiteIdentityId: string
  externalTenantId: string
  externalUserId: string
  email: string
  roleLabel?: string | null
  isTenantAdmin?: boolean
}) {
  await linkSuiteIdentity(input)
}
