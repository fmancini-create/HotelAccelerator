import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { getAiAgentIdentity, DEFAULT_AI_AGENT_NAME } from "@/lib/ai/agent-identity"
import { sanitizeSignatureHtml } from "@/lib/html-sanitize"

export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const identity = await getAiAgentIdentity(supabase, propertyId)
    return NextResponse.json(identity)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore lettura agente IA" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const body = await request.json()
    const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : ""
    const rawSignature = typeof body?.signature_html === "string" ? body.signature_html : ""

    if (!displayName || displayName.length > 80) {
      return NextResponse.json({ error: "Il nome dell'agente IA deve contenere da 1 a 80 caratteri" }, { status: 400 })
    }

    const signatureHtml = rawSignature.trim() ? sanitizeSignatureHtml(rawSignature) : null
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("ai_agent_settings")
      .upsert(
        {
          property_id: propertyId,
          display_name: displayName || DEFAULT_AI_AGENT_NAME,
          signature_html: signatureHtml,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id" },
      )

    if (error) throw error

    return NextResponse.json(await getAiAgentIdentity(supabase, propertyId))
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore salvataggio agente IA" },
      { status: accessErrorStatus(error) },
    )
  }
}
