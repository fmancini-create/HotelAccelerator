import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import {
  deleteKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  type AiMode,
  type KnowledgeBasePatch,
} from "@/lib/ai/knowledge-bases"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODES: AiMode[] = ["disabled", "on_request", "autopilot"]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ baseId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { baseId } = await params
    if (!UUID.test(baseId)) {
      return NextResponse.json({ error: "baseId non valido" }, { status: 400 })
    }

    const existing = await getKnowledgeBase(baseId, propertyId)
    if (!existing) {
      return NextResponse.json({ error: "Base non trovata" }, { status: 404 })
    }

    const body = await request.json()
    const patch: KnowledgeBasePatch = {}
    if (typeof body.name === "string") patch.name = body.name.slice(0, 200)
    if (typeof body.description === "string" || body.description === null) patch.description = body.description
    if (MODES.includes(body.mode)) patch.mode = body.mode as AiMode
    if (typeof body.language === "string") patch.language = body.language
    if (typeof body.persona === "string" || body.persona === null) patch.persona = body.persona
    if (typeof body.confidence_threshold === "number") {
      patch.confidence_threshold = Math.min(1, Math.max(0, body.confidence_threshold))
    }
    if (typeof body.fallback_message === "string" || body.fallback_message === null) {
      patch.fallback_message = body.fallback_message
    }

    const base = await updateKnowledgeBase(baseId, propertyId, patch)
    return NextResponse.json({ base })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ baseId: string }> }) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { baseId } = await params
    if (!UUID.test(baseId)) {
      return NextResponse.json({ error: "baseId non valido" }, { status: 400 })
    }
    await deleteKnowledgeBase(baseId, propertyId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
