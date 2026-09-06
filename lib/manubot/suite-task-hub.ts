import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  getManubotClient,
  type ManubotCreateTaskPayload,
  type ManubotTask,
  type ManubotTaskFormData,
} from "@/lib/manubot"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteProductKey } from "@/lib/customer-codes/product"

export type SuiteTaskSourceProduct = Exclude<SuiteProductKey, "manubot">
export type SuiteAddonStatus = "active" | "inactive" | "configuration_required"

export type SuiteManubotContext = {
  customerAccountId: string
  propertyId: string | null
  manubotCompanyId: string | null
  status: SuiteAddonStatus
  active: boolean
  activationUrl: string
  reason: string | null
}

export type SuiteManubotTaskInput = {
  sourceProduct: SuiteTaskSourceProduct
  externalTenantId: string
  idempotencyKey: string
  title: string
  description?: string | null
  /** Nome esatto di priority_levels.name del tenant ManuBot. */
  priority: string
  assigneeIds?: string[]
  groupIds?: string[]
  assetIds?: string[]
  assetCategoryId?: string | null
  propertyId?: string | null
  procedureIds?: string[]
  requiresCompletionPhoto?: boolean
  expectedResolutionMinutes?: number
  tags?: string[]
  context?: Record<string, unknown>
  sourceType?: string | null
  sourceId?: string | null
  sourceUrl?: string | null
}

type DestinationConfig = SuiteManubotContext & {
  manubotEmail: string | null
  manubotPassword: string | null
  manubotSupabaseUrl: string | null
}

const ACTIVE_STATUSES = new Set(["active", "trial"])
const DEFAULT_ACTIVATION_URL = "https://www.manubot.it/prezzi"

function notExpired(expiresAt: string | null | undefined) {
  return !expiresAt || new Date(expiresAt).getTime() >= Date.now()
}

function isActiveRow(row: { status?: string | null; expires_at?: string | null } | null | undefined) {
  return Boolean(row && ACTIVE_STATUSES.has(row.status || "") && notExpired(row.expires_at))
}

export function suiteManubotActivationUrl() {
  return process.env.MANUBOT_ACTIVATION_URL?.trim() || DEFAULT_ACTIVATION_URL
}

async function resolveCustomerAccountId(
  sb: SupabaseClient,
  sourceProduct: SuiteTaskSourceProduct,
  externalTenantId: string,
): Promise<string | null> {
  if (sourceProduct === "hotelaccelerator") {
    const { data, error } = await sb.from("customer_accounts").select("id").eq("property_id", externalTenantId).maybeSingle()
    if (error) throw new Error(`suite task hub account lookup: ${error.message}`)
    return data?.id ?? null
  }

  const { data, error } = await sb
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", sourceProduct)
    .eq("external_tenant_id", externalTenantId)
    .maybeSingle()
  if (error) throw new Error(`suite task hub tenant lookup: ${error.message}`)
  return data?.customer_account_id ?? null
}

async function resolveDestination(
  sourceProduct: SuiteTaskSourceProduct,
  externalTenantId: string,
): Promise<DestinationConfig | null> {
  const sb = createServiceClient()
  const customerAccountId = await resolveCustomerAccountId(sb, sourceProduct, externalTenantId)
  if (!customerAccountId) return null

  const [{ data: account, error: accountError }, { data: entitlement, error: entitlementError }, { data: link, error: linkError }] = await Promise.all([
    sb.from("customer_accounts").select("property_id").eq("id", customerAccountId).maybeSingle(),
    sb.from("suite_product_entitlements").select("status,expires_at").eq("customer_account_id", customerAccountId).eq("product_key", "manubot").maybeSingle(),
    sb.from("suite_tenant_links").select("external_tenant_id").eq("customer_account_id", customerAccountId).eq("product_key", "manubot").maybeSingle(),
  ])
  if (accountError) throw new Error(`suite task hub account: ${accountError.message}`)
  if (entitlementError) throw new Error(`suite task hub entitlement: ${entitlementError.message}`)
  if (linkError) throw new Error(`suite task hub manubot link: ${linkError.message}`)

  const propertyId = account?.property_id ?? null
  let property: {
    manubot_company_id: string | null
    manubot_email: string | null
    manubot_password: string | null
    manubot_supabase_url: string | null
  } | null = null
  let localModuleActive: boolean | null = null

  if (propertyId) {
    const { data, error } = await sb
      .from("properties")
      .select("manubot_company_id,manubot_email,manubot_password,manubot_supabase_url")
      .eq("id", propertyId)
      .maybeSingle()
    if (error) throw new Error(`suite task hub property: ${error.message}`)
    property = data ?? null
    localModuleActive = await isModuleActive(sb, propertyId, "manubot")
  }

  const entitlementActive = isActiveRow(entitlement)
  const technicallyActive = propertyId ? localModuleActive === true : entitlementActive
  const commerciallyActive = technicallyActive || entitlementActive
  const manubotCompanyId = link?.external_tenant_id?.trim() || property?.manubot_company_id?.trim() || null

  let status: SuiteAddonStatus = "active"
  let reason: string | null = null
  if (!commerciallyActive) {
    status = "inactive"
    reason = "addon_inactive"
  } else if (propertyId && entitlementActive && !technicallyActive) {
    status = "configuration_required"
    reason = "local_module_not_provisioned"
  } else if (!manubotCompanyId) {
    status = "configuration_required"
    reason = "manubot_tenant_not_linked"
  }

  return {
    customerAccountId,
    propertyId,
    manubotCompanyId,
    status,
    active: status === "active",
    activationUrl: suiteManubotActivationUrl(),
    reason,
    manubotEmail: property?.manubot_email ?? null,
    manubotPassword: property?.manubot_password ?? null,
    manubotSupabaseUrl: property?.manubot_supabase_url ?? null,
  }
}

