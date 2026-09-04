import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { getKnowledgeBase } from "@/lib/ai/knowledge-bases"
import { getAiAgentIdentity, defaultAiVirtualUserName } from "@/lib/ai/agent-identity"
import { sanitizeSignatureHtml } from "@/lib/html-sanitize"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveBase(request: NextRequest, baseId: string) {
  const { propertyId } = await requireTenantAdmin(request)
  if (!UUID.test(baseId)) {
    throw new Error("baseId non valido")
  }

  const base = await getKnowledgeBase(baseId, propertyId)
  if (!base) {
    throw new Error("Base non trovata")
  }

  return { propertyId, base }
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : ""
  if (message === "baseId non valido") return 400
  if (message === "Base non trovata") return 404
  return accessErrorStatus(error)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ baseId: string }> }) {
  try {
    const { baseId } = await params
    const { propertyId } = await resolveBase(request, baseId)
    const supabase = createServiceClient()
    return NextResponse.json(await getAiAgentIdentity(supabase, propertyId, baseId))
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore lettura utente virtuale IA" },
      { status: errorStatus(error) },
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ baseId: string }> }) {
  try {
    const { baseId } = await params
    const { propertyId, base } = await resolveBase(request, baseId)
    const body = await request.json()
    const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : ""
    const rawSignature = typeof body?.signature_html === "string" ? body.signature_html : ""

    if (!displayName || displayName.length > 80) {
      return NextResponse.json(
        { error: "Il nome dell'utente virtuale IA deve contenere da 1 a 80 caratteri" },
        { status: 400 },
      )
    }

    const signatureHtml = rawSignature.trim() ? sanitizeSignatureHtml(rawSignature) : null
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("ai_virtual_users")
      .upsert(
        {
          property_id: propertyId,
          knowledge_base_id: baseId,
          display_name: displayName || defaultAiVirtualUserName(base.name),
          signature_html: signatureHtml,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "knowledge_base_id" },
      )

    if (error) throw error

    return NextResponse.json(await getAiAgentIdentity(supabase, propertyId, baseId))
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore salvataggio utente virtuale IA" },
      { status: errorStatus(error) },
    )
  }
}
