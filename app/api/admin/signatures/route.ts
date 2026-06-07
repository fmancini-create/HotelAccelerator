import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { sanitizeSignatureHtml } from "@/lib/html-sanitize"

// Expected/auth errors that should not be logged as real failures.
const EXPECTED_AUTH = ["Non autenticato", "nessun tenant", "non associato"]
function isExpectedAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return EXPECTED_AUTH.some((m) => msg.includes(m))
}

// GET /api/admin/signatures
// Returns the tenant's signature library, each with its assignments.
export async function GET(request: NextRequest) {
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch (error) {
    if (isExpectedAuthError(error)) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }
    console.error("[v0] signatures GET auth error:", error)
    return NextResponse.json({ error: "Errore di autenticazione" }, { status: 500 })
  }

  try {
    const supabase = createServiceClient()

    const { data: signatures, error } = await supabase
      .from("email_signatures")
      .select("id, name, html, channel_id, is_default, created_at, updated_at")
      .eq("property_id", propertyId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) throw error

    const { data: assignments, error: aErr } = await supabase
      .from("email_signature_assignments")
      .select("id, signature_id, target_type, target_id, channel_id")
      .eq("property_id", propertyId)

    if (aErr) throw aErr

    const byId = new Map((signatures ?? []).map((s) => [s.id, { ...s, assignments: [] as any[] }]))
    for (const a of assignments ?? []) {
      byId.get(a.signature_id)?.assignments.push(a)
    }

    return NextResponse.json({ signatures: Array.from(byId.values()) })
  } catch (error: any) {
    console.error("[v0] signatures GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/admin/signatures
// Creates a new signature in the tenant library.
export async function POST(request: NextRequest) {
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch (error) {
    if (isExpectedAuthError(error)) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }
    console.error("[v0] signatures POST auth error:", error)
    return NextResponse.json({ error: "Errore di autenticazione" }, { status: 500 })
  }

  try {
    const supabase = createServiceClient()
    const body = await request.json()

    const name: string = (body.name ?? "").toString().trim()
    if (!name) {
      return NextResponse.json({ error: "Il nome della firma è obbligatorio" }, { status: 400 })
    }
    const html = sanitizeSignatureHtml((body.html ?? "").toString())
    const channelId: string | null = body.channel_id || null
    const isDefault = Boolean(body.is_default)

    // Validate channel belongs to this tenant when provided.
    if (channelId) {
      const { data: ch } = await supabase
        .from("email_channels")
        .select("id")
        .eq("id", channelId)
        .eq("property_id", propertyId)
        .maybeSingle()
      if (!ch) {
        return NextResponse.json({ error: "Casella email non valida" }, { status: 400 })
      }
    }

    // If marking default, clear any existing default in the same channel scope.
    if (isDefault) {
      const clearQuery = supabase
        .from("email_signatures")
        .update({ is_default: false })
        .eq("property_id", propertyId)
      if (channelId) {
        await clearQuery.eq("channel_id", channelId)
      } else {
        await clearQuery.is("channel_id", null)
      }
    }

    const { data, error } = await supabase
      .from("email_signatures")
      .insert({
        property_id: propertyId,
        name,
        html,
        channel_id: channelId,
        is_default: isDefault,
      })
      .select("id, name, html, channel_id, is_default, created_at, updated_at")
      .single()

    if (error) throw error

    return NextResponse.json({ signature: { ...data, assignments: [] } })
  } catch (error: any) {
    console.error("[v0] signatures POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