export async function getSuiteManubotContext(
  sourceProduct: SuiteTaskSourceProduct,
  externalTenantId: string,
): Promise<SuiteManubotContext | null> {
  const resolved = await resolveDestination(sourceProduct, externalTenantId)
  if (!resolved) return null
  const { manubotEmail: _email, manubotPassword: _password, manubotSupabaseUrl: _url, ...context } = resolved
  return context
}

async function clientFor(resolved: DestinationConfig) {
  if (!resolved.active || !resolved.manubotCompanyId) throw new Error(resolved.reason || "manubot_not_available")
  return getManubotClient({
    manubot_company_id: resolved.manubotCompanyId,
    manubot_email: resolved.manubotEmail,
    manubot_password: resolved.manubotPassword,
    manubot_supabase_url: resolved.manubotSupabaseUrl,
  })
}

export async function getSuiteManubotTaskFormData(
  sourceProduct: SuiteTaskSourceProduct,
  externalTenantId: string,
): Promise<{ context: SuiteManubotContext; taskData: ManubotTaskFormData | null } | null> {
  const resolved = await resolveDestination(sourceProduct, externalTenantId)
  if (!resolved) return null
  const { manubotEmail: _email, manubotPassword: _password, manubotSupabaseUrl: _url, ...context } = resolved
  if (!resolved.active) return { context, taskData: null }
  const client = await clientFor(resolved)
  const taskData = await client.getTaskFormData()
  return { context, taskData }
}

function dedupe(values: string[] | undefined) {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)))
}

export async function createSuiteManubotTask(input: SuiteManubotTaskInput): Promise<{
  context: SuiteManubotContext
  task: ManubotTask
}> {
  const resolved = await resolveDestination(input.sourceProduct, input.externalTenantId)
  if (!resolved) throw new Error("suite_customer_not_linked")
  const { manubotEmail: _email, manubotPassword: _password, manubotSupabaseUrl: _url, ...context } = resolved
  if (!resolved.active) throw new Error(resolved.reason || "manubot_not_available")

  const assigneeIds = dedupe(input.assigneeIds)
  const groupIds = dedupe(input.groupIds)
  if (assigneeIds.length === 0 && groupIds.length === 0) throw new Error("responsible_required")

  const priority = input.priority.trim()
  if (!priority) throw new Error("priority_required")

  const expectedResolutionMinutes = input.expectedResolutionMinutes ?? 60
  if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
    throw new Error("invalid_expected_resolution_minutes")
  }

  const sourceHeader = [
    `Origine 4BID: ${input.sourceProduct}${input.sourceType ? ` / ${input.sourceType}` : ""}`,
    input.sourceId ? `Riferimento: ${input.sourceId}` : null,
    input.sourceUrl ? `Link origine: ${input.sourceUrl}` : null,
    input.tags?.length ? `Tag: ${input.tags.join(", ")}` : null,
  ].filter(Boolean).join("\n")
  const contextText = input.context && Object.keys(input.context).length
    ? `\n\nContesto:\n${Object.entries(input.context).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n")}`
    : ""

  const assetIds = dedupe(input.assetIds)
  const payload: ManubotCreateTaskPayload = {
    title: input.title.trim(),
    description: `${sourceHeader}${input.description ? `\n\n${input.description.trim()}` : ""}${contextText}`.trim(),
    priority,
    assignee_ids: assigneeIds,
    group_ids: groupIds,
    asset_ids: assetIds,
    asset_category_id: assetIds.length > 0 ? null : input.assetCategoryId || null,
    property_id: input.propertyId || null,
    procedure_ids: dedupe(input.procedureIds),
    requires_completion_photo: input.requiresCompletionPhoto === true,
    expected_resolution_minutes: expectedResolutionMinutes,
    client_request_id: input.idempotencyKey,
  }

  const client = await clientFor(resolved)
  const task = await client.createTask(payload, input.idempotencyKey)
  return { context, task }
}
