import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAiSettings, upsertAiSettings, type AiMode } from "@/lib/ai/settings"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const settings = await getAiSettings(propertyId)
    return NextResponse.json({ settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const patch: Parameters<typeof upsertAiSettings>[1] = {}

    if (typeof body.mode === "string" && ["disabled", "on_request", "autopilot"].includes(body.mode)) {
      patch.mode = body.mode as AiMode
    }
    if (body.channels && typeof body.channels === "object") {
      patch.channels = {
        telegram: !!body.channels.telegram,
        whatsapp: !!body.channels.whatsapp,
        email: !!body.channels.email,
      }
    }
    if (typeof body.persona === "string") patch.persona = body.persona.slice(0, 4000) || null
    if (typeof body.language === "string" && body.language.trim()) patch.language = body.language.trim().slice(0, 10)
    if (typeof body.confidence_threshold === "number") {
      patch.confidence_threshold = Math.min(0.95, Math.max(0, body.confidence_threshold))
    }
    if (typeof body.fallback_message === "string") patch.fallback_message = body.fallback_message.slice(0, 1000) || null

    const settings = await upsertAiSettings(propertyId, patch)
    return NextResponse.json({ settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
