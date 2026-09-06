/**
 * MODULE SYSTEM — "il cervello" lato server.
 *
 * Idea (vedi istruzioni di progetto: multitenant, API-first, moduli opzionali):
 *  - `modules`        = catalogo di tutto cio' che la piattaforma puo' offrire.
 *  - `tenant_modules` = quali moduli sono attivi per ciascuna struttura (tenant).
 *
 * Questo file espone funzioni semplici e riusabili per:
 *  - leggere il catalogo dei moduli;
 *  - leggere lo stato dei moduli di una struttura;
 *  - sapere se un singolo modulo e' attivo (con gestione scadenza);
 *  - attivare/disattivare un modulo (scrittura server-side, service role).
 *
 * Le letture usano il client passato dal chiamante (RLS-aware). Le scritture
 * usano il service role, coerentemente col resto dell'app.
 */

import { createServiceClient } from "@/lib/supabase/server"
import {
  getSuiteAddonEntitlementForTenant,
  isSuiteAddonKey,
  resolveSuiteCustomerAccountId,
  setSuiteAddonEntitlementSource,
  type SuiteAddonEntitlement,
  type SuiteAddonKey,
} from "@/lib/suite-addons/entitlements"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ModuleCategory = "core" | "product" | "addon"
export type ModuleStatus = "active" | "inactive" | "trial"

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
    monthlyCostCents: (row.monthly_cost_cents as number | null) ?? null,
  }
}

function isEffectivelyActive(status: ModuleStatus, expiresAt: string | null): boolean {
  if (status !== "active" && status !== "trial") return false
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false
  return true
}

const SHARED_MODULES: SuiteAddonKey[] = ["reviews", "web_traffic"]

async function suiteEntitlements(propertyId: string) {
  const pairs = await Promise.all(
    SHARED_MODULES.map(async (addonKey) => {
      try {
        const entitlement = await getSuiteAddonEntitlementForTenant({
          productKey: "hotelaccelerator",
          externalTenantId: propertyId,
          addonKey,
        })
        return [addonKey, entitlement] as const
      } catch (error) {
        console.error("[modules] suite entitlement lookup failed", {
          propertyId,
          addonKey,
          error: error instanceof Error ? error.message : "unknown",
        })
        return [addonKey, null] as const
      }
    }),
  )
  return new Map<SuiteAddonKey, SuiteAddonEntitlement | null>(pairs)
}

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

export async function getModulesWithState(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<ModuleWithState[]> {
  const [catalog, tenant, entitlements] = await Promise.all([
    getModuleCatalog(supabase),
    getTenantModules(supabase, propertyId),
    suiteEntitlements(propertyId),
  ])

  const byKey = new Map(tenant.map((t) => [t.moduleKey, t]))

  return catalog.map((m) => {
    const state = byKey.get(m.key)
    const localStatus: ModuleStatus = state?.status ?? "inactive"
    const localExpiresAt = state?.expiresAt ?? null
    const localActive = isEffectivelyActive(localStatus, localExpiresAt)
    const entitlement = isSuiteAddonKey(m.key) ? entitlements.get(m.key) : null

    if (!localActive && entitlement?.active) {
      const status: ModuleStatus = entitlement.status === "trial" ? "trial" : "active"
      return {
        ...m,
        status,
        plan: "suite",
        expiresAt: entitlement.expiresAt,
        active: true,
      }
    }

    return {
      ...m,
      status: localStatus,
      plan: state?.plan ?? null,
      expiresAt: localExpiresAt,
      active: localActive,
    }
  })
}

export async function getActiveModuleKeys(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<Set<string>> {
  const [tenant, entitlements] = await Promise.all([
    getTenantModules(supabase, propertyId),
    suiteEntitlements(propertyId),
  ])
  const active = tenant.filter((t) => isEffectivelyActive(t.status, t.expiresAt))
  const keys = new Set(active.map((t) => t.moduleKey))
  for (const addonKey of SHARED_MODULES) {
    if (entitlements.get(addonKey)?.active) keys.add(addonKey)
  }
  return keys
}

export async function isModuleActive(
  supabase: SupabaseClient,
  propertyId: string,
  moduleKey: string,
): Promise<boolean> {
  const keys = await getActiveModuleKeys(supabase, propertyId)
  return keys.has(moduleKey)
}

export async function setModuleStatus(params: {
  propertyId: string
  moduleKey: string
  status: ModuleStatus
  plan?: string | null
  expiresAt?: string | null
}): Promise<void> {
  const { propertyId, moduleKey, status, plan = null, expiresAt = null } = params
  const admin = createServiceClient()
  const activatedAt = status === "active" || status === "trial" ? new Date().toISOString() : null

  const { error } = await admin
    .from("tenant_modules")
    .upsert(
      {
        property_id: propertyId,
        module_key: moduleKey,
        status,
        plan,
        expires_at: expiresAt,
        activated_at: activatedAt,
      },
      { onConflict: "property_id,module_key" },
    )

  if (error) throw new Error(`setModuleStatus: ${error.message}`)

  // Reviews e Visite sito sono entitlement di suite: se vengono accesi/spenti
  // dal Core, pubblichiamo anche questa sorgente. Un eventuale abbonamento attivo
  // su Santaddeo resta valido perché l'entitlement aggrega tutte le sorgenti.
  if (isSuiteAddonKey(moduleKey)) {
    try {
      const customerAccountId = await resolveSuiteCustomerAccountId({
        productKey: "hotelaccelerator",
        externalTenantId: propertyId,
      })
      if (customerAccountId) {
        await setSuiteAddonEntitlementSource({
          customerAccountId,
          addonKey: moduleKey,
          sourceProductKey: "hotelaccelerator",
          sourceExternalTenantId: propertyId,
          status,
          activatedAt,
          expiresAt,
          metadata: { source: "tenant_modules", plan },
        })
      }
    } catch (syncError) {
      console.error("[modules] suite entitlement publish failed", {
        propertyId,
        moduleKey,
        error: syncError instanceof Error ? syncError.message : "unknown",
      })
    }
  }
}
