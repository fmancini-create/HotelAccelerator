import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

const EXPECTED_AUTH = ["Non autenticato", "nessun tenant", "non associato"]
function isExpectedAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return EXPECTED_AUTH.some((m) => msg.includes(m))
}

interface IncomingAssignment {
  target_type: "user" | "group"
  target_id: string
  channel_id?: string | null
}

// PUT /api/admin/signatures/[id]/assignments
// Replaces the full set of assignments for this signature.
// Body: { assignments: [{ target_type, target_id, channel_id? }] }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch (error) {
    if (isExpectedAuthError(error)) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }
    console.error("[v0] assignments PUT auth error:", error)
    return NextResponse.json({ error: "Errore di autenticazione" }, { status: 500 })
  }

  try {
    const supabase = createServiceClient()

    // Verify the signature belongs to this tenant.
    const { data: sig } = await supabase
      .from("email_signatures")
      .select("id")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (!sig) {
      return NextResponse.json({ error: "Firma non trovata" }, { status: 404 })
    }

    const body = await request.json()
    const incoming: IncomingAssignment[] = Array.isArray(body.assignments) ? body.assignments : []

    // Basic validation + normalization.
    const rows = incoming
      .filter((a) => (a.target_type === "user" || a.target_type === "group") && a.target_id)
      .map((a) => ({
        property_id: propertyId,
        signature_id: id,
        target_type: a.target_type,
        target_id: a.target_id,
        channel_id: a.channel_id || null,
      }))

    // Remove the unique-conflict source: a given (target, channel scope) can map
    // to only one signature. Clear any assignment of these targets on OTHER
    // signatures first so reassigning moves it here instead of erroring.
    for (const r of rows) {
      const del = supabase
        .from("email_signature_assignments")
        .delete()
        .eq("property_id", propertyId)
        .eq("target_type", r.target_type)
        .eq("target_id", r.target_id)
      if (r.channel_id) await del.eq("channel_id", r.channel_id)
      else await del.is("channel_id", null)
    }

    // Replace this signature's own assignments.
    await supabase.from("email_signature_assignments").delete().eq("signature_id", id)

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("email_signature_assignments").insert(rows)
      if (insErr) throw insErr
    }

    const { data: saved } = await supabase
      .from("email_signature_assignments")
      .select("id, signature_id, target_type, target_id, channel_id")
      .eq("signature_id", id)

    return NextResponse.json({ assignments: saved ?? [] })
  } catch (error: any) {
    console.error("[v0] assignments PUT error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
