import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { getInternalKnowledgeSyncDiagnostics } from "@/lib/ai/internal-knowledge-sync-status"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import {
  getVoiceIvrRoutes,
  isMissingVoiceRoutingSchema,
  updateVoiceIvrRoute,
} from "@/lib/telephony/voice-routing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" }
const UUID = z.string().uuid()
const requestSchema = z.object({
  route_id: UUID,
  agent_label: z.string().trim().min(1).max(120),
  primary_knowledge_base_id: UUID.nullable(),
  shared_knowledge_base_ids: z.array(UUID).max(10).default([]),
  fallback_destination: z.string().trim().regex(/^[A-Za-z0-9*#+._-]{1,30}$/),
  is_active: z.boolean(),
})

async function requireVoiceRoutingAdmin(request: NextRequest) {
  await requireAreaApi("settings", request)
  const identity = await requireTenantAdmin(request)
  if (!identity.isSuperAdmin) {
    const error = new Error("Accesso negato: la mappa IVR 4 BID è riservata al superadmin")
    ;(error as Error & { status: number }).status = 403
    error.name = "AccessError"
    throw error
  }
  if (!(await isVoiceSupportHub(identity.propertyId))) {
    const error = new Error("Seleziona il tenant aziendale 4 BID")
    ;(error as Error & { status: number }).status = 409
    error.name = "AccessError"
    throw error
  }
  return identity.propertyId
}

async function payload(propertyId: string) {
  const [bases, syncDiagnostics] = await Promise.all([
    getKnowledgeBases(propertyId),
    getInternalKnowledgeSyncDiagnostics(propertyId),
  ])
  const routes = await getVoiceIvrRoutes(propertyId, bases)
  return {
    routes,
    knowledge_bases: bases,
    internal_sync_available: syncDiagnostics.schemaAvailable,
    internal_sources: syncDiagnostics.schemaAvailable
      ? syncDiagnostics.sources.map((source) => ({
          product_key: source.productKey,
          knowledge_base_id: source.knowledgeBaseId,
          status: source.status,
        }))
      : [],
  }
}

function errorResponse(error: unknown) {
  if (isMissingVoiceRoutingSchema(error)) {
    return NextResponse.json(
      { error: "La migrazione della mappa IVR non è ancora applicata.", diagnostic_code: "voice_routing_schema_missing" },
      { status: 503, headers: NO_STORE },
    )
  }
  const explicitStatus = (error as { status?: number } | null)?.status
  const status = explicitStatus ?? accessErrorStatus(error)
  const message = status >= 500 ? "Errore durante la configurazione IVR." : error instanceof Error ? error.message : "Accesso negato"
  return NextResponse.json({ error: message }, { status, headers: NO_STORE })
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await requireVoiceRoutingAdmin(request)
    return NextResponse.json(await payload(propertyId), { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const propertyId = await requireVoiceRoutingAdmin(request)
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: "Corpo JSON non valido" }, { status: 400, headers: NO_STORE })
    }
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "Configurazione IVR non valida" }, { status: 400, headers: NO_STORE })
    }
    if (new Set(parsed.data.shared_knowledge_base_ids).size !== parsed.data.shared_knowledge_base_ids.length) {
      return NextResponse.json({ error: "Una base condivisa è presente più volte" }, { status: 400, headers: NO_STORE })
    }

    const current = await payload(propertyId)
    const route = current.routes.find((candidate) => candidate.id === parsed.data.route_id)
    if (!route) {
      return NextResponse.json({ error: "Percorso IVR non trovato" }, { status: 404, headers: NO_STORE })
    }

    if (route.knowledge_scope === "hub_selected") {
      const primaryKnowledgeBaseId = parsed.data.primary_knowledge_base_id
      if (!current.internal_sync_available) {
        return NextResponse.json(
          { error: "La migrazione delle fonti interne non è ancora applicata." },
          { status: 503, headers: NO_STORE },
        )
      }

      const primarySource = current.internal_sources.find(
        (source) => source.product_key === route.product_key && source.knowledge_base_id === primaryKnowledgeBaseId,
      )
      if (!primaryKnowledgeBaseId || !primarySource || primarySource.status !== "ready") {
        return NextResponse.json(
          { error: "La base primaria deve essere la fonte interna pronta del prodotto selezionato." },
          { status: 409, headers: NO_STORE },
        )
      }

      const readyInternalBaseIds = new Set(
        current.internal_sources
          .filter((source) => source.status === "ready")
          .map((source) => source.knowledge_base_id),
      )
      if (
        parsed.data.shared_knowledge_base_ids.includes(primaryKnowledgeBaseId)
        || parsed.data.shared_knowledge_base_ids.some((baseId) => !readyInternalBaseIds.has(baseId))
      ) {
        return NextResponse.json(
          { error: "Le basi condivise devono essere fonti interne pronte e diverse dalla primaria." },
          { status: 409, headers: NO_STORE },
        )
      }
    }

    await updateVoiceIvrRoute({
      hubPropertyId: propertyId,
      routeId: parsed.data.route_id,
      agentLabel: parsed.data.agent_label,
      primaryKnowledgeBaseId: parsed.data.primary_knowledge_base_id,
      sharedKnowledgeBaseIds: parsed.data.shared_knowledge_base_ids,
      fallbackDestination: parsed.data.fallback_destination,
      isActive: parsed.data.is_active,
    })
    return NextResponse.json(await payload(propertyId), { headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}
