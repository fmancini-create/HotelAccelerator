import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import type { KnowledgeBaseWithCount } from "@/lib/ai/knowledge-bases"
import type { VoiceProductKey } from "@/lib/telephony/voice-products"

export type VoiceIvrIntent = "customer_support" | "prospect_information"
export type VoiceKnowledgeScope = "customer_product" | "hub_selected"
export type VoiceCrmToolKey = "customer_code_lookup" | "caller_lookup"
export type VoiceFallbackMode = "tenant_policy" | "transfer"

export interface VoiceIvrRouteRecord {
  id: string
  hub_property_id: string
  ivr_path: string
  intent_key: VoiceIvrIntent
  product_key: VoiceProductKey
  agent_label: string
  knowledge_scope: VoiceKnowledgeScope
  primary_knowledge_base_id: string | null
  crm_tool_key: VoiceCrmToolKey
  fallback_mode: VoiceFallbackMode
  fallback_destination: string
  is_active: boolean
}

export interface VoiceIvrRouteView extends VoiceIvrRouteRecord {
  primary_knowledge_base: KnowledgeBaseWithCount | null
  shared_knowledge_bases: KnowledgeBaseWithCount[]
  status: "ready" | "missing_primary" | "empty_primary" | "invalid_reference" | "dynamic_tenant"
}

type SharedRow = { route_id: string; knowledge_base_id: string; position: number }

export function isMissingVoiceRoutingSchema(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null
  return candidate?.code === "42P01" || candidate?.code === "PGRST205" || candidate?.message?.includes("voice_ivr_routes") === true
}

export async function getVoiceIvrRoutes(
  hubPropertyId: string,
  knowledgeBases: KnowledgeBaseWithCount[],
): Promise<VoiceIvrRouteView[]> {
  const supabase = createServiceClient()
  const routesResult = await supabase
    .from("voice_ivr_routes")
    .select(
      "id, hub_property_id, ivr_path, intent_key, product_key, agent_label, knowledge_scope, primary_knowledge_base_id, crm_tool_key, fallback_mode, fallback_destination, is_active",
    )
    .eq("hub_property_id", hubPropertyId)
    .order("ivr_path", { ascending: true })

  if (routesResult.error) throw routesResult.error
  const routes = (routesResult.data ?? []) as VoiceIvrRouteRecord[]
  if (routes.length === 0) return []

  const routeIds = routes.map((route) => route.id)
  const sharedResult = await supabase
    .from("voice_ivr_route_shared_bases")
    .select("route_id, knowledge_base_id, position")
    .in("route_id", routeIds)
    .order("position", { ascending: true })
  if (sharedResult.error) throw sharedResult.error

  const basesById = new Map(knowledgeBases.map((base) => [base.id, base]))
  const sharedByRoute = new Map<string, KnowledgeBaseWithCount[]>()
  for (const row of (sharedResult.data ?? []) as SharedRow[]) {
    const base = basesById.get(row.knowledge_base_id)
    if (!base) continue
    const list = sharedByRoute.get(row.route_id) ?? []
    list.push(base)
    sharedByRoute.set(row.route_id, list)
  }

  return routes.map((route) => {
    const primary = route.primary_knowledge_base_id ? basesById.get(route.primary_knowledge_base_id) ?? null : null
    let status: VoiceIvrRouteView["status"] = "dynamic_tenant"
    if (route.knowledge_scope === "hub_selected") {
      if (!route.primary_knowledge_base_id) status = "missing_primary"
      else if (!primary) status = "invalid_reference"
      else if (primary.source_count < 1) status = "empty_primary"
      else status = "ready"
    }
    return {
      ...route,
      primary_knowledge_base: primary,
      shared_knowledge_bases: sharedByRoute.get(route.id) ?? [],
      status,
    }
  })
}

export async function getVoiceIvrRoute(
  hubPropertyId: string,
  intent: VoiceIvrIntent,
  productKey: VoiceProductKey,
): Promise<VoiceIvrRouteRecord | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("voice_ivr_routes")
    .select(
      "id, hub_property_id, ivr_path, intent_key, product_key, agent_label, knowledge_scope, primary_knowledge_base_id, crm_tool_key, fallback_mode, fallback_destination, is_active",
    )
    .eq("hub_property_id", hubPropertyId)
    .eq("intent_key", intent)
    .eq("product_key", productKey)
    .maybeSingle()
  if (error) throw error
  return (data as VoiceIvrRouteRecord | null) ?? null
}

export async function getVoiceIvrSharedBaseIds(routeId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("voice_ivr_route_shared_bases")
    .select("knowledge_base_id, position")
    .eq("route_id", routeId)
    .order("position", { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{ knowledge_base_id: string }>).map((row) => row.knowledge_base_id)
}

export async function updateVoiceIvrRoute(input: {
  hubPropertyId: string
  routeId: string
  agentLabel: string
  primaryKnowledgeBaseId: string | null
  sharedKnowledgeBaseIds: string[]
  fallbackDestination: string
  isActive: boolean
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.rpc("set_voice_ivr_route_configuration", {
    p_hub_property_id: input.hubPropertyId,
    p_route_id: input.routeId,
    p_agent_label: input.agentLabel,
    p_primary_knowledge_base_id: input.primaryKnowledgeBaseId,
    p_shared_knowledge_base_ids: input.sharedKnowledgeBaseIds,
    p_fallback_destination: input.fallbackDestination,
    p_is_active: input.isActive,
  })
  if (error) throw error
}
