import "server-only"

import {
  MINUTI_DISCONNESSIONE_PIATTAFORMA,
  risolviTempoDisconnessione,
  secondiPreavviso,
} from "@/lib/auth/auto-logout"
import { getActiveModuleKeys } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { SUITE_SSO_CONFIG, type SuiteSsoProduct } from "@/lib/suite-sso/config"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SuiteReturnIdentity {
  product: SuiteSsoProduct
  externalTenantId: string
  sourceUserId: string
  propertyId: string
  email: string
  name: string
  adminUserId: string | null
  isTenantAdmin: boolean
  isSuperAdmin: boolean
  autoLogoutMinutes: number | null
}

export interface SuiteSessionPolicy {
  minuti: number | null
  origine: "utente" | "gruppo" | "predefinito" | "piattaforma"
  nomeGruppo: string | null
  secondiPreavviso: number | null
}

/**
 * Verifica un'identita' che un prodotto satellite vuole riportare nel Core.
 *
 * Il satellite non puo' scegliere una property del Core: fornisce soltanto il
 * proprio tenant esterno e l'id auth originario ricevuto dal Core all'ingresso.
 * Il mapping tenant, l'utente, il modulo attivo e il ruolo vengono tutti
 * ricostruiti dal database centrale prima di emettere qualunque grant.
 */
export async function verifySuiteReturnIdentity(input: {
  product: SuiteSsoProduct
  externalTenantId: string
  sourceUserId: string
}): Promise<SuiteReturnIdentity | null> {
  if (!UUID_RE.test(input.externalTenantId) || !UUID_RE.test(input.sourceUserId)) return null

  const sb = createServiceClient()

  const { data: link, error: linkError } = await sb
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", input.product)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()
  if (linkError) throw linkError
  if (!link?.customer_account_id) return null

  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("property_id")
    .eq("id", link.customer_account_id)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.property_id) return null

  const activeModules = await getActiveModuleKeys(sb, account.property_id)
  if (!activeModules.has(SUITE_SSO_CONFIG[input.product].moduleKey)) return null

  const authUser = await sb.auth.admin.getUserById(input.sourceUserId)
  if (authUser.error || !authUser.data.user?.email) return null
  const email = authUser.data.user.email.toLowerCase()

  const { data: collaborator, error: collaboratorError } = await sb
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", email)
    .maybeSingle()
  if (collaboratorError) throw collaboratorError

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    return {
      product: input.product,
      externalTenantId: input.externalTenantId,
      sourceUserId: input.sourceUserId,
      propertyId: account.property_id,
      email,
      name: email,
      adminUserId: null,
      isTenantAdmin: true,
      isSuperAdmin: true,
      autoLogoutMinutes: MINUTI_DISCONNESSIONE_PIATTAFORMA,
    }
  }

  const { data: adminUser, error: adminUserError } = await sb
    .from("admin_users")
    .select("id, name, is_tenant_admin, auto_logout_minutes")
    .eq("property_id", account.property_id)
    .eq("email", email)
    .maybeSingle()
  if (adminUserError) throw adminUserError
  if (!adminUser?.id) return null

  return {
    product: input.product,
    externalTenantId: input.externalTenantId,
    sourceUserId: input.sourceUserId,
    propertyId: account.property_id,
    email,
    name: adminUser.name ?? email,
    adminUserId: adminUser.id,
    isTenantAdmin: adminUser.is_tenant_admin === true,
    isSuperAdmin: false,
    autoLogoutMinutes:
      typeof adminUser.auto_logout_minutes === "number" ? adminUser.auto_logout_minutes : null,
  }
}

/** La stessa policy del Core, risolta per la sessione satellite collegata. */
export async function resolveSuiteSessionPolicy(identity: SuiteReturnIdentity): Promise<SuiteSessionPolicy> {
  if (identity.isSuperAdmin) {
    return {
      minuti: MINUTI_DISCONNESSIONE_PIATTAFORMA,
      origine: "piattaforma",
      nomeGruppo: null,
      secondiPreavviso: secondiPreavviso(MINUTI_DISCONNESSIONE_PIATTAFORMA),
    }
  }

  if (!identity.adminUserId) {
    return { minuti: null, origine: "predefinito", nomeGruppo: null, secondiPreavviso: null }
  }

  const sb = createServiceClient()
  const { data: memberships, error } = await sb
    .from("user_group_members")
    .select("user_groups!inner(name, auto_logout_minutes)")
    .eq("user_id", identity.adminUserId)
  if (error) throw error

  const gruppi = (memberships ?? [])
    .map((membership: any) => membership.user_groups)
    .filter((group: any) => group && typeof group.auto_logout_minutes === "number")
    .map((group: any) => ({ nome: group.name as string, minuti: group.auto_logout_minutes as number }))

  const resolved = risolviTempoDisconnessione({
    valoreUtente: identity.autoLogoutMinutes,
    gruppi,
  })

  return {
    minuti: resolved.minuti,
    origine: resolved.origine,
    nomeGruppo: resolved.nomeGruppo ?? null,
    secondiPreavviso: resolved.minuti === null ? null : secondiPreavviso(resolved.minuti),
  }
}
