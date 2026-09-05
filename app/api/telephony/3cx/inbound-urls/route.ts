import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { loadTelephonyRow, voiceInboundSecretOf } from "@/lib/telephony/config"
import { createVoiceAgentLinks } from "@/lib/telephony/voice-links"
import {
  getVoiceProduct,
  resolveVoiceKnowledgeBase,
  VOICE_4BID_FALLBACK_EXTENSION,
  VOICE_PRODUCTS,
} from "@/lib/telephony/voice-products"
import { isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import { getVoiceIvrRoutes, isMissingVoiceRoutingSchema } from "@/lib/telephony/voice-routing"
import { CUSTOMER_CODE_DIGITS } from "@/lib/telephony/customer-code"

const VOICE_INTERACTION_UX = {
  slow_tool_threshold_ms: 3_000,
  slow_tool_speech: "Un attimo per cortesia, verifico subito.",
  support_customer_code: {
    digits: CUSTOMER_CODE_DIGITS,
    input_modes: ["dtmf", "speech"],
  },
  prospect_qualification: {
    order: ["name", "email"],
    one_question_per_turn: true,
  },
} as const

/** Restituisce gli URL degli strumenti degli agenti vocali 3CX senza mai includere il segreto. */
export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const row = await loadTelephonyRow(propertyId)
    const secret = voiceInboundSecretOf(row)

    if (!row || !secret) {
      return NextResponse.json({ error: "Credenziale vocale non ancora predisposta." }, { status: 404 })
    }

    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
    const proto = request.headers.get("x-forwarded-proto") || "https"
    const base = forwardedHost ? `${proto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "")
    const root = base.replace(/\/+$/, "")
    const voiceQuery = `property=${encodeURIComponent(propertyId)}`
    const knowledgeBases = await getKnowledgeBases(propertyId)
    const voiceAgents = createVoiceAgentLinks({ rootUrl: root, propertyId, knowledgeBases })
    const supportHub = await isVoiceSupportHub(propertyId)

    const makeVoiceAgents = (endpoint: "prospect" | "support") => VOICE_PRODUCTS.map((product) => {
      const resolution = resolveVoiceKnowledgeBase(product, knowledgeBases)
      const knowledgeBase = resolution.ok
        ? {
            id: resolution.base.id,
            name: resolution.base.name,
            source_count: resolution.base.source_count,
            matched_by: resolution.matchedBy,
          }
        : null
      const status = !resolution.ok
        ? resolution.reason
        : resolution.base.source_count < 1
          ? "empty"
          : "ready"

      return {
        key: product.key,
        dtmf: product.dtmf,
        label: product.label,
        suggested_extension: product.suggestedExtension,
        fallback_extension: VOICE_4BID_FALLBACK_EXTENSION,
        status,
        knowledge_base: knowledgeBase,
        query_url: `${root}/api/telephony/3cx/voice/v1/${endpoint}?${voiceQuery}&product=${encodeURIComponent(product.key)}`,
      }
    })

    let configuredRoutes: Awaited<ReturnType<typeof getVoiceIvrRoutes>> = []
    let routingDiagnostic: string | null = null
    if (supportHub) {
      try {
        configuredRoutes = await getVoiceIvrRoutes(propertyId, knowledgeBases)
        if (configuredRoutes.length === 0) routingDiagnostic = "voice_routes_not_configured"
      } catch (error) {
        if (!isMissingVoiceRoutingSchema(error)) throw error
        routingDiagnostic = "voice_routing_schema_missing"
      }
    }

    const configuredAgents = configuredRoutes.flatMap((route) => {
      const product = getVoiceProduct(route.product_key)
      if (!product) return []
      const endpoint = route.intent_key === "customer_support" ? "support" : "prospect"
      return [{
        key: route.product_key,
        dtmf: product.dtmf,
        ivr_path: route.ivr_path,
        intent: route.intent_key,
        label: route.agent_label,
        suggested_extension: product.suggestedExtension,
        fallback_extension: route.fallback_destination,
        fallback_mode: route.fallback_mode,
        crm_tool: route.crm_tool_key,
        knowledge_scope: route.knowledge_scope,
        status: route.is_active ? route.status : "disabled",
        knowledge_base: route.primary_knowledge_base,
        shared_knowledge_bases: route.shared_knowledge_bases,
        query_url: `${root}/api/telephony/3cx/voice/v1/${endpoint}?${voiceQuery}&product=${encodeURIComponent(product.key)}`,
      }]
    })

    const prospectAgents = !supportHub
      ? []
      : configuredAgents.length > 0
        ? configuredAgents.filter((agent) => agent.intent === "prospect_information")
        : routingDiagnostic === "voice_routing_schema_missing"
          ? makeVoiceAgents("prospect")
          : []
    const customerSupportAgents = !supportHub
      ? []
      : configuredAgents.length > 0
        ? configuredAgents.filter((agent) => agent.intent === "customer_support")
        : routingDiagnostic === "voice_routing_schema_missing"
          ? makeVoiceAgents("support")
          : []

    return NextResponse.json({
      support_hub: supportHub,
      configuration_mode: supportHub ? "4bid_advanced" : "tenant_easy",
      interaction_ux: VOICE_INTERACTION_UX,
      voice_agents: voiceAgents,
      prospect_agents: prospectAgents,
      customer_support_agents: customerSupportAgents,
      voice_routing_diagnostic: routingDiagnostic,
      customer_support_message_urls: supportHub
        ? Object.fromEntries(
            VOICE_PRODUCTS.map((product) => [
              product.key,
              `${root}/api/telephony/3cx/voice/v1/support/message?${voiceQuery}&product=${encodeURIComponent(product.key)}`,
            ]),
          )
        : {},
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
