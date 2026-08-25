import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
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
  const bases = await getKnowledgeBases(propertyId)
  const routes = await getVoiceIvrRoutes(propertyId, bases)
  return { routes, knowledge_bases: bases }
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
