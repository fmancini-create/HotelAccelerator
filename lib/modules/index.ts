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
  }
}

/** Un modulo e' "attivo" se in stato active/trial e non scaduto. */
function isEffectivelyActive(status: ModuleStatus, expiresAt: string | null): boolean {
  if (status !== "active" && status !== "trial") return false
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false
  return true
}

/**
 * Legge l'intero catalogo dei moduli disponibili.
 */
export async function getModuleCatalog(
  supabase: SupabaseClient,
): Promise<ModuleCatalogEntry[]> {
  const { data, error } = await supabase
    .from("modules")
    .select("key, name, description, icon, category, is_core, sort_order, is_available")
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
  const [catalog, tenant] = await Promise.all([
    getModuleCatalog(supabase),
    getTenantModules(supabase, propertyId),
  ])

  const byKey = new Map(tenant.map((t) => [t.moduleKey, t]))

  return catalog.map((m) => {
    const state = byKey.get(m.key)
    const status: ModuleStatus = state?.status ?? "inactive"
    const expiresAt = state?.expiresAt ?? null
    return {
      ...m,
      status,
      plan: state?.plan ?? null,
      expiresAt,
      active: isEffectivelyActive(status, expiresAt),
    }
  })
}

/**
 * Restituisce l'insieme delle chiavi dei moduli ATTIVI per una struttura.
 * Comodo per il menu e per i controlli "questo modulo e' acceso?".
 */
export async function getActiveModuleKeys(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<Set<string>> {
  const tenant = await getTenantModules(supabase, propertyId)
  const active = tenant.filter((t) => isEffectivelyActive(t.status, t.expiresAt))
  return new Set(active.map((t) => t.moduleKey))
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
