/**
 * MODULE SYSTEM — "il cervello" lato server.
 *
 * Idea (vedi istruzioni di progetto: multitenant, API-first, moduli opzionali):
 *  - `modules`        = catalogo di tutto cio' che la piattaforma puo' offrire.
 *  - `tenant_modules` = quali moduli sono attivi per ciascuna struttura (tenant).
 *
 * Per i prodotti satellite della suite (Santaddeo, HotelProfitAI, ManuBot),
 * quando esiste un entitlement account-level questo e' la fonte autorevole.
 * In questo modo collegamento Suite, menu, card e SSO non possono divergere.
 */

import { createServiceClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ModuleCategory = "core" | "product" | "addon"
export type ModuleStatus = "active" | "inactive" | "trial"

const SUITE_MODULE_KEYS = new Set(["santaddeo", "hotelprofitai", "manubot"])

export interface ModuleCatalogEntry {
  key: string
  name: string
  description: string | null
  icon: string | null
  category: ModuleCategory
  isCore: boolean
  sortOrder: number
  isAvailable: boolean
  /**
   * Costo mensile in centesimi che sosteniamo per ogni struttura che usa il
   * modulo. `null` = non ancora determinato (NON "gratis").
   *
   * Il prezzo di vendita non e' qui perche' non si salva: si calcola con
   * `prezzoVenditaCentesimi` in lib/modules/pricing.ts.
   */
  monthlyCostCents: number | null
}

export interface TenantModule {
  moduleKey: string
  status: ModuleStatus
  plan: string | null
  activatedAt: string | null
  expiresAt: string | null
}

interface SuiteEntitlementState {
  moduleKey: string
  status: ModuleStatus
  expiresAt: string | null
}

/** Catalogo + stato di un modulo per una specifica struttura (per la UI). */
export interface ModuleWithState extends ModuleCatalogEntry {
  status: ModuleStatus
  plan: string | null
  expiresAt: string | null
  /** true se status attivo/trial e non scaduto */
  active: boolean
}

function mapCatalogRow(row: Record<string, unknown>): ModuleCatalogEntry {
  return {
    key: row.key as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    category: (row.category as ModuleCategory) ?? "core",
    isCore: Boolean(row.is_core),
    sortOrder: (row.sort_order as number) ?? 100,
    isAvailable: row.is_available !== false,
    // `?? null` e non `?? 0`: un costo che non c'e' non e' un costo di zero.
    monthlyCostCents: (row.monthly_cost_cents as number | null) ?? null,
  }
}

/** Un modulo e' "attivo" se in stato active/trial e non scaduto. */
function isEffectivelyActive(status: ModuleStatus, expiresAt: string | null): boolean {
  if (status !== "active" && status !== "trial") return false
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false
  return true
}

function entitlementStatusToModuleStatus(status: string): ModuleStatus {
  if (status === "trial") return "trial"
  if (status === "active") return "active"
  return "inactive"
}

/**
 * Legge gli entitlement account-level dei tre prodotti satellite.
 * Se l'account o l'entitlement non esistono, il vecchio stato locale resta il
 * fallback per compatibilita' con tenant non ancora migrati alla Suite Identity.
 */
async function getSuiteEntitlementStates(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<Map<string, SuiteEntitlementState>> {
  const { data: account, error: accountError } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (accountError) throw new Error(`getSuiteEntitlementStates account: ${accountError.message}`)
  if (!account?.id) return new Map()

  const { data, error } = await supabase
    .from("suite_product_entitlements")
    .select("product_key, status, expires_at")
    .eq("customer_account_id", account.id)
    .in("product_key", [...SUITE_MODULE_KEYS])

  if (error) throw new Error(`getSuiteEntitlementStates entitlements: ${error.message}`)

  return new Map(
    (data ?? []).map((row) => [
      row.product_key as string,
      {
        moduleKey: row.product_key as string,
        status: entitlementStatusToModuleStatus(row.status as string),
        expiresAt: (row.expires_at as string | null) ?? null,
      },
    ]),
  )
}

/**
 * Legge l'intero catalogo dei moduli disponibili.
 */
export async function getModuleCatalog(
  supabase: SupabaseClient,
): Promise<ModuleCatalogEntry[]> {
  const { data, error } = await supabase
    .from("modules")
    .select("key, name, description, icon, category, is_core, sort_order, is_available, monthly_cost_cents")
    .eq("is_available", true)
    .order("sort_order", { ascending: true })

  if (error) throw new Error(`getModuleCatalog: ${error.message}`)
  return (data ?? []).map(mapCatalogRow)
}

/**
 * Legge lo stato (raw) dei moduli di una struttura.
 */
export async function getTenantModules(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<TenantModule[]> {
  const { data, error } = await supabase
    .from("tenant_modules")
    .select("module_key, status, plan, activated_at, expires_at")
    .eq("property_id", propertyId)

  if (error) throw new Error(`getTenantModules: ${error.message}`)
  return (data ?? []).map((row) => ({
    moduleKey: row.module_key as string,
    status: row.status as ModuleStatus,
    plan: (row.plan as string | null) ?? null,
    activatedAt: (row.activated_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  }))
}

/**
 * Unisce catalogo + stato della struttura in un'unica lista pronta per la UI.
 */
export async function getModulesWithState(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<ModuleWithState[]> {
  const [catalog, tenant, suiteEntitlements] = await Promise.all([
    getModuleCatalog(supabase),
    getTenantModules(supabase, propertyId),
    getSuiteEntitlementStates(supabase, propertyId),
  ])

  const byKey = new Map(tenant.map((t) => [t.moduleKey, t]))

  return catalog.map((m) => {
    const localState = byKey.get(m.key)
    const suiteState = suiteEntitlements.get(m.key)
    const status: ModuleStatus = suiteState?.status ?? localState?.status ?? "inactive"
    const expiresAt = suiteState?.expiresAt ?? localState?.expiresAt ?? null
    return {
      ...m,
      status,
      plan: localState?.plan ?? null,
      expiresAt,
      active: isEffectivelyActive(status, expiresAt),
    }
  })
}

/**
 * Restituisce l'insieme delle chiavi dei moduli ATTIVI per una struttura.
 * Per i prodotti Suite, un entitlement esplicito sostituisce il vecchio stato
 * locale; se non esiste ancora, tenant_modules rimane il fallback.
 */
export async function getActiveModuleKeys(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<Set<string>> {
  const [tenant, suiteEntitlements] = await Promise.all([
    getTenantModules(supabase, propertyId),
    getSuiteEntitlementStates(supabase, propertyId),
  ])

  const active = new Set(
    tenant
      .filter((t) => !suiteEntitlements.has(t.moduleKey) && isEffectivelyActive(t.status, t.expiresAt))
      .map((t) => t.moduleKey),
  )

  for (const entitlement of suiteEntitlements.values()) {
    if (isEffectivelyActive(entitlement.status, entitlement.expiresAt)) active.add(entitlement.moduleKey)
  }

  return active
}

/**
 * Dice se un singolo modulo e' attivo per una struttura.
 */
export async function isModuleActive(
  supabase: SupabaseClient,
  propertyId: string,
  moduleKey: string,
): Promise<boolean> {
  const keys = await getActiveModuleKeys(supabase, propertyId)
  return keys.has(moduleKey)
}

/**
 * Attiva o disattiva un modulo per una struttura (scrittura server-side).
 * Usa il service role: chiamare SOLO da route dove l'auth e' gia' verificata.
 * Il trigger DB tiene sincronizzati i vecchi flag (cms_enabled, ...).
 */
export async function setModuleStatus(params: {
  propertyId: string
  moduleKey: string
  status: ModuleStatus
  plan?: string | null
  expiresAt?: string | null
}): Promise<void> {
  const { propertyId, moduleKey, status, plan = null, expiresAt = null } = params
  const admin = createServiceClient()

  const { error } = await admin
    .from("tenant_modules")
    .upsert(
      {
        property_id: propertyId,
        module_key: moduleKey,
        status,
        plan,
        expires_at: expiresAt,
        activated_at: status === "active" || status === "trial" ? new Date().toISOString() : null,
      },
      { onConflict: "property_id,module_key" },
    )

  if (error) throw new Error(`setModuleStatus: ${error.message}`)
}
