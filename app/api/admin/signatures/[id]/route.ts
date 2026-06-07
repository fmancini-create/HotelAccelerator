import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { sanitizeSignatureHtml } from "@/lib/html-sanitize"

const EXPECTED_AUTH = ["Non autenticato", "nessun tenant", "non associato"]
function isExpectedAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return EXPECTED_AUTH.some((m) => msg.includes(m))
}

async function resolveProperty(request: NextRequest): Promise<{ propertyId?: string; status?: number }> {
  try {
    return { propertyId: await getAuthenticatedPropertyId(request) }
  } catch (error) {
    if (isExpectedAuthError(error)) return { status: 401 }
    console.error("[v0] signature [id] auth error:", error)
    return { status: 500 }
  }
}

// PUT /api/admin/signatures/[id] — update a signature
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { propertyId, status } = await resolveProperty(request)
  if (!propertyId) return NextResponse.json({ error: "Non autorizzato" }, { status: status ?? 401 })

  try {
    const supabase = createServiceClient()
    const body = await request.json()

    // Ensure the signature belongs to this tenant.
    const { data: existing } = await supabase
      .from("email_signatures")
      .select("id")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: "Firma non trovata" }, { status: 404 })
    }

    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) {
      const name = body.name.toString().trim()
      if (!name) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 })
      update.name = name
    }
    if (body.html !== undefined) update.html = sanitizeSignatureHtml(body.html.toString())

    const channelId: string | null | undefined =
      body.channel_id === undefined ? undefined : body.channel_id || null
    if (channelId !== undefined) update.channel_id = channelId

    if (body.is_default !== undefined) {
      update.is_default = Boolean(body.is_default)
      if (update.is_default) {
        // Clear other defaults in the same channel scope.
        const scopeChannel = channelId !== undefined ? channelId : null
        const clearQuery = supabase
          .from("email_signatures")
          .update({ is_default: false })
          .eq("property_id", propertyId)
          .neq("id", id)
        if (scopeChannel) await clearQuery.eq("channel_id", scopeChannel)
        else await clearQuery.is("channel_id", null)
      }
    }

    const { data, error } = await supabase
      .from("email_signatures")
      .update(update)
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("id, name, html, channel_id, is_default, created_at, updated_at")
      .single()

    if (error) throw error
    return NextResponse.json({ signature: data })
  } catch (error: any) {
    console.error("[v0] signature PUT error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/admin/signatures/[id] — remove a signature (assignments cascade)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { propertyId, status } = await resolveProperty(request)
  if (!propertyId) return NextResponse.json({ error: "Non autorizzato" }, { status: status ?? 401 })

  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("email_signatures")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] signature DELETE error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
