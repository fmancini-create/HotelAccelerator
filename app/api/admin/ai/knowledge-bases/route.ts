import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createKnowledgeBase, getKnowledgeBases, type AiMode } from "@/lib/ai/knowledge-bases"

export const dynamic = "force-dynamic"

const MODES: AiMode[] = ["disabled", "on_request", "autopilot"]

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const bases = await getKnowledgeBases(propertyId)
    return NextResponse.json({ bases })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Il nome della base è obbligatorio" }, { status: 400 })
    }
    const mode = MODES.includes(body.mode) ? (body.mode as AiMode) : "disabled"

    const base = await createKnowledgeBase(propertyId, {
      name: name.slice(0, 200),
      description: typeof body.description === "string" ? body.description.slice(0, 1000) : null,
      mode,
      language: typeof body.language === "string" ? body.language : "it",
      persona: typeof body.persona === "string" ? body.persona.slice(0, 4000) : null,
      confidence_threshold:
        typeof body.confidence_threshold === "number" ? body.confidence_threshold : undefined,
      fallback_message: typeof body.fallback_message === "string" ? body.fallback_message.slice(0, 2000) : null,
    })
    return NextResponse.json({ base }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
